import { Thread } from "@synqai/human-loop";
import type { GmailAgentDependencies, GmailTools, Logger } from "@synqai/contracts";

const MAX_TURNS = 20;
const TOKEN_WARN = 15_000;
const TOKEN_HARD_STOP = 25_000;
const TODAY = new Date().toISOString().split("T")[0];

export function createGmailAgent(dependencies: GmailAgentDependencies) {
  return {
    run: (thread: Thread, log?: Logger) =>
      agentLoop(thread, { ...dependencies, log: log ?? dependencies.log }),
  };
}

/**
 * Runs the gmail BAML loop. Returns the thread when it hits
 * request_info (needs human) or done (task complete). Never blocks.
 */
async function agentLoop(thread: Thread, deps: GmailAgentDependencies): Promise<Thread> {
  const { baml, tools, log } = deps;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // ── Context window guard ──
    const serialized = thread.serializeForLLM();
    const estimatedTokens = Math.ceil(serialized.length / 4);

    if (estimatedTokens > TOKEN_HARD_STOP) {
      log.info("context_overflow", { estimatedTokens, turn });
      thread.events.push({
        type: "tool_call",
        data: { intent: "done", message: "Conversation is too long. Please start a new request." },
      });
      return thread;
    }

    if (estimatedTokens > TOKEN_WARN) {
      log.info("context_warning", { estimatedTokens, turn });
    }

    // ── LLM call ──
    const nextStep = await baml.gmailNextStep(serialized, TODAY) as any;
    log.info("step", { intent: nextStep.intent, turn });
    thread.events.push({ type: "tool_call", data: nextStep });

    // ── Exit intents (no tool call) ──
    if (nextStep.intent === "request_info" || nextStep.intent === "done") {
      return thread;
    }

    // ── Tool dispatch with lifecycle logging ──
    const start = Date.now();
    let result: unknown;
    let success = true;

    try {
      switch (nextStep.intent) {
        case "list_emails":
          result = await tools.handleListEmails(nextStep);
          break;
        case "read_email":
          result = await tools.handleReadEmail(nextStep);
          break;
        case "send_email":
          result = await tools.handleSendEmail(nextStep);
          break;
        case "reply_to_email":
          result = await tools.handleReplyToEmail(nextStep);
          break;
        case "create_draft":
          result = await tools.handleCreateDraft(nextStep);
          break;
        default:
          result = { error: { code: "unknown", reason: "unknown_intent", message: `Unknown intent: ${(nextStep as any).intent}` } };
          success = false;
      }
    } catch (err: any) {
      result = { error: { code: "unknown", reason: "unhandled", message: err.message } };
      success = false;
    }

    const durationMs = Date.now() - start;

    if (result && typeof result === "object" && "error" in (result as any)) {
      success = false;
      log.info("tool_error", { intent: nextStep.intent, turn, durationMs, error: (result as any).error });
    } else {
      log.info("tool_end", { intent: nextStep.intent, turn, durationMs, success });
    }

    thread.events.push({ type: "tool_response", data: result });
  }

  thread.events.push({
    type: "tool_call",
    data: { intent: "done", message: "Reached maximum turns. Please try again with a simpler request." },
  });
  return thread;
}

/** Read the last tool_call's intent from a thread. */
export function getLastIntent(thread: Thread): string {
  for (let i = thread.events.length - 1; i >= 0; i--) {
    if (thread.events[i].type === "tool_call") {
      return thread.events[i].data?.intent ?? "unknown";
    }
  }
  return "unknown";
}

/** Read the last tool_call's message field (for request_info/done). */
export function getLastMessage(thread: Thread): string | undefined {
  for (let i = thread.events.length - 1; i >= 0; i--) {
    if (thread.events[i].type === "tool_call") {
      return thread.events[i].data?.message;
    }
  }
  return undefined;
}
