import { Thread } from "@synqai/human-loop";
import { b } from "../baml_client";
import {
  handleCreateEvent,
  handleListEvents,
  handleGetEvent,
  handleUpdateEvent,
  handleDeleteEvent,
  handleCheckAvailability,
  handleQuickAdd,
} from "./tools";

const MAX_TURNS = 20;
const TOKEN_WARN = 15_000;
const TOKEN_HARD_STOP = 25_000;
const TODAY = new Date().toISOString().split("T")[0];

/** Minimal logger interface — avoids importing from router. */
interface MinimalLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  child?(name: string): MinimalLogger;
}

/**
 * Runs the calendar BAML loop. Returns the thread when it hits
 * request_info (needs human) or done (task complete). Never blocks.
 */
export async function agentLoop(thread: Thread, deps?: { log?: MinimalLogger }): Promise<Thread> {
  const log = deps?.log;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // ── Context window guard ──
    const serialized = thread.serializeForLLM();
    const estimatedTokens = Math.ceil(serialized.length / 4);

    if (estimatedTokens > TOKEN_HARD_STOP) {
      log?.info("context_overflow", { estimatedTokens, turn });
      thread.events.push({
        type: "tool_call",
        data: { intent: "done", message: "Conversation is too long. Please start a new request." },
      });
      return thread;
    }

    if (estimatedTokens > TOKEN_WARN) {
      log?.info("context_warning", { estimatedTokens, turn });
    }

    // ── LLM call ──
    const nextStep = await b.CalendarNextStep(serialized, TODAY);
    log?.info("step", { intent: nextStep.intent, turn });
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
        case "create_event":
          result = await handleCreateEvent(nextStep);
          break;
        case "list_events":
          result = await handleListEvents(nextStep);
          break;
        case "get_event":
          result = await handleGetEvent(nextStep);
          break;
        case "update_event":
          result = await handleUpdateEvent(nextStep);
          break;
        case "delete_event":
          result = await handleDeleteEvent(nextStep);
          break;
        case "check_availability":
          result = await handleCheckAvailability(nextStep);
          break;
        case "quick_add":
          result = await handleQuickAdd(nextStep);
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

    // Check if the tool handler itself returned an error
    if (result && typeof result === "object" && "error" in (result as any)) {
      success = false;
      log?.info("tool_error", { intent: nextStep.intent, turn, durationMs, error: (result as any).error });
    } else {
      log?.info("tool_end", { intent: nextStep.intent, turn, durationMs, success });
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
