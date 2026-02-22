import { createInterface } from "readline";
import type { Client, TextChannel } from "discord.js";

// ─── Thread (serializable conversation state) ───

export interface Event {
  type: "user_input" | "tool_call" | "tool_response" | "human_response";
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
      .map((k) => `${k}: ${e.data[k]}`)
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

// ─── AskHuman (legacy, kept for CLI usage) ───

export type AskHuman = (message: string) => Promise<string>;

export function discord(client: Client, channelId: string, messageId: string): AskHuman {
  let thread: Awaited<ReturnType<TextChannel["threads"]["create"]>> | null = null;

  return async (question: string) => {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !("messages" in channel)) {
      throw new Error(`Channel ${channelId} not found or not text-based`);
    }

    if (!thread) {
      const msg = await (channel as TextChannel).messages.fetch(messageId);
      const name = `Clarification: ${msg.content.slice(0, 85)}`;
      thread = await msg.startThread({ name });
    }

    await thread.send(question);

    const collected = await thread.awaitMessages({
      max: 1,
      time: 120_000,
      errors: ["time"],
      filter: (m) => !m.author.bot,
    });

    return collected.first()!.content.trim();
  };
}

export function cli(): AskHuman {
  return (message: string) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question(`${message}\n> `, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  };
}
