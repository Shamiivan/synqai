import type { Message, AnyThreadChannel } from "discord.js";
import { createInterface } from "readline";

/**
 * Any agent's human-in-the-loop callback.
 * Send a message, get a string back. The LLM never knows
 * whether this is Discord, CLI, or anything else.
 */
export type AskHuman = (message: string) => Promise<string>;

/**
 * Discord: creates a thread off the original message on first ask,
 * then keeps all follow-up questions in that thread.
 * Waits for the original user to reply (2 min timeout).
 */
export function discord(originalMessage: Message): AskHuman {
  let thread: AnyThreadChannel | null = null;

  return async (question: string) => {
    if (!thread) {
      thread = await originalMessage.startThread({ name: "Clarification" });
    }
    await thread.send(question);

    const collected = await thread.awaitMessages({
      max: 1,
      time: 120_000,
      errors: ["time"],
      filter: (m) => m.author.id === originalMessage.author.id,
    });
    return collected.first()!.content.trim();
  };
}

/**
 * CLI: creates a fresh readline per question.
 * Avoids the closed-stdin problem with piped input.
 */
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
