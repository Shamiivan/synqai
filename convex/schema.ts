import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  conversations: defineTable({
    discordChannelId: v.string(),
    discordMessageId: v.optional(v.string()),
    discordThreadId: v.optional(v.string()),
    runId: v.id("agentRuns"),
  })
    .index("by_discord_thread", ["discordThreadId"])
    .index("by_discord_message", ["discordMessageId"])
    .index("by_run", ["runId"])
    .index("by_channel", ["discordChannelId"]),

  workingMemory: defineTable({
    scope: v.string(),
    content: v.string(),
    updatedAt: v.number(),
  }).index("by_scope", ["scope"]),

  agentRuns: defineTable({
    // Legacy fields — optional for backward compat, no longer written
    entryAgent: v.optional(v.string()),
    currentAgent: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("waiting_human"),
      v.literal("done"),
      v.literal("failed"),
    ),
    thread: v.string(),
    question: v.optional(v.string()),
  }).index("by_status", ["status"]),
});
