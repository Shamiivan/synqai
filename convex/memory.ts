import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getMemory = query({
  args: { scope: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("workingMemory")
      .withIndex("by_scope", (q) => q.eq("scope", args.scope))
      .first();
    return doc?.content ?? "";
  },
});

export const appendMemory = mutation({
  args: {
    scope: v.string(),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workingMemory")
      .withIndex("by_scope", (q) => q.eq("scope", args.scope))
      .first();

    const line = `- ${args.note}`;
    const now = Date.now();

    if (existing) {
      const content = existing.content ? `${existing.content}\n${line}` : line;
      await ctx.db.patch(existing._id, { content, updatedAt: now });
    } else {
      await ctx.db.insert("workingMemory", {
        scope: args.scope,
        content: line,
        updatedAt: now,
      });
    }
  },
});
