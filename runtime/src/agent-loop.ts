import { Thread } from "@synqai/human-loop";
import type { ToolRegistry } from "./tool-registry";
import type { Logger } from "@synqai/contracts";
import { checkGateway } from "./tool-gateway";

const MAX_TURNS = 30;
const STUCK_THRESHOLD = 3; // bail after 3 consecutive identical intents
const TODAY = () => new Date().toISOString().split("T")[0];

export interface AgentResult {
  thread: Thread;
  intent: "done" | "request_info";
  message?: string;
}

export interface AgentLoopDependencies {
  baml: {
    nextStep: (thread: string, today: string) => Promise<unknown>;
  };
  tools: ToolRegistry;
  log: Logger;
}

export function createAgent(deps: AgentLoopDependencies) {
  return {
    run: (thread: Thread, log?: Logger): Promise<AgentResult> =>
      agentLoop(thread, { ...deps, log: log ?? deps.log }),
  };
}

async function agentLoop(
  thread: Thread,
  deps: AgentLoopDependencies,
): Promise<AgentResult> {
  const { baml, tools, log } = deps;
  const today = TODAY();
  let lastIntent = "";
  let repeatCount = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const serialized = thread.serializeForLLM();

    // LLM decides next step
    let nextStep: any;
    try {
      nextStep = (await baml.nextStep(serialized, today)) as any;
    } catch (err: any) {
      log.info("llm_error", { turn, error: err.message });
      thread.events.push({
        type: "tool_response",
        data: {
          error: {
            message: "Failed to parse response. Please reply in JSON.",
            code: "llm_parse",
            retryable: true,
          },
        },
      });
      continue;
    }

    log.info("step", { intent: nextStep.intent, turn });
    thread.events.push({ type: "tool_call", data: nextStep });

    // Stuck detection — consecutive identical intents
    if (nextStep.intent === lastIntent) {
      repeatCount++;
      if (repeatCount >= STUCK_THRESHOLD) {
        log.info("stuck_detected", { intent: nextStep.intent, repeatCount });
        thread.events.push({
          type: "tool_call",
          data: {
            intent: "done",
            message: "I seem to be stuck. Could you rephrase your request?",
          },
        });
        return {
          thread,
          intent: "done",
          message: "I seem to be stuck. Could you rephrase your request?",
        };
      }
    } else {
      lastIntent = nextStep.intent;
      repeatCount = 1;
    }

    // Terminal intents — exit inner loop
    if (nextStep.intent === "done") {
      return { thread, intent: "done", message: nextStep.message };
    }
    if (nextStep.intent === "request_info") {
      return { thread, intent: "request_info", message: nextStep.message };
    }

    // ToolGateway check — safety in code
    const gatewayResult = checkGateway(nextStep.intent, nextStep);
    if (gatewayResult.action === "confirm") {
      // Push a new request_info event with pending call metadata
      thread.events.push({
        type: "tool_call",
        data: {
          intent: "request_info",
          message: gatewayResult.message,
          _pendingIntent: nextStep.intent,
          _pendingArgs: nextStep,
        },
      });
      return {
        thread,
        intent: "request_info",
        message: gatewayResult.message,
      };
    }

    // Tool dispatch — fail closed on unknown intent
    const handler = tools.handlers[nextStep.intent];
    if (!handler) {
      log.info("unknown_intent", { intent: nextStep.intent, turn });
      thread.events.push({
        type: "tool_response",
        data: {
          error: {
            message: `Unknown tool: ${nextStep.intent}`,
            code: "unknown_tool",
          },
        },
      });
      continue;
    }

    const start = Date.now();
    try {
      const result = await handler(nextStep);
      const durationMs = Date.now() - start;

      if (result && typeof result === "object" && "error" in result) {
        log.info("tool_error", {
          intent: nextStep.intent,
          turn,
          durationMs,
          error: result.error,
        });
        thread.events.push({
          type: "tool_response",
          data: { error: result.error },
        });
      } else {
        log.info("tool_ok", { intent: nextStep.intent, turn, durationMs });
        thread.events.push({ type: "tool_response", data: result });
      }
    } catch (err: any) {
      const durationMs = Date.now() - start;
      log.info("tool_crash", {
        intent: nextStep.intent,
        turn,
        durationMs,
        error: err.message,
      });
      thread.events.push({
        type: "tool_response",
        data: { error: { message: err.message, code: "unhandled" } },
      });
    }
  }

  // Max turns reached
  thread.events.push({
    type: "tool_call",
    data: {
      intent: "done",
      message: "Reached maximum turns. Please try a simpler request.",
    },
  });
  return { thread, intent: "done", message: "Reached maximum turns." };
}
