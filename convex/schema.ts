import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agentRuns: defineTable({
    agent: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("waiting_human"),
      v.literal("done"),
      v.literal("failed"),
    ),
    input: v.string(),
    output: v.optional(v.string()),
    thread: v.optional(v.string()),
    question: v.optional(v.string()),
    discordChannelId: v.string(),
    discordMessageId: v.optional(v.string()),
    discordThreadId: v.optional(v.string()),
  }).index("by_status", ["status"]),
});
