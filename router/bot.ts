import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  Client,
  Events,
  GatewayIntentBits,
  type Message,
  type TextChannel,
} from "discord.js";
import { ConvexClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { startWorker } from "./worker";
import { createLogger } from "./lib";

const log = createLogger("bot");

const convex = new ConvexClient(process.env.CONVEX_URL!);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Track runs we're watching for completion (runId -> discord message to reply to)
const pendingReplies = new Map<
  string,
  { channelId: string; messageId: string }
>();

// Track which discord threads map to which runs (threadId -> runId)
const threadToRun = new Map<string, string>();

// Track questions we've already posted (runId -> last posted question) to avoid duplicates
const postedQuestions = new Map<string, string>();

client.once(Events.ClientReady, async (c) => {
  const cancelled = await convex.mutation(api.runs.cancelStale, {});
  if (cancelled > 0) log.info("Cleaned up stale runs", { count: cancelled });

  startWorker({ convex, log: log.child("worker") });

  // Global subscription: watch for runs needing human input
  convex.onUpdate(api.runs.listWaitingHuman, {}, async (waiting) => {
    for (const run of waiting) {
      try {
        const conv = await convex.query(api.runs.getConversationByRun, {
          runId: run._id,
        });
        if (!conv) continue;

        if (conv.discordThreadId) {
          await postFollowUpInThread(run, conv);
        } else {
          await postQuestionInThread(run, conv);
        }
      } catch (err) {
        log.error("Failed to post question", {
          run: run._id,
          error: String(err),
        });
      }
    }
  });

  log.info(`Bot online as ${c.user.tag}`);
});

async function postQuestionInThread(
  run: { _id: any; question?: string | null },
  conv: { discordChannelId: string; discordMessageId?: string | null },
) {
  const question = run.question ?? "I need more information to continue.";

  const channel = await client.channels.fetch(conv.discordChannelId);
  if (!channel || !("messages" in channel)) return;

  const textChannel = channel as TextChannel;

  // Create thread off the original message
  let thread;
  if (conv.discordMessageId) {
    const msg = await textChannel.messages.fetch(conv.discordMessageId);
    const name = `Clarification: ${msg.content.slice(0, 85)}`;
    thread = await msg.startThread({ name });
  } else {
    thread = await textChannel.threads.create({
      name: `Clarification for run`,
    });
  }

  await thread.send(question);

  // Persist thread ID on the conversation so it survives restarts
  await convex.mutation(api.runs.setDiscordThreadId, {
    runId: run._id as any,
    discordThreadId: thread.id,
  });

  // Track mapping for reply forwarding
  threadToRun.set(thread.id, String(run._id));
  postedQuestions.set(String(run._id), question);

  log.info("Posted question in thread", { thread: thread.id, run: run._id });
}

async function postFollowUpInThread(
  run: { _id: any; question?: string | null },
  conv: { discordThreadId?: string | null },
) {
  if (!conv.discordThreadId) return;
  const question = run.question ?? "I need more information to continue.";

  // Skip if we already posted this exact question (subscription refire)
  if (postedQuestions.get(String(run._id)) === question) return;

  const thread = await client.channels.fetch(conv.discordThreadId);
  if (!thread || !("send" in thread)) return;

  await (thread as any).send(question);
  postedQuestions.set(String(run._id), question);

  // Ensure thread mapping is populated (may be missing after restart)
  threadToRun.set(conv.discordThreadId, String(run._id));

  log.info("Posted follow-up question", {
    thread: conv.discordThreadId,
    run: run._id,
  });
}

// ── Run watcher: subscribes to a run and replies when done ──

function watchRun(runId: string, replyTarget: Message) {
  pendingReplies.set(runId, {
    channelId: replyTarget.channelId,
    messageId: replyTarget.id,
  });

  const unsub = convex.onUpdate(
    api.runs.get,
    { id: runId as any },
    async (r) => {
      if (!r) return;

      if (r.status === "done" || r.status === "failed") {
        unsub();
        pendingReplies.delete(runId);
        try {
          if (r.status === "failed") {
            log.error("Run failed", { run: runId });
            await replyTarget.reply(
              "Sorry, something went wrong. Please try again.",
            );
          } else {
            try {
              const events = JSON.parse(r.thread);
              const lastOutput = [...events]
                .reverse()
                .find((e: any) => e.type === "agent_output");
              await replyTarget.reply(lastOutput?.data ?? "Done.");
            } catch {
              await replyTarget.reply("Done.");
            }
          }
        } catch (err) {
          log.error("Failed to reply", { run: runId, error: String(err) });
        }
      }

      // If it goes to waiting_human, the global subscription handles it
    },
  );
}

// ── Message handler ──

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Thread reply → forward answer or create follow-up
  if (message.channel.isThread()) {
    const threadId = message.channel.id;
    let runId = threadToRun.get(threadId);

    // On restart, threadToRun is empty. Check Convex for thread mapping.
    if (!runId) {
      const conv = await convex.query(api.runs.getConversationByThread, {
        discordThreadId: threadId,
      });
      if (!conv) return;
      runId = String(conv.runId);
      threadToRun.set(threadId, runId);
    }

    try {
      const run = await convex.query(api.runs.get, { id: runId as any });
      if (!run) return;

      if (run.status === "waiting_human") {
        // Forward answer to the paused run (current behavior)
        await convex.mutation(api.runs.resume, {
          id: runId as any,
          answer: message.content.trim(),
        });
        log.info("Forwarded answer", {
          run: runId,
          answer: message.content.trim(),
        });
      } else if (run.status === "done" || run.status === "failed") {
        // Run is finished — create a follow-up run with the previous conversation context
        const newRunId = await convex.mutation(api.runs.createFollowUp, {
          previousRunId: runId as any,
          input: message.content.trim(),
          discordChannelId: message.channel.parentId!,
          discordThreadId: threadId,
        });
        log.info("Created follow-up in thread", {
          previousRun: runId,
          newRun: String(newRunId),
          input: message.content.trim(),
        });
        threadToRun.set(threadId, String(newRunId));
        watchRun(String(newRunId), message);
      }
      // If running/pending, silently ignore — still processing
    } catch (err) {
      log.error("Thread reply error", { run: runId, error: String(err) });
      await message.reply("Sorry, I couldn't process that. Please try again.");
    }
    return;
  }

  // New message in channel — check for recent context to carry forward
  try {
    const recent = await convex.query(api.runs.getRecentByChannel, {
      discordChannelId: message.channelId,
    });

    let runId: string;

    if (recent) {
      // Continue conversation with context from recent run
      runId = String(
        await convex.mutation(api.runs.createFollowUp, {
          previousRunId: recent.runId,
          input: message.content,
          discordChannelId: message.channelId,
          discordMessageId: message.id,
        }),
      );
      log.info("Created follow-up from channel", {
        previousRun: String(recent.runId),
        run: runId,
        input: message.content,
      });
    } else {
      // Fresh conversation — no recent context
      runId = String(
        await convex.mutation(api.runs.create, {
          input: message.content,
          discordChannelId: message.channelId,
          discordMessageId: message.id,
        }),
      );
      log.info("Created run", { run: runId, input: message.content });
    }

    watchRun(runId, message);
  } catch (err) {
    log.error("Channel message error", { error: String(err) });
    await message.reply("Sorry, something went wrong. Please try again.");
  }
});

client.login(process.env.DISCORD_TOKEN!);
