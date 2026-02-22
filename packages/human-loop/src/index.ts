// ─── Thread (serializable conversation state) ───

export interface Event {
  type: "user_input" | "tool_call" | "tool_response" | "human_response" | "agent_output";
  data: any;
}

export class Thread {
  events: Event[] = [];

  constructor(events: Event[] = []) {
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
      .map((k) => {
        const v = e.data[k];
        return `${k}: ${typeof v === "object" && v !== null ? JSON.stringify(v) : v}`;
      })
      .join("\n");
    return `<${tag}>\n${fields}\n</${tag}>`;
  }

  toJSON(): Event[] {
    return this.events;
  }

  static fromJSON(events: Event[]): Thread {
    return new Thread(events);
  }
}
