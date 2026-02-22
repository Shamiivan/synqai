import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    input: v.string(),
    discordChannelId: v.string(),
    discordMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const runId = await ctx.db.insert("agentRuns", {
      entryAgent: "router",
      currentAgent: "router",
      status: "pending",
      thread: JSON.stringify([{ type: "user_input", data: args.input }]),
    });
    await ctx.db.insert("conversations", {
      discordChannelId: args.discordChannelId,
      discordMessageId: args.discordMessageId,
      runId,
    });
    return runId;
  },
});

export const get = query({
  args: { id: v.id("agentRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("agentRuns")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
  },
});

export const claim = mutation({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("agentRuns")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .first();
    if (!pending) return null;
    await ctx.db.patch(pending._id, { status: "running" });
    return { ...pending, status: "running" as const };
  },
});

export const finish = mutation({
  args: {
    id: v.id("agentRuns"),
    thread: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "done",
      thread: args.thread,
    });
  },
});

export const fail = mutation({
  args: {
    id: v.id("agentRuns"),
    thread: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { status: "failed" as const };
    if (args.thread !== undefined) patch.thread = args.thread;
    await ctx.db.patch(args.id, patch);
  },
});

export const pause = mutation({
  args: {
    id: v.id("agentRuns"),
    currentAgent: v.union(v.literal("router"), v.literal("calendar")),
    thread: v.string(),
    question: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "waiting_human",
      currentAgent: args.currentAgent,
      thread: args.thread,
      question: args.question,
    });
  },
});

export const resume = mutation({
  args: {
    id: v.id("agentRuns"),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run || run.status !== "waiting_human") return;

    const events = JSON.parse(run.thread);
    events.push({ type: "human_response", data: args.answer });

    await ctx.db.patch(args.id, {
      status: "pending",
      thread: JSON.stringify(events),
      question: undefined,
    });
  },
});

export const listWaitingHuman = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("agentRuns")
      .withIndex("by_status", (q) => q.eq("status", "waiting_human"))
      .collect();
  },
});

export const setDiscordThreadId = mutation({
  args: {
    runId: v.id("agentRuns"),
    discordThreadId: v.string(),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db
      .query("conversations")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .first();
    if (conv) {
      await ctx.db.patch(conv._id, { discordThreadId: args.discordThreadId });
    }
  },
});

export const getConversationByThread = query({
  args: { discordThreadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_discord_thread", (q) =>
        q.eq("discordThreadId", args.discordThreadId)
      )
      .first();
  },
});

export const getConversationByRun = query({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .first();
  },
});

export const cancelStale = mutation({
  args: {},
  handler: async (ctx) => {
    const running = await ctx.db
      .query("agentRuns")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();
    const waiting = await ctx.db
      .query("agentRuns")
      .withIndex("by_status", (q) => q.eq("status", "waiting_human"))
      .collect();
    const stale = [...running, ...waiting];
    for (const run of stale) {
      await ctx.db.patch(run._id, { status: "failed" });
    }
    return stale.length;
  },
});
