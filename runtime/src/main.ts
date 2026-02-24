import "./env"; // must be first — loads .env.local before other modules

import { Client, GatewayIntentBits } from "discord.js";
import { ConvexClient } from "convex/browser";
import { b as routerBaml, onLogEvent as onRouterLog } from "../baml_client";
import { b as calendarBaml, onLogEvent as onCalendarLog } from "@synqai/gworkspace-calendar/baml_client";
import { b as gmailBaml, onLogEvent as onGmailLog } from "@synqai/gworkspace-gmail/baml_client";
import { b as docsBaml, onLogEvent as onDocsLog } from "@synqai/gworkspace-docs/baml_client";
import { b as sheetsBaml, onLogEvent as onSheetsLog } from "@synqai/gworkspace-sheets/baml_client";
import { b as meetBaml, onLogEvent as onMeetLog } from "@synqai/gworkspace-meet/baml_client";
import { b as driveBaml, onLogEvent as onDriveLog } from "@synqai/gworkspace-drive/baml_client";
import { getCalendarClient, calendarId } from "@synqai/gworkspace-calendar/src/google-auth";
import { createCalendarTools } from "@synqai/gworkspace-calendar/src/tools";
import { createCalendarAgent } from "@synqai/gworkspace-calendar/src/agent";
import { getGmailClient, userId } from "@synqai/gworkspace-gmail/src/google-auth";
import { createGmailTools } from "@synqai/gworkspace-gmail/src/tools";
import { createGmailAgent } from "@synqai/gworkspace-gmail/src/agent";
import { getDocsClient, getDriveClient as getDocsDrive } from "@synqai/gworkspace-docs/src/google-auth";
import { createDocsTools } from "@synqai/gworkspace-docs/src/tools";
import { createDocsAgent } from "@synqai/gworkspace-docs/src/agent";
import { getSheetsClient, getDriveClient as getSheetsDrive } from "@synqai/gworkspace-sheets/src/google-auth";
import { createSheetsTools } from "@synqai/gworkspace-sheets/src/tools";
import { createSheetsAgent } from "@synqai/gworkspace-sheets/src/agent";
import { getMeetClient } from "@synqai/gworkspace-meet/src/google-auth";
import { createMeetTools } from "@synqai/gworkspace-meet/src/tools";
import { createMeetAgent } from "@synqai/gworkspace-meet/src/agent";
import { getDriveClient } from "@synqai/gworkspace-drive/src/google-auth";
import { createDriveTools } from "@synqai/gworkspace-drive/src/tools";
import { createDriveAgent } from "@synqai/gworkspace-drive/src/agent";
import { createDiscordGateway } from "@synqai/gateway-discord";
import { createLogger } from "./logging";
import { createGWorkspaceAgent } from "./agents/gworkspace";
import { createRouter } from "./agents/router";
import { createWorker } from "./worker";
import { createBot } from "./bot";

// ── Logger ──
const log = createLogger("synqai");

// ── BAML → Pino bridge (sends prompt/output to Axiom) ──
const bamlLog = log.child("baml");
const bamlLogHandler = (event: any) => {
  // onLogEvent passes [error, data] — the actual BamlLogEvent is at index 1
  const data = Array.isArray(event) ? event[1] : event;
  if (!data) return;
  bamlLog.info("llm_call", {
    prompt: data.prompt,
    rawOutput: data.rawOutput,
    parsedOutput: data.parsedOutput,
    startTime: data.startTime,
    eventId: data.metadata?.eventId,
  });
};
for (const register of [onRouterLog, onCalendarLog, onGmailLog, onDocsLog, onSheetsLog, onMeetLog, onDriveLog]) {
  register(bamlLogHandler);
}

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

// ── Google Docs ──
const docsClient = getDocsClient();
const docsDrive = getDocsDrive();
const docsTools = createDocsTools({ docs: docsClient, drive: docsDrive });

// ── Docs Agent ──
const docsAgent = createDocsAgent({
  baml: { docsNextStep: (thread, today) => docsBaml.DocsNextStep(thread, today) },
  tools: docsTools,
  log: log.child("docs"),
});

// ── Google Sheets ──
const sheetsClient = getSheetsClient();
const sheetsDrive = getSheetsDrive();
const sheetsTools = createSheetsTools({ sheets: sheetsClient, drive: sheetsDrive });

// ── Sheets Agent ──
const sheetsAgent = createSheetsAgent({
  baml: { sheetsNextStep: (thread, today) => sheetsBaml.SheetsNextStep(thread, today) },
  tools: sheetsTools,
  log: log.child("sheets"),
});

// ── Google Meet ──
const meetClient = getMeetClient();
const meetTools = createMeetTools({ meet: meetClient });

// ── Meet Agent ──
const meetAgent = createMeetAgent({
  baml: { meetNextStep: (thread, today) => meetBaml.MeetNextStep(thread, today) },
  tools: meetTools,
  log: log.child("meet"),
});

// ── Google Drive ──
const driveClient = getDriveClient();
const driveTools = createDriveTools({ drive: driveClient });

// ── Drive Agent ──
const driveAgent = createDriveAgent({
  baml: { driveNextStep: (thread, today) => driveBaml.DriveNextStep(thread, today) },
  tools: driveTools,
  log: log.child("drive"),
});

// ── GWorkspace Agent (coordinates domain agents) ──
const gworkspaceAgent = createGWorkspaceAgent({
  baml: {
    gworkspaceNextStep: (thread, today, artifacts) =>
      routerBaml.GWorkspaceNextStep(thread, today, artifacts),
  },
  agents: {
    calendar: (thread, childLog) => calendarAgent.run(thread, childLog),
    gmail: (thread, childLog) => gmailAgent.run(thread, childLog),
    docs: (thread, childLog) => docsAgent.run(thread, childLog),
    sheets: (thread, childLog) => sheetsAgent.run(thread, childLog),
    meet: (thread, childLog) => meetAgent.run(thread, childLog),
    drive: (thread, childLog) => driveAgent.run(thread, childLog),
  },
  log: log.child("gworkspace"),
});

// ── Router (top-level intent classification) ──
const router = createRouter({
  baml: { determineNextStep: (thread, lastMsg) => routerBaml.DetermineNextStep(thread, lastMsg) },
  agents: {
    gworkspace: gworkspaceAgent,
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
