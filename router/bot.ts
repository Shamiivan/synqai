import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Client, Events, GatewayIntentBits } from "discord.js";
import { ConvexClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";

const convex = new ConvexClient(process.env.CONVEX_URL!);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Bot online as ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const runId = await convex.mutation(api.runs.create, {
    agent: "default",
    input: message.content,
    discordChannelId: message.channelId,
  });

  console.log(`Created run ${runId} for: "${message.content}"`);

  // Subscribe to this run and post result when done
  const unsub = convex.onUpdate(
    api.runs.get,
    { id: runId as Id<"agentRuns"> },
    async (run) => {
      if (!run || run.status !== "done") return;
      unsub();
      await message.reply(run.output ?? "No output.");
      console.log(`Replied to run ${runId}`);
    },
  );
});

client.login(process.env.DISCORD_TOKEN!);
