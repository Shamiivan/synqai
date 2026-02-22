import { Thread } from "@synqai/human-loop";
import type { RouterDependencies, Logger } from "@synqai/contracts";

export interface AgentResult {
  thread: Thread;
  intent: string;
  message?: string;
  currentAgent?: "router" | "calendar";
}

export function createRouter(dependencies: RouterDependencies) {
  return {
    route: (thread: Thread) => runRouter(thread, dependencies),
  };
}

async function runRouter(thread: Thread, deps: RouterDependencies): Promise<AgentResult> {
  const { baml, runCalendarAgent, log } = deps;

  const lastUserInput = thread.events
    .filter((e) => e.type === "user_input" || e.type === "human_response")
    .at(-1)?.data ?? "";

  const serialized = thread.serializeForLLM();
  const lastMsg = typeof lastUserInput === "string" ? lastUserInput : String(lastUserInput);

  const nextStep = await baml.determineNextStep(serialized, lastMsg) as any;
  log.info("Router decided", { intent: nextStep.intent });

  switch (nextStep.intent) {
    case "done_for_now":
      return { thread, intent: "done", message: nextStep.message };

    case "handoff": {
      log.info("Handing off", { agent: nextStep.agent });
      // Replace the last user_input with the router's cleaned-up task
      // so the calendar agent sees a clear instruction even on follow-ups
      for (let i = thread.events.length - 1; i >= 0; i--) {
        if (thread.events[i].type === "user_input") {
          thread.events[i].data = nextStep.task;
          break;
        }
      }
      const result = await runCalendarAgent(thread, log.child("calendar"));
      const intent = getLastIntent(result);
      return { thread: result, intent, message: getLastMessage(result), currentAgent: "calendar" };
    }

    default:
      return { thread, intent: "done", message: "I'm not sure how to handle that." };
  }
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
      return thread.events[i].data?.message;
    }
  }
  return undefined;
}
