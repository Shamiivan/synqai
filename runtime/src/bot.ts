import type { BotDependencies, DiscordGateway, GatewayMessage } from "@synqai/contracts";
import { api } from "../../convex/_generated/api.js";

export function createBot(dependencies: BotDependencies) {
  const { discord, convex, startWorker, log } = dependencies;

  // Local state (closure-scoped, not dependencies)
  const pendingReplies = new Map<string, { channelId: string; messageId: string }>();
  const threadToRun = new Map<string, string>();
  const postedQuestions = new Map<string, string>();

  // ── Helpers ──

  async function postQuestionInThread(
    run: { _id: any; question?: string | null },
    conv: { discordChannelId: string; discordMessageId?: string | null },
  ) {
    const question = run.question ?? "I need more information to continue.";

    let thread;
    if (conv.discordMessageId) {
      thread = await discord.startThread(conv.discordChannelId, conv.discordMessageId, "Clarification");
    } else {
      thread = await discord.createThread(conv.discordChannelId, "Clarification for run");
    }

    await thread.send(question);

    await convex.mutation(api.runs.setDiscordThreadId, {
      runId: run._id as any,
      discordThreadId: thread.id,
    });

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

    if (postedQuestions.get(String(run._id)) === question) return;

    const thread = await discord.fetchThread(conv.discordThreadId);
    if (!thread) return;

    await thread.send(question);
    postedQuestions.set(String(run._id), question);

    threadToRun.set(conv.discordThreadId, String(run._id));

    log.info("Posted follow-up question", { thread: conv.discordThreadId, run: run._id });
  }

  function watchRun(runId: string, replyChannelId: string, replyMessageId: string, existingThreadId?: string) {
    pendingReplies.set(runId, { channelId: replyChannelId, messageId: replyMessageId });

    const unsub = convex.onUpdate(api.runs.get, { id: runId as any }, async (r) => {
      if (!r) return;

      if (r.status === "done" || r.status === "failed") {
        unsub();
        pendingReplies.delete(runId);

        try {
          if (r.status === "failed") {
            log.error("Run failed", { run: runId });
            await discord.reply(replyChannelId, replyMessageId, "Sorry, something went wrong. Please try again.");
            return;
          }

          let content: string;
          try {
            const events = JSON.parse(r.thread);
            const lastOutput = [...events].reverse().find((e: any) => e.type === "agent_output");
            content = lastOutput?.data ?? "Done.";
          } catch {
            content = "Done.";
          }

          // Reply in a thread so follow-ups carry conversation context
          let thread;
          if (existingThreadId) {
            thread = await discord.fetchThread(existingThreadId);
          }
          if (!thread) {
            try {
              thread = await discord.startThread(replyChannelId, replyMessageId, "Joe");
            } catch {
              // Thread creation can fail (e.g. already exists) — fallback to flat reply
              await discord.reply(replyChannelId, replyMessageId, content);
              return;
            }
          }

          await thread.send(content);

          // Persist thread ID so future replies are linked
          await convex.mutation(api.runs.setDiscordThreadId, {
            runId: runId as any,
            discordThreadId: thread.id,
          });
          threadToRun.set(thread.id, runId);

          log.info("Replied in thread", { run: runId, thread: thread.id });
        } catch (err) {
          log.error("Failed to reply", { run: runId, error: String(err) });
        }
      }
    });
  }

  async function handleThreadReply(msg: GatewayMessage) {
    const threadId = msg.threadId!;
    let runId = threadToRun.get(threadId);

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
        await convex.mutation(api.runs.resume, {
          id: runId as any,
          answer: msg.content.trim(),
        });
        log.info("Forwarded answer", { run: runId, answer: msg.content.trim() });
      } else if (run.status === "done" || run.status === "failed") {
        const newRunId = await convex.mutation(api.runs.createFollowUp, {
          previousRunId: runId as any,
          input: msg.content.trim(),
          discordChannelId: msg.parentChannelId!,
          discordThreadId: threadId,
        });
        log.info("Created follow-up in thread", {
          previousRun: runId,
          newRun: String(newRunId),
          input: msg.content.trim(),
        });
        threadToRun.set(threadId, String(newRunId));
        watchRun(String(newRunId), msg.channelId, msg.id, threadId);
      }
    } catch (err) {
      log.error("Thread reply error", { run: runId, error: String(err) });
    }
  }

  async function handleChannelMessage(msg: GatewayMessage) {
    try {
      // Channel messages always start fresh — no context carryover.
      // Only thread replies carry over conversation history.
      const runId = String(
        await convex.mutation(api.runs.create, {
          input: msg.content,
          discordChannelId: msg.channelId,
          discordMessageId: msg.id,
        }),
      );
      log.info("Created run", { run: runId, input: msg.content });

      watchRun(runId, msg.channelId, msg.id);
    } catch (err) {
      log.error("Channel message error", { error: String(err) });
    }
  }

  // ── Public API ──

  return {
    start: () => {
      discord.onReady(async () => {
        const cancelled = await convex.mutation(api.runs.cancelStale, { cutoff: Date.now() });
        if (cancelled > 0) log.info("Cleaned up stale runs", { count: cancelled });

        startWorker();

        convex.onUpdate(api.runs.listWaitingHuman, {}, async (waiting) => {
          for (const run of waiting) {
            try {
              const conv = await convex.query(api.runs.getConversationByRun, { runId: run._id });
              if (!conv) continue;

              if (conv.discordThreadId) {
                await postFollowUpInThread(run, conv);
              } else {
                await postQuestionInThread(run, conv);
              }
            } catch (err) {
              log.error("Failed to post question", { run: run._id, error: String(err) });
            }
          }
        });

        log.info("Bot online");
      });

      discord.onMessage(async (msg) => {
        if (msg.authorBot) return;

        if (msg.isThread) {
          await handleThreadReply(msg);
        } else {
          await handleChannelMessage(msg);
        }
      });

      discord.login(process.env.DISCORD_TOKEN!);
    },
  };
}
