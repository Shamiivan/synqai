import "./env"; // must be first — loads .env.local before other modules

import { Client, GatewayIntentBits } from "discord.js";
import { ConvexClient } from "convex/browser";
import { b as baml, onLogEvent } from "../baml_client";

// Google API clients — same as before, only tool layer changes
import { getCalendarClient, calendarId } from "@synqai/gworkspace-calendar/src/google-auth";
import { createCalendarTools } from "@synqai/gworkspace-calendar/src/tools";
import { getGmailClient, userId } from "@synqai/gworkspace-gmail/src/google-auth";
import { createGmailTools } from "@synqai/gworkspace-gmail/src/tools";
import { getDocsClient, getDriveClient as getDocsDrive } from "@synqai/gworkspace-docs/src/google-auth";
import { createDocsTools } from "@synqai/gworkspace-docs/src/tools";
import { getSheetsClient, getDriveClient as getSheetsDrive } from "@synqai/gworkspace-sheets/src/google-auth";
import { createSheetsTools } from "@synqai/gworkspace-sheets/src/tools";
import { getMeetClient } from "@synqai/gworkspace-meet/src/google-auth";
import { createMeetTools } from "@synqai/gworkspace-meet/src/tools";
import { getDriveClient } from "@synqai/gworkspace-drive/src/google-auth";
import { createDriveTools } from "@synqai/gworkspace-drive/src/tools";
import { createDiscordGateway } from "@synqai/gateway-discord";

import { api } from "../../convex/_generated/api.js";
import { createLogger } from "./logging";
import { createToolRegistry } from "./tool-registry";
import { createAgent } from "./agent-loop";
import { createWorker } from "./worker";
import { createBot } from "./bot";

// ── Logger ──
const log = createLogger("synqai");

// ── BAML → Pino bridge (one client now, not 7) ──
onLogEvent((event: any) => {
  const data = Array.isArray(event) ? event[1] : event;
  if (!data) return;
  log.child("baml").info("llm_call", {
    prompt: data.prompt,
    rawOutput: data.rawOutput,
    parsedOutput: data.parsedOutput,
    startTime: data.startTime,
    eventId: data.metadata?.eventId,
  });
});

// ── Convex ──
const convex = new ConvexClient(process.env.CONVEX_URL!);

// ── Tools (same Google API clients, flat registry) ──
const calendarTools = createCalendarTools({ calendar: getCalendarClient(), calendarId });
const gmailTools = createGmailTools({ gmail: getGmailClient(), userId });
const docsTools = createDocsTools({ docs: getDocsClient(), drive: getDocsDrive() });
const sheetsTools = createSheetsTools({ sheets: getSheetsClient(), drive: getSheetsDrive() });
const meetTools = createMeetTools({ meet: getMeetClient() });
const driveTools = createDriveTools({ drive: getDriveClient() });

const tools = createToolRegistry({
  calendarTools, gmailTools, sheetsTools, docsTools, driveTools, meetTools,
});

// ── Memory Store (Convex-backed working memory) ──
const memoryStore = {
  load: (scope: string) =>
    convex.query(api.memory.getMemory, { scope }),
  save: (scope: string, note: string) =>
    convex.mutation(api.memory.appendMemory, { scope, note }),
};

// ── Agent (2-loop: plan → execute, with working memory) ──
const agent = createAgent({
  baml: {
    makePlan: (thread, workingMemory, today) =>
      baml.MakePlan(thread, workingMemory, today),
    nextAction: (thread, workingMemory, plan, currentStep, stepHistory, today) =>
      baml.NextAction(thread, workingMemory, plan, currentStep, stepHistory, today),
  },
  tools,
  memoryStore,
  log: log.child("agent"),
});

// ── Worker (outer HITL loop) ──
const worker = createWorker({ convex, agent, log: log.child("worker") });

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
