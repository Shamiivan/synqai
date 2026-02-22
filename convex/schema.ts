import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agentRuns: defineTable({
    agent: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("done"),
      v.literal("failed")
    ),
    input: v.string(),
    output: v.optional(v.string()),
    discordChannelId: v.string(),
  }).index("by_status", ["status"]),
});
