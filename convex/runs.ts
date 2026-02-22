import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    agent: v.string(),
    input: v.string(),
    discordChannelId: v.string(),
    discordMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentRuns", {
      agent: args.agent,
      status: "pending",
      input: args.input,
      discordChannelId: args.discordChannelId,
      discordMessageId: args.discordMessageId,
    });
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
    output: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "done",
      output: args.output,
    });
  },
});

export const fail = mutation({
  args: {
    id: v.id("agentRuns"),
    output: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "failed",
      output: args.output,
    });
  },
});

export const pause = mutation({
  args: {
    id: v.id("agentRuns"),
    thread: v.string(),
    question: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "waiting_human",
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

    const events = run.thread ? JSON.parse(run.thread) : [];
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
    id: v.id("agentRuns"),
    discordThreadId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { discordThreadId: args.discordThreadId });
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
      await ctx.db.patch(run._id, {
        status: "failed",
        output: "Worker restarted — run was in progress. Please try again.",
      });
    }
    return stale.length;
  },
});
