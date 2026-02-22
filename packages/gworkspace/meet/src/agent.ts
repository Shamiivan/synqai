import { Thread } from "@synqai/human-loop";
import type { MeetAgentDependencies, MeetTools, Logger } from "@synqai/contracts";

const MAX_TURNS = 20;
const TOKEN_WARN = 15_000;
const TOKEN_HARD_STOP = 25_000;
const TODAY = new Date().toISOString().split("T")[0];

export function createMeetAgent(dependencies: MeetAgentDependencies) {
  return {
    run: (thread: Thread, log?: Logger) =>
      agentLoop(thread, { ...dependencies, log: log ?? dependencies.log }),
  };
}

async function agentLoop(thread: Thread, deps: MeetAgentDependencies): Promise<Thread> {
  const { baml, tools, log } = deps;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const serialized = thread.serializeCompact(3);
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

    const nextStep = await baml.meetNextStep(serialized, TODAY) as any;
    log.info("step", { intent: nextStep.intent, turn });
    thread.events.push({ type: "tool_call", data: nextStep });

    if (nextStep.intent === "request_info" || nextStep.intent === "done") {
      return thread;
    }

    const start = Date.now();
    let result: unknown;
    let success = true;

    try {
      switch (nextStep.intent) {
        case "create_meeting":
          result = await tools.handleCreateMeeting(nextStep);
          break;
        case "get_meeting":
          result = await tools.handleGetMeeting(nextStep);
          break;
        case "end_meeting":
          result = await tools.handleEndMeeting(nextStep);
          break;
        case "list_conferences":
          result = await tools.handleListConferences(nextStep);
          break;
        case "list_recordings":
          result = await tools.handleListRecordings(nextStep);
          break;
        case "list_transcripts":
          result = await tools.handleListTranscripts(nextStep);
          break;
        case "get_transcript_entries":
          result = await tools.handleGetTranscriptEntries(nextStep);
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
      const err = (result as any).error;
      success = false;
      log.info("tool_error", { intent: nextStep.intent, turn, durationMs, error: err });
      thread.events.push({
        type: "tool_response",
        data: { error: { message: err.message, code: err.code, retryable: err.retryable } },
      });
    } else {
      log.info("tool_end", { intent: nextStep.intent, turn, durationMs, success });
      thread.events.push({ type: "tool_response", data: result });
    }
  }

  thread.events.push({
    type: "tool_call",
    data: { intent: "done", message: "Reached maximum turns. Please try again with a simpler request." },
  });
  return thread;
}

export function getLastIntent(thread: Thread): string {
  for (let i = thread.events.length - 1; i >= 0; i--) {
    if (thread.events[i].type === "tool_call") {
      return thread.events[i].data?.intent ?? "unknown";
    }
  }
  return "unknown";
}

export function getLastMessage(thread: Thread): string | undefined {
  for (let i = thread.events.length - 1; i >= 0; i--) {
    if (thread.events[i].type === "tool_call") {
      return thread.events[i].data?.message;
    }
  }
  return undefined;
}
