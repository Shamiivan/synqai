import { Thread } from "@synqai/human-loop";
import { b } from "../baml_client";
import { agentLoop, getLastIntent, getLastMessage } from "@synqai/gworkspace-calendar/src/agent";
import type { Logger } from "../lib";

export interface AgentResult {
  thread: Thread;
  intent: string;
  message?: string;
  currentAgent?: "router" | "calendar";
}

export async function runRouter(thread: Thread, deps?: { log?: Logger }): Promise<AgentResult> {
  const log = deps?.log;

  const lastUserInput = thread.events
    .filter((e) => e.type === "user_input" || e.type === "human_response")
    .at(-1)?.data ?? "";

  const nextStep = await b.DetermineNextStep(
    typeof lastUserInput === "string" ? lastUserInput : String(lastUserInput),
  );
  log?.info("Router decided", { intent: nextStep.intent });

  switch (nextStep.intent) {
    case "done_for_now":
      return { thread, intent: "done", message: nextStep.message };

    case "handoff": {
      log?.info("Handing off", { agent: nextStep.agent });
      if (thread.events.length === 1 && thread.events[0].type === "user_input") {
        thread.events[0].data = nextStep.task;
      }
      const result = await agentLoop(thread, { log: log?.child("calendar") });
      const intent = getLastIntent(result);
      return { thread: result, intent, message: getLastMessage(result), currentAgent: "calendar" };
    }

    default:
      return { thread, intent: "done", message: "I'm not sure how to handle that." };
  }
}
