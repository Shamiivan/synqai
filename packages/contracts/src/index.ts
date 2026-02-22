import type { ConvexClient } from "convex/browser";
import type { calendar_v3, gmail_v1, docs_v1, sheets_v4, drive_v3, meet_v2 } from "googleapis";

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
  handleArchiveEmail: (step: any) => Promise<any>;
  handleTrashEmail: (step: any) => Promise<any>;
  handleForwardEmail: (step: any) => Promise<any>;
  handleMarkRead: (step: any) => Promise<any>;
  handleMarkUnread: (step: any) => Promise<any>;
  handleStarEmail: (step: any) => Promise<any>;
  handleUnstarEmail: (step: any) => Promise<any>;
  handleModifyLabels: (step: any) => Promise<any>;
}

// ── Gmail Agent ──

export interface GmailAgentDependencies {
  baml: {
    gmailNextStep: (thread: string, today: string) => Promise<unknown>;
  };
  tools: GmailTools;
  log: Logger;
}

// ── Docs Tools ──

export interface DocsToolsDependencies {
  docs: docs_v1.Docs;
  drive: drive_v3.Drive;
}

export interface DocsTools {
  handleCreateDocument: (step: any) => Promise<any>;
  handleGetDocument: (step: any) => Promise<any>;
  handleInsertText: (step: any) => Promise<any>;
  handleReplaceText: (step: any) => Promise<any>;
  handleListDocuments: (step: any) => Promise<any>;
  handleFormatText: (step: any) => Promise<any>;
  handleFormatParagraph: (step: any) => Promise<any>;
}

// ── Docs Agent ──

export interface DocsAgentDependencies {
  baml: {
    docsNextStep: (thread: string, today: string) => Promise<unknown>;
  };
  tools: DocsTools;
  log: Logger;
}

// ── Sheets Tools ──

export interface SheetsToolsDependencies {
  sheets: sheets_v4.Sheets;
  drive: drive_v3.Drive;
}

export interface SheetsTools {
  handleCreateSpreadsheet: (step: any) => Promise<any>;
  handleGetSpreadsheet: (step: any) => Promise<any>;
  handleReadValues: (step: any) => Promise<any>;
  handleWriteValues: (step: any) => Promise<any>;
  handleAppendRows: (step: any) => Promise<any>;
  handleClearRange: (step: any) => Promise<any>;
  handleAddSheet: (step: any) => Promise<any>;
  handleListSpreadsheets: (step: any) => Promise<any>;
}

// ── Sheets Agent ──

export interface SheetsAgentDependencies {
  baml: {
    sheetsNextStep: (thread: string, today: string) => Promise<unknown>;
  };
  tools: SheetsTools;
  log: Logger;
}

// ── Meet Tools ──

export interface MeetToolsDependencies {
  meet: meet_v2.Meet;
}

export interface MeetTools {
  handleCreateMeeting: (step: any) => Promise<any>;
  handleGetMeeting: (step: any) => Promise<any>;
  handleEndMeeting: (step: any) => Promise<any>;
  handleListConferences: (step: any) => Promise<any>;
  handleListRecordings: (step: any) => Promise<any>;
  handleListTranscripts: (step: any) => Promise<any>;
  handleGetTranscriptEntries: (step: any) => Promise<any>;
}

// ── Meet Agent ──

export interface MeetAgentDependencies {
  baml: {
    meetNextStep: (thread: string, today: string) => Promise<unknown>;
  };
  tools: MeetTools;
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
