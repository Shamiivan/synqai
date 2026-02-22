import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    agent: v.string(),
    input: v.string(),
    discordChannelId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentRuns", {
      agent: args.agent,
      status: "pending",
      input: args.input,
      discordChannelId: args.discordChannelId,
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
