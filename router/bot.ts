import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Client, Events, GatewayIntentBits, type TextChannel } from "discord.js";
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
const pendingReplies = new Map<string, { channelId: string; messageId: string }>();

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
        if (run.discordThreadId) {
          // Thread already exists — post follow-up question there
          await postFollowUpInThread(run);
        } else {
          await postQuestionInThread(run);
        }
      } catch (err) {
        log.error("Failed to post question", { run: run._id, error: String(err) });
      }
    }
  });

  log.info(`Bot online as ${c.user.tag}`);
});

async function postQuestionInThread(run: {
  _id: any;
  question?: string | null;
  discordChannelId: string;
  discordMessageId?: string | null;
}) {
  const question = run.question ?? "I need more information to continue.";

  const channel = await client.channels.fetch(run.discordChannelId);
  if (!channel || !("messages" in channel)) return;

  const textChannel = channel as TextChannel;

  // Create thread off the original message
  let thread;
  if (run.discordMessageId) {
    const msg = await textChannel.messages.fetch(run.discordMessageId);
    const name = `Clarification: ${msg.content.slice(0, 85)}`;
    thread = await msg.startThread({ name });
  } else {
    thread = await textChannel.threads.create({
      name: `Clarification for run`,
    });
  }

  await thread.send(question);

  // Persist thread ID on the run so it survives restarts
  await convex.mutation(api.runs.setDiscordThreadId, {
    id: run._id,
    discordThreadId: thread.id,
  });

  // Track mapping for reply forwarding
  threadToRun.set(thread.id, String(run._id));
  postedQuestions.set(String(run._id), question);

  log.info("Posted question in thread", { thread: thread.id, run: run._id });
}

async function postFollowUpInThread(run: {
  _id: any;
  question?: string | null;
  discordThreadId?: string | null;
}) {
  if (!run.discordThreadId) return;
  const question = run.question ?? "I need more information to continue.";

  // Skip if we already posted this exact question (subscription refire)
  if (postedQuestions.get(String(run._id)) === question) return;

  const thread = await client.channels.fetch(run.discordThreadId);
  if (!thread || !("send" in thread)) return;

  await (thread as any).send(question);
  postedQuestions.set(String(run._id), question);

  // Ensure thread mapping is populated (may be missing after restart)
  threadToRun.set(run.discordThreadId, String(run._id));

  log.info("Posted follow-up question", { thread: run.discordThreadId, run: run._id });
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Thread reply → forward answer to Convex
  if (message.channel.isThread()) {
    const runId = threadToRun.get(message.channel.id);
    if (!runId) {
      // On restart, threadToRun is empty. Check Convex for thread mapping.
      await handleOrphanedThreadReply(message);
      return;
    }

    try {
      await convex.mutation(api.runs.resume, {
        id: runId as any,
        answer: message.content.trim(),
      });
      log.info("Forwarded answer", { run: runId, answer: message.content.trim() });
    } catch (err) {
      log.error("Failed to resume run", { run: runId, error: String(err) });
      await message.reply("Sorry, I couldn't process that. Please try again.");
    }
    return;
  }

  // New message in channel → create a run
  const runId = await convex.mutation(api.runs.create, {
    agent: "router",
    input: message.content,
    discordChannelId: message.channelId,
    discordMessageId: message.id,
  });

  log.info("Created run", { run: runId, input: message.content });
  pendingReplies.set(String(runId), {
    channelId: message.channelId,
    messageId: message.id,
  });

  // Watch this specific run for completion
  const unsub = convex.onUpdate(api.runs.get, { id: runId }, async (r) => {
    if (!r) return;

    if (r.status === "done" || r.status === "failed") {
      unsub();
      pendingReplies.delete(String(runId));

      try {
        if (r.status === "failed") {
          log.error("Run failed", { run: runId, output: r.output });
          await message.reply("Sorry, something went wrong. Please try again.");
        } else {
          await message.reply(r.output ?? "Done.");
        }
      } catch (err) {
        log.error("Failed to reply", { run: runId, error: String(err) });
      }
    }

    // If it goes to waiting_human, the global subscription handles it
  });
});

/**
 * Handle replies in threads after a bot restart.
 * The in-memory threadToRun map is empty, so we look up the run by discordThreadId.
 */
async function handleOrphanedThreadReply(message: any) {
  // Query all waiting_human runs and find the one with this thread ID
  const waiting = await convex.query(api.runs.listWaitingHuman, {});
  const run = waiting.find((r: any) => r.discordThreadId === message.channel.id);
  if (!run) return; // Not a thread we care about

  // Re-populate the mapping
  threadToRun.set(message.channel.id, String(run._id));

  try {
    await convex.mutation(api.runs.resume, {
      id: run._id,
      answer: message.content.trim(),
    });
    log.info("Forwarded orphaned thread answer", { run: run._id });
  } catch (err) {
    log.error("Failed to resume orphaned run", { run: run._id, error: String(err) });
  }
}

client.login(process.env.DISCORD_TOKEN!);
