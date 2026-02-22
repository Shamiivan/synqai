import { Thread } from "@synqai/human-loop";
import type { SupervisorDependencies, Logger } from "@synqai/contracts";

const MAX_TURNS = 10;
const TODAY = new Date().toISOString().split("T")[0];

export interface AgentResult {
  thread: Thread;
  intent: string;
  message?: string;
  currentAgent?: string;
}

export function createSupervisor(dependencies: SupervisorDependencies) {
  return {
    run: (thread: Thread) => supervisorLoop(thread, dependencies),
  };
}

async function supervisorLoop(
  thread: Thread,
  deps: SupervisorDependencies,
): Promise<AgentResult> {
  const { baml, agents, log } = deps;
  const artifacts: Record<string, unknown> = {};

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const serialized = thread.serializeCompact(3);
    const nextStep = (await baml.supervisorNextStep(
      serialized,
      TODAY,
      JSON.stringify(artifacts),
    )) as any;

    log.info("supervisor_step", { intent: nextStep.intent, turn });
    thread.events.push({ type: "tool_call", data: nextStep });

    // ── Exit intents ──
    if (nextStep.intent === "request_info") {
      return { thread, intent: "request_info", message: nextStep.question };
    }
    if (nextStep.intent === "done") {
      return { thread, intent: "done", message: nextStep.message };
    }

    // ── Dispatch to subagent ──
    const agentName = nextStep.intent.replace("run_", "");
    const runner = agents[agentName];
    if (!runner) {
      thread.events.push({
        type: "tool_response",
        data: { status: "error", message: `Unknown agent: ${agentName}` },
      });
      continue;
    }

    // Fresh subagent thread — context isolation
    const subThread = new Thread();
    if (Object.keys(artifacts).length > 0) {
      subThread.events.push({
        type: "tool_response",
        data: { _context: "artifacts", ...artifacts },
      });
    }
    subThread.events.push({ type: "user_input", data: nextStep.task });

    const result = await runner(subThread, log.child(agentName));
    const subIntent = getLastIntent(result);
    const subMessage = getLastMessage(result);

    // Extract artifacts from subagent results
    for (const e of result.events) {
      if (e.type === "tool_response" && typeof e.data === "object" && e.data && !e.data.error) {
        for (const [k, v] of Object.entries(e.data as Record<string, unknown>)) {
          if (/[Ii]d$/.test(k) || /[Uu]rl$/.test(k) || k === "title" || k === "name") {
            artifacts[k] = v;
          }
        }
      }
    }

    // ── FAST PATH: single-domain, first turn, success → skip final supervisor call ──
    if (turn === 0 && subIntent === "done" && subMessage) {
      thread.events.push({
        type: "tool_response",
        data: { status: "success", message: subMessage, artifacts },
      });
      thread.events.push({
        type: "tool_call",
        data: { intent: "done", message: subMessage },
      });
      return { thread, intent: "done", message: subMessage, currentAgent: agentName };
    }

    // Push subagent result for supervisor's next turn
    if (subIntent === "request_info") {
      // Subagent needs human input — bubble up
      thread.events.push({
        type: "tool_response",
        data: { status: "needs_info", question: subMessage },
      });
      // Supervisor should ask the user
      thread.events.push({
        type: "tool_call",
        data: { intent: "request_info", question: subMessage ?? "Need more information" },
      });
      return {
        thread,
        intent: "request_info",
        message: subMessage,
        currentAgent: "supervisor",
      };
    } else if (subIntent === "done") {
      thread.events.push({
        type: "tool_response",
        data: { status: "success", message: subMessage, artifacts },
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
    data: { intent: "done", message: "Reached maximum supervisor turns." },
  });
  return { thread, intent: "done", message: "Reached maximum supervisor turns." };
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
