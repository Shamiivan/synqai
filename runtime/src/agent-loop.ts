import { Thread } from "@synqai/human-loop";
import type { ToolRegistry } from "./tool-registry";
import type { Logger } from "@synqai/contracts";
import { checkGateway } from "./tool-gateway";

const MAX_TOTAL_ACTIONS = 30;
const MAX_ACTIONS_PER_STEP = 8;
const MAX_STEP_ERRORS = 2;
const TODAY = () => new Date().toISOString().split("T")[0];

export interface AgentResult {
  thread: Thread;
  intent: "done" | "request_info";
  message?: string;
}

export interface MemoryStore {
  load: (scope: string) => Promise<string>;
  save: (scope: string, note: string) => Promise<void>;
}

export interface AgentLoopDependencies {
  baml: {
    makePlan: (thread: string, workingMemory: string, today: string) => Promise<unknown>;
    nextAction: (thread: string, workingMemory: string, plan: string, currentStep: string, stepHistory: string, today: string) => Promise<unknown>;
  };
  tools: ToolRegistry;
  memoryStore: MemoryStore;
  log: Logger;
}

export function createAgent(deps: AgentLoopDependencies) {
  return {
    run: (thread: Thread, log?: Logger): Promise<AgentResult> =>
      agentLoop(thread, { ...deps, log: log ?? deps.log }),
  };
}

// Format a plan for LLM context
function formatPlan(plan: any): string {
  if (!plan.steps || plan.steps.length === 0) return "(no plan)";
  const lines = [`Goal: ${plan.goal}`];
  for (const s of plan.steps) {
    lines.push(`- [${s.id}] ${s.title} (success: ${s.success})`);
  }
  return lines.join("\n");
}

function formatStep(step: any): string {
  return `[${step.id}] ${step.title} — success: ${step.success}`;
}

function formatStepHistory(history: any[]): string {
  if (history.length === 0) return "(none yet)";
  return history.map((h) => {
    if (h.type === "action") return `Action: ${h.intent}`;
    if (h.type === "result") return `Result: ${JSON.stringify(h.data).slice(0, 300)}`;
    return JSON.stringify(h).slice(0, 200);
  }).join("\n");
}

// Single-turn fallback for simple chat (plan has 0 steps)
async function singleTurnFallback(
  thread: Thread,
  workingMemory: string,
  deps: AgentLoopDependencies,
): Promise<AgentResult> {
  const { baml, tools, log } = deps;
  const today = TODAY();
  const serialized = thread.serializeCompact();

  let action: any;
  try {
    action = await baml.nextAction(serialized, workingMemory, "(no plan)", "(simple chat — respond directly)", "(none)", today);
  } catch (err: any) {
    log.info("llm_error_fallback", { error: err.message });
    return { thread, intent: "done", message: "Sorry, I had trouble understanding. Could you try again?" };
  }

  log.info("single_turn", { intent: action.intent });
  thread.events.push({ type: "tool_call", data: action });

  if (action.intent === "done") {
    return { thread, intent: "done", message: action.message };
  }
  if (action.intent === "request_info") {
    return { thread, intent: "request_info", message: action.message };
  }

  // Unexpected tool call in single-turn — dispatch it, then return done
  const handler = tools.handlers[action.intent];
  if (handler) {
    try {
      const result = await handler(action);
      thread.events.push({ type: "tool_response", data: result });
    } catch (err: any) {
      thread.events.push({ type: "tool_response", data: { error: { message: err.message, code: "unhandled" } } });
    }
  }
  return { thread, intent: "done", message: action.message ?? "Done." };
}

async function agentLoop(
  thread: Thread,
  deps: AgentLoopDependencies,
): Promise<AgentResult> {
  const { baml, tools, memoryStore, log } = deps;
  const today = TODAY();
  const memoryScope = "global";

  // Load working memory
  let workingMemory = await memoryStore.load(memoryScope);
  log.info("memory_loaded", { length: workingMemory.length });

  // Phase 1: Make a plan
  const serialized = thread.serializeCompact();
  let plan: any;
  try {
    plan = await baml.makePlan(serialized, workingMemory, today);
  } catch (err: any) {
    log.info("plan_error", { error: err.message });
    return { thread, intent: "done", message: "Sorry, I had trouble understanding your request. Could you rephrase?" };
  }

  log.info("plan", { goal: plan.goal, steps: plan.steps?.length ?? 0 });

  // Simple chat: 0 steps — single turn
  if (!plan.steps || plan.steps.length === 0) {
    return singleTurnFallback(thread, workingMemory, deps);
  }

  // Phase 2: Execute each step
  let totalActions = 0;
  let lastStepSummary = "";

  for (const step of plan.steps) {
    const stepHistory: any[] = [];
    let stepErrors = 0;

    log.info("step_start", { stepId: step.id, title: step.title });

    for (let actionIdx = 0; actionIdx < MAX_ACTIONS_PER_STEP; actionIdx++) {
      if (totalActions >= MAX_TOTAL_ACTIONS) {
        log.info("max_actions_reached", { totalActions });
        thread.events.push({
          type: "tool_call",
          data: { intent: "done", message: "I've reached the maximum number of actions. Here's what I've accomplished so far." },
        });
        return { thread, intent: "done", message: "Reached max actions." };
      }

      // Call LLM for next action
      const threadStr = thread.serializeCompact();
      let action: any;
      try {
        action = await baml.nextAction(
          threadStr,
          workingMemory,
          formatPlan(plan),
          formatStep(step),
          formatStepHistory(stepHistory),
          today,
        );
      } catch (err: any) {
        log.info("llm_error", { stepId: step.id, actionIdx, error: err.message });
        stepErrors++;
        stepHistory.push({ type: "result", data: { error: "LLM parse error", retryable: true } });
        if (stepErrors >= MAX_STEP_ERRORS) {
          log.info("step_bail_errors", { stepId: step.id, stepErrors });
          break; // move to next step
        }
        continue;
      }

      totalActions++;
      log.info("action", { stepId: step.id, intent: action.intent, actionIdx, totalActions });

      // Handle control intents inline

      if (action.intent === "complete_step") {
        log.info("step_complete", { stepId: step.id, summary: action.summary });
        stepHistory.push({ type: "action", intent: "complete_step", summary: action.summary });
        lastStepSummary = action.summary;
        break; // next step
      }

      if (action.intent === "save_memory") {
        log.info("save_memory", { note: action.note });
        await memoryStore.save(memoryScope, action.note);
        workingMemory = await memoryStore.load(memoryScope);
        stepHistory.push({ type: "action", intent: "save_memory", note: action.note });
        continue; // don't count as "real" action progress, keep going
      }

      if (action.intent === "done") {
        thread.events.push({ type: "tool_call", data: action });
        return { thread, intent: "done", message: action.message };
      }

      if (action.intent === "request_info") {
        thread.events.push({ type: "tool_call", data: action });
        return { thread, intent: "request_info", message: action.message };
      }

      // Tool call — push to thread
      thread.events.push({ type: "tool_call", data: action });
      stepHistory.push({ type: "action", intent: action.intent });

      // Gateway check
      const gatewayResult = checkGateway(action.intent, action);
      if (gatewayResult.action === "confirm") {
        thread.events.push({
          type: "tool_call",
          data: {
            intent: "request_info",
            message: gatewayResult.message,
            _pendingIntent: action.intent,
            _pendingArgs: action,
          },
        });
        return { thread, intent: "request_info", message: gatewayResult.message };
      }

      // Dispatch tool
      const handler = tools.handlers[action.intent];
      if (!handler) {
        log.info("unknown_intent", { intent: action.intent });
        const errData = { error: { message: `Unknown tool: ${action.intent}`, code: "unknown_tool" } };
        thread.events.push({ type: "tool_response", data: errData });
        stepHistory.push({ type: "result", data: errData });
        stepErrors++;
        if (stepErrors >= MAX_STEP_ERRORS) break;
        continue;
      }

      const start = Date.now();
      try {
        const result = await handler(action);
        const durationMs = Date.now() - start;

        if (result && typeof result === "object" && "error" in result) {
          log.info("tool_error", { intent: action.intent, durationMs, error: result.error });
          thread.events.push({ type: "tool_response", data: { error: result.error } });
          stepHistory.push({ type: "result", data: { error: result.error } });
          stepErrors++;
          if (stepErrors >= MAX_STEP_ERRORS) {
            log.info("step_bail_errors", { stepId: step.id, stepErrors });
            break;
          }
        } else {
          log.info("tool_ok", { intent: action.intent, durationMs });
          thread.events.push({ type: "tool_response", data: result });
          stepHistory.push({ type: "result", data: result });
        }
      } catch (err: any) {
        const durationMs = Date.now() - start;
        log.info("tool_crash", { intent: action.intent, durationMs, error: err.message });
        const errData = { error: { message: err.message, code: "unhandled" } };
        thread.events.push({ type: "tool_response", data: errData });
        stepHistory.push({ type: "result", data: errData });
        stepErrors++;
        if (stepErrors >= MAX_STEP_ERRORS) {
          log.info("step_bail_errors", { stepId: step.id, stepErrors });
          break;
        }
      }
    }
  }

  // All steps completed — use last step's summary as the user-facing message
  const finalMessage = lastStepSummary || "All done! Let me know if you need anything else.";
  thread.events.push({
    type: "tool_call",
    data: { intent: "done", message: finalMessage },
  });
  return { thread, intent: "done", message: finalMessage };
}
