import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";

function assertStatus(
  run: Doc<"agentRuns"> | null,
  allowed: string[],
  action: string,
) {
  if (!run) throw new Error(`Run not found`);
  if (!allowed.includes(run.status))
    throw new Error(`Cannot ${action}: status is ${run.status}`);
}

export const create = mutation({
  args: {
    input: v.string(),
    discordChannelId: v.string(),
    discordMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Idempotent: if a run already exists for this Discord message, return it
    if (args.discordMessageId) {
      const existing = await ctx.db
        .query("conversations")
        .withIndex("by_discord_message", (q) => q.eq("discordMessageId", args.discordMessageId))
        .first();
      if (existing) return existing.runId;
    }

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
    const run = await ctx.db.get(args.id);
    assertStatus(run, ["running"], "finish");
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
    const run = await ctx.db.get(args.id);
    assertStatus(run, ["pending", "running", "waiting_human"], "fail");
    const patch: Record<string, unknown> = { status: "failed" as const };
    if (args.thread !== undefined) patch.thread = args.thread;
    await ctx.db.patch(args.id, patch);
  },
});

export const pause = mutation({
  args: {
    id: v.id("agentRuns"),
    currentAgent: v.union(v.literal("router"), v.literal("gworkspace"), v.literal("calendar"), v.literal("gmail"), v.literal("docs"), v.literal("sheets"), v.literal("meet")),
    thread: v.string(),
    question: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    assertStatus(run, ["running"], "pause");
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
    assertStatus(run, ["waiting_human"], "resume");

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

/**
 * Create a follow-up run seeded with the previous run's conversation thread.
 * Strips exit signals (done, agent_output) so the LLM sees a clean continuation.
 */
export const createFollowUp = mutation({
  args: {
    previousRunId: v.id("agentRuns"),
    input: v.string(),
    discordChannelId: v.string(),
    discordMessageId: v.optional(v.string()),
    discordThreadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const previousRun = await ctx.db.get(args.previousRunId);
    if (!previousRun) throw new Error("Previous run not found");

    const prevEvents = JSON.parse(previousRun.thread) as any[];
    const contextEvents = prevEvents.filter((e: any) => {
      if (e.type === "agent_output") return false;
      if (e.type === "tool_call" && e.data?.intent === "done") return false;
      return true;
    });
    contextEvents.push({ type: "user_input", data: args.input });

    const runId = await ctx.db.insert("agentRuns", {
      entryAgent: "router",
      currentAgent: "router",
      status: "pending",
      thread: JSON.stringify(contextEvents),
    });

    await ctx.db.insert("conversations", {
      discordChannelId: args.discordChannelId,
      discordMessageId: args.discordMessageId,
      discordThreadId: args.discordThreadId,
      runId,
    });

    return runId;
  },
});

/** Find the most recent done run in a channel. */
export const getRecentByChannel = query({
  args: { discordChannelId: v.string() },
  handler: async (ctx, args) => {
    const convs = await ctx.db
      .query("conversations")
      .withIndex("by_channel", (q) => q.eq("discordChannelId", args.discordChannelId))
      .order("desc")
      .take(5);

    for (const conv of convs) {
      const run = await ctx.db.get(conv.runId);
      if (!run) continue;
      if (run.status !== "done") continue;
      return { runId: run._id };
    }

    return null;
  },
});

export const cancelStale = mutation({
  args: {
    cutoff: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Cancel running runs unconditionally (no worker owns them after restart)
    const running = await ctx.db
      .query("agentRuns")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    // Cancel pending runs created before cutoff (stale from previous session)
    const pending = await ctx.db
      .query("agentRuns")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const cutoff = args.cutoff ?? Date.now();
    const stalePending = pending.filter((r) => r._creationTime < cutoff);

    // Note: waiting_human runs are preserved — they have a human expecting a response
    const stale = [...running, ...stalePending];
    for (const run of stale) {
      await ctx.db.patch(run._id, { status: "failed" });
    }
    return stale.length;
  },
});
