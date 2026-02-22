import { Thread } from "@synqai/human-loop";
import type { RouterDependencies, Logger } from "@synqai/contracts";

export interface AgentResult {
  thread: Thread;
  intent: string;
  message?: string;
  currentAgent?: string;
}

export function createRouter(dependencies: RouterDependencies) {
  return {
    route: (thread: Thread) => runRouter(thread, dependencies),
    routeToAgent: (agent: string, thread: Thread) => routeToAgent(agent, thread, dependencies),
  };
}

async function runRouter(thread: Thread, deps: RouterDependencies): Promise<AgentResult> {
  const { baml, agents, log } = deps;

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
      const agentName: string = nextStep.agent;
      log.info("Handing off", { agent: agentName });

      const runner = agents[agentName];
      if (!runner) {
        return { thread, intent: "done", message: `I don't know how to handle "${agentName}" yet.` };
      }

      // Replace the last user_input with the router's cleaned-up task
      for (let i = thread.events.length - 1; i >= 0; i--) {
        if (thread.events[i].type === "user_input") {
          thread.events[i].data = nextStep.task;
          break;
        }
      }

      const result = await runner.run(thread, log.child(agentName));
      const intent = getLastIntent(result);
      return { thread: result, intent, message: getLastMessage(result), currentAgent: agentName };
    }

    default:
      return { thread, intent: "done", message: "I'm not sure how to handle that." };
  }
}

async function routeToAgent(agent: string, thread: Thread, deps: RouterDependencies): Promise<AgentResult> {
  const { agents, log } = deps;

  const runner = agents[agent];
  if (!runner) {
    return { thread, intent: "done", message: `Unknown agent: "${agent}"` };
  }

  log.info("Direct dispatch", { agent });
  const result = await runner.run(thread, log.child(agent));
  const intent = getLastIntent(result);
  return { thread: result, intent, message: getLastMessage(result), currentAgent: agent };
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
