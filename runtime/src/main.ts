import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Client, GatewayIntentBits } from "discord.js";
import { ConvexClient } from "convex/browser";
import { b as routerBaml } from "../baml_client";
import { b as calendarBaml } from "@synqai/gworkspace-calendar/baml_client";
import { b as gmailBaml } from "@synqai/gworkspace-gmail/baml_client";
import { getCalendarClient, calendarId } from "@synqai/gworkspace-calendar/src/google-auth";
import { createCalendarTools } from "@synqai/gworkspace-calendar/src/tools";
import { createCalendarAgent } from "@synqai/gworkspace-calendar/src/agent";
import { getGmailClient, userId } from "@synqai/gworkspace-gmail/src/google-auth";
import { createGmailTools } from "@synqai/gworkspace-gmail/src/tools";
import { createGmailAgent } from "@synqai/gworkspace-gmail/src/agent";
import { createDiscordGateway } from "@synqai/gateway-discord";
import { createLogger } from "./logging";
import { createRouter } from "./agents/router";
import { createWorker } from "./worker";
import { createBot } from "./bot";

// ── Logger ──
const log = createLogger("synqai");

// ── Convex ──
const convex = new ConvexClient(process.env.CONVEX_URL!);

// ── Google Calendar ──
const calendar = getCalendarClient();
const calendarTools = createCalendarTools({ calendar, calendarId });

// ── Calendar Agent ──
const calendarAgent = createCalendarAgent({
  baml: { calendarNextStep: (thread, today) => calendarBaml.CalendarNextStep(thread, today) },
  tools: calendarTools,
  log: log.child("calendar"),
});

// ── Gmail ──
const gmail = getGmailClient();
const gmailTools = createGmailTools({ gmail, userId });

// ── Gmail Agent ──
const gmailAgent = createGmailAgent({
  baml: { gmailNextStep: (thread, today) => gmailBaml.GmailNextStep(thread, today) },
  tools: gmailTools,
  log: log.child("gmail"),
});

// ── Router (agent registry) ──
const router = createRouter({
  baml: { determineNextStep: (thread, lastMsg) => routerBaml.DetermineNextStep(thread, lastMsg) },
  agents: {
    calendar: (thread, childLog) => calendarAgent.run(thread, childLog),
    gmail: (thread, childLog) => gmailAgent.run(thread, childLog),
  },
  log: log.child("router"),
});

// ── Worker ──
const worker = createWorker({
  convex,
  route: (thread) => router.route(thread),
  routeToAgent: (agent, thread) => router.routeToAgent(agent, thread),
  log: log.child("worker"),
});

// ── Discord Gateway ──
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const discord = createDiscordGateway(discordClient);

// ── Bot ──
const bot = createBot({
  discord,
  convex,
  startWorker: () => worker.start(),
  log: log.child("bot"),
});

// ── Start ──
bot.start();
