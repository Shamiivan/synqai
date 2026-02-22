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
    .index("by_run", ["runId"])
    .index("by_channel", ["discordChannelId"]),

  agentRuns: defineTable({
    entryAgent: v.string(),
    currentAgent: v.union(v.literal("router"), v.literal("calendar"), v.literal("gmail")),
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
