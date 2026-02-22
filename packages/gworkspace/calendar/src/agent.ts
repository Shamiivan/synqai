import { Thread } from "@synqai/human-loop";
import { b } from "../baml_client";
import { handleCreateEvent, handleListEvents } from "./tools";

const MAX_TURNS = 20;
const TODAY = new Date().toISOString().split("T")[0];

/** Minimal logger interface — avoids importing from router. */
interface MinimalLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
}

/**
 * Runs the calendar BAML loop. Returns the thread when it hits
 * request_info (needs human) or done (task complete). Never blocks.
 */
export async function agentLoop(thread: Thread, deps?: { log?: MinimalLogger }): Promise<Thread> {
  const log = deps?.log;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const nextStep = await b.CalendarNextStep(thread.serializeForLLM(), TODAY);
    log?.info("Step", { intent: nextStep.intent, turn });

    thread.events.push({ type: "tool_call", data: nextStep });

    switch (nextStep.intent) {
      case "request_info":
      case "done":
        return thread;
      case "create_event": {
        const result = await handleCreateEvent(nextStep);
        thread.events.push({ type: "tool_response", data: result });
        break;
      }
      case "list_events": {
        const result = await handleListEvents(nextStep);
        thread.events.push({ type: "tool_response", data: result });
        break;
      }
    }
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
