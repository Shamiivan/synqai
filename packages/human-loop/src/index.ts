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

  /**
   * Compact serialization: old tool_response events are trimmed to artifact
   * fields only (Id, Url, title, name, success, error, code). Recent events
   * within `recentTurns` tool_call/tool_response pairs stay full.
   * Never mutates the events array.
   */
  serializeCompact(recentTurns = 3): string {
    // Find the boundary: count tool_call events backwards to find where "recent" starts
    let callsSeen = 0;
    let recentStart = this.events.length;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].type === "tool_call") {
        callsSeen++;
        if (callsSeen > recentTurns) {
          recentStart = i + 1;
          break;
        }
      }
    }

    const oldParts: string[] = [];
    const recentParts: string[] = [];

    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i];
      if (i < recentStart && e.type === "tool_response") {
        oldParts.push(this.serializeOneEvent({ ...e, data: pickArtifacts(e.data) }));
      } else if (i < recentStart) {
        oldParts.push(this.serializeOneEvent(e));
      } else {
        recentParts.push(this.serializeOneEvent(e));
      }
    }

    if (oldParts.length === 0) return recentParts.join("\n");
    return `<history>\n${oldParts.join("\n")}\n</history>\n${recentParts.join("\n")}`;
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

// ── Helpers ──

const ARTIFACT_KEY = /[Ii]d$|[Uu]rl$|^title$|^name$|^success$|^error$|^code$/;

function pickArtifacts(data: any): any {
  if (typeof data !== "object" || data === null) return data;
  const slim: Record<string, any> = {};
  for (const k of Object.keys(data)) {
    if (ARTIFACT_KEY.test(k)) slim[k] = data[k];
  }
  return Object.keys(slim).length > 0 ? slim : { _summary: "ok" };
}
