import type { ConvexClient } from "convex/browser";
import type { calendar_v3, gmail_v1 } from "googleapis";

// ── Logger (shared by all layers) ──

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
  child(name: string): Logger;
}

// ── Calendar Tools ──

export interface CalendarToolsDependencies {
  calendar: calendar_v3.Calendar;
  calendarId: string;
}

export interface CalendarTools {
  handleCreateEvent: (step: any) => Promise<any>;
  handleListEvents: (step: any) => Promise<any>;
  handleGetEvent: (step: any) => Promise<any>;
  handleUpdateEvent: (step: any) => Promise<any>;
  handleDeleteEvent: (step: any) => Promise<any>;
  handleCheckAvailability: (step: any) => Promise<any>;
  handleQuickAdd: (step: any) => Promise<any>;
}

// ── Calendar Agent ──

export interface CalendarAgentDependencies {
  baml: {
    calendarNextStep: (thread: string, today: string) => Promise<unknown>;
  };
  tools: CalendarTools;
  log: Logger;
}

// ── Gmail Tools ──

export interface GmailToolsDependencies {
  gmail: gmail_v1.Gmail;
  userId: string;
}

export interface GmailTools {
  handleListEmails: (step: any) => Promise<any>;
  handleReadEmail: (step: any) => Promise<any>;
  handleSendEmail: (step: any) => Promise<any>;
  handleReplyToEmail: (step: any) => Promise<any>;
  handleCreateDraft: (step: any) => Promise<any>;
}

// ── Gmail Agent ──

export interface GmailAgentDependencies {
  baml: {
    gmailNextStep: (thread: string, today: string) => Promise<unknown>;
  };
  tools: GmailTools;
  log: Logger;
}

// ── Agent Registry ──

export type AgentRunner = (thread: any, log?: Logger) => Promise<any>;

// ── Router ──

export interface RouterDependencies {
  baml: {
    determineNextStep: (thread: string, lastMessage: string) => Promise<unknown>;
  };
  agents: Record<string, AgentRunner>;
  log: Logger;
}

// ── Worker ──

export interface WorkerDependencies {
  convex: ConvexClient;
  route: (thread: any) => Promise<any>;
  routeToAgent: (agent: string, thread: any) => Promise<any>;
  log: Logger;
}

// ── Discord Gateway ──

export interface GatewayMessage {
  id: string;
  content: string;
  channelId: string;
  authorBot: boolean;
  isThread: boolean;
  threadId?: string;
  parentChannelId?: string;
}

export interface DiscordGateway {
  onReady(handler: () => Promise<void>): void;
  onMessage(handler: (msg: GatewayMessage) => Promise<void>): void;
  fetchThread(threadId: string): Promise<{ send(content: string): Promise<void> } | null>;
  startThread(channelId: string, messageId: string, name: string): Promise<{ id: string; send(content: string): Promise<void> }>;
  createThread(channelId: string, name: string): Promise<{ id: string; send(content: string): Promise<void> }>;
  reply(channelId: string, messageId: string, content: string): Promise<void>;
  login(token: string): Promise<void>;
}

// ── Bot ──

export interface BotDependencies {
  discord: DiscordGateway;
  convex: ConvexClient;
  startWorker: () => void;
  log: Logger;
}
