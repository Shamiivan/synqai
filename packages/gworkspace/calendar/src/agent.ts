import type { AskHuman } from "@synqai/human-loop";
import { b } from "../baml_client";
import { handleCreateEvent, handleListEvents } from "./tools";

export interface Event {
  type: string;
  data: any;
}

export class Thread {
  events: Event[] = [];

  constructor(events: Event[]) {
    this.events = events;
  }

  serializeForLLM(): string {
    return this.events.map((e) => this.serializeOneEvent(e)).join("\n");
  }

  private serializeOneEvent(e: Event): string {
    const tag = e.data?.intent || e.type;
    if (typeof e.data !== "object") {
      return `<${tag}>\n${e.data}\n</${tag}>`;
    }
    const fields = Object.keys(e.data)
      .filter((k) => k !== "intent")
      .map((k) => `${k}: ${e.data[k]}`)
      .join("\n");
    return `<${tag}>\n${fields}\n</${tag}>`;
  }
}

const MAX_TURNS = 20;
const TODAY = new Date().toISOString().split("T")[0];

export async function run(
  input: string,
  ask: AskHuman
): Promise<{ message: string; data?: any }> {
  const thread = new Thread([{ type: "user_input", data: input }]);

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const nextStep = await b.CalendarNextStep(thread.serializeForLLM(), TODAY);
    console.log("nextStep:", nextStep);

    thread.events.push({ type: "tool_call", data: nextStep });

    switch (nextStep.intent) {
      case "request_info": {
        const answer = await ask(nextStep.message);
        thread.events.push({ type: "human_response", data: answer });
        break;
      }
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
      case "done": {
        return { message: nextStep.message };
      }
    }
  }

  return { message: "Reached maximum turns. Please try again with a simpler request." };
}
