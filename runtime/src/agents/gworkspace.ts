import { Thread } from "@synqai/human-loop";
import type { GWorkspaceDependencies, Logger, Artifact } from "@synqai/contracts";

const MAX_TURNS = 10;
const TODAY = new Date().toISOString().split("T")[0];

export interface AgentResult {
  thread: Thread;
  intent: string;
  message?: string;
  currentAgent?: string;
}

export function createGWorkspaceAgent(dependencies: GWorkspaceDependencies) {
  return {
    run: (thread: Thread, log?: Logger) =>
      gworkspaceLoop(thread, { ...dependencies, log: log ?? dependencies.log }),
  };
}

// ── Artifact helpers ──

function formatArtifactsForLLM(artifacts: Artifact[]): string {
  if (artifacts.length === 0) return "[]";
  return JSON.stringify(
    artifacts.map((a) => ({ ref: a.ref, kind: a.kind, label: a.label })),
  );
}

// ── Main loop ──

async function gworkspaceLoop(
  thread: Thread,
  deps: GWorkspaceDependencies,
): Promise<AgentResult> {
  const { baml, agents, log } = deps;
  const artifacts: Artifact[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const serialized = thread.serializeCompact(3);
    let nextStep: any;
    try {
      nextStep = (await baml.gworkspaceNextStep(
        serialized,
        TODAY,
        formatArtifactsForLLM(artifacts),
      )) as any;
    } catch (err: any) {
      log.info("llm_error", { turn, error: err.message });
      thread.events.push({
        type: "tool_response",
        data: { error: { message: "Failed to parse response. Please reply in JSON.", code: "llm_parse", retryable: true } },
      });
      continue;
    }

    log.info("gworkspace_step", { intent: nextStep.intent, turn, step: nextStep });
    thread.events.push({ type: "tool_call", data: nextStep });

    // ── Exit intents ──
    if (nextStep.intent === "request_info") {
      return { thread, intent: "request_info", message: nextStep.question };
    }
    if (nextStep.intent === "done") {
      return { thread, intent: "done", message: nextStep.message };
    }

    // ── Dispatch to domain agent ──
    const agentName = nextStep.intent.replace("run_", "");
    const runner = agents[agentName];
    if (!runner) {
      thread.events.push({
        type: "tool_response",
        data: { status: "error", message: `Unknown agent: ${agentName}` },
      });
      continue;
    }

    // Fresh domain thread — context isolation, with typed artifact handoff
    const subThread = new Thread();
    if (artifacts.length > 0) {
      subThread.events.push({
        type: "tool_response",
        data: {
          _context: "handoff",
          artifacts: artifacts.map((a) => ({
            ref: a.ref, kind: a.kind, label: a.label,
          })),
        },
      });
    }
    subThread.events.push({ type: "user_input", data: nextStep.task });

    const result = await runner(subThread, log.child(agentName));
    const subIntent = getLastIntent(result);
    const subMessage = getLastMessage(result);

    // Collect typed artifacts from domain agent results
    for (const e of result.events) {
      if (e.type === "tool_response" && Array.isArray(e.data?.artifacts)) {
        for (const a of e.data.artifacts) {
          // Dedupe by ref
          if (a.ref && !artifacts.some((existing) => existing.ref === a.ref)) {
            artifacts.push(a);
          }
        }
      }
    }

    const artifactsSummary = formatArtifactsForLLM(artifacts);

    // ── FAST PATH: single-domain, first turn, success → skip final LLM call ──
    if (turn === 0 && subIntent === "done" && subMessage) {
      thread.events.push({
        type: "tool_response",
        data: { status: "success", message: subMessage, artifacts: artifactsSummary },
      });
      thread.events.push({
        type: "tool_call",
        data: { intent: "done", message: subMessage },
      });
      return { thread, intent: "done", message: subMessage, currentAgent: "gworkspace" };
    }

    // Push domain agent result for next turn
    if (subIntent === "request_info") {
      thread.events.push({
        type: "tool_response",
        data: { status: "needs_info", question: subMessage },
      });
      thread.events.push({
        type: "tool_call",
        data: { intent: "request_info", question: subMessage ?? "Need more information" },
      });
      return {
        thread,
        intent: "request_info",
        message: subMessage,
        currentAgent: "gworkspace",
      };
    } else if (subIntent === "done") {
      thread.events.push({
        type: "tool_response",
        data: { status: "success", message: subMessage, artifacts: artifactsSummary },
      });
    } else {
      thread.events.push({
        type: "tool_response",
        data: { status: "error", message: subMessage || "Agent returned unexpected state" },
      });
    }
  }

  // Max turns reached
  thread.events.push({
    type: "tool_call",
    data: { intent: "done", message: "Reached maximum turns." },
  });
  return { thread, intent: "done", message: "Reached maximum turns." };
}

function getLastIntent(thread: Thread): string {
  for (let i = thread.events.length - 1; i >= 0; i--) {
    if (thread.events[i].type === "tool_call") {
      return thread.events[i].data?.intent ?? "unknown";
    }
  }
  return "unknown";
}

function getLastMessage(thread: Thread): string | undefined {
  for (let i = thread.events.length - 1; i >= 0; i--) {
    if (thread.events[i].type === "tool_call") {
      return thread.events[i].data?.message ?? thread.events[i].data?.question;
    }
  }
  return undefined;
}
