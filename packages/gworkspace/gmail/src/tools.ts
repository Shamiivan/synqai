import type { gmail_v1 } from "googleapis";
import type {
  ListEmails,
  ReadEmail,
  SendEmail,
  ReplyToEmail,
  ForwardEmail,
  CreateDraft,
  ArchiveEmail,
  TrashEmail,
  MarkRead,
  MarkUnread,
  StarEmail,
  UnstarEmail,
  ModifyLabels,
} from "../baml_client";
import type { GmailToolsDependencies, GmailTools, Artifact } from "@synqai/contracts";
import { classifyGmailError } from "./errors";

// ── Factory ──────────────────────────────────────────────

export function createGmailTools(
  dependencies: GmailToolsDependencies,
): GmailTools {
  const { gmail, userId } = dependencies;
  return {
    handleListEmails: (step) => handleListEmails(step, gmail, userId),
    handleReadEmail: (step) => handleReadEmail(step, gmail, userId),
    handleSendEmail: (step) => handleSendEmail(step, gmail, userId),
    handleReplyToEmail: (step) => handleReplyToEmail(step, gmail, userId),
    handleCreateDraft: (step) => handleCreateDraft(step, gmail, userId),
    handleArchiveEmail: (step) => handleArchiveEmail(step, gmail, userId),
    handleTrashEmail: (step) => handleTrashEmail(step, gmail, userId),
    handleForwardEmail: (step) => handleForwardEmail(step, gmail, userId),
    handleMarkRead: (step) => handleMarkRead(step, gmail, userId),
    handleMarkUnread: (step) => handleMarkUnread(step, gmail, userId),
    handleStarEmail: (step) => handleStarEmail(step, gmail, userId),
    handleUnstarEmail: (step) => handleUnstarEmail(step, gmail, userId),
    handleModifyLabels: (step) => handleModifyLabels(step, gmail, userId),
  };
}

async function handleListEmails(
  step: ListEmails,
  gmail: gmail_v1.Gmail,
  userId: string,
) {
  try {
    const listRes = await gmail.users.messages.list({
      userId,
      q: step.query,
      maxResults: Math.min(step.maxResults ?? 10, 20),
    });

    const messageIds = (listRes.data.messages ?? []).map((m) => m.id!);
    if (messageIds.length === 0) return { emails: [], total: 0 };

    // Batch-fetch metadata for each message
    const emails = await Promise.all(
      messageIds.map(async (id) => {
        const msg = await gmail.users.messages.get({
          userId,
          id,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"],
        });
        const headers = msg.data.payload?.headers ?? [];
        const header = (name: string) =>
          headers.find((h) => h.name === name)?.value ?? "";
        return {
          id: msg.data.id,
          threadId: msg.data.threadId,
          subject: header("Subject"),
          from: header("From"),
          date: header("Date"),
          snippet: msg.data.snippet,
          unread: (msg.data.labelIds ?? []).includes("UNREAD"),
          starred: (msg.data.labelIds ?? []).includes("STARRED"),
        };
      }),
    );

    const artifacts: Artifact[] = emails.map((e) => ({
      ref: `gmail:message:${e.id}`,
      kind: "gmail_message" as const,
      domain: "gmail" as const,
      id: e.id!,
      label: e.subject || undefined,
    }));
    return { emails, total: listRes.data.resultSizeEstimate ?? emails.length, artifacts };
  } catch (err) {
    return { error: classifyGmailError(err) };
  }
}

// ── Read ─────────────────────────────────────────────────

async function handleReadEmail(
  step: ReadEmail,
  gmail: gmail_v1.Gmail,
  userId: string,
) {
  try {
    const msg = await gmail.users.messages.get({
      userId,
      id: step.messageId,
      format: "full",
    });

    const headers = msg.data.payload?.headers ?? [];
    const header = (name: string) =>
      headers.find((h) => h.name === name)?.value ?? "";

    const result = {
      id: msg.data.id,
      threadId: msg.data.threadId,
      subject: header("Subject"),
      from: header("From"),
      to: header("To"),
      date: header("Date"),
      body: extractBody(msg.data.payload),
      labels: msg.data.labelIds,
    };
    const artifacts: Artifact[] = [{
      ref: `gmail:message:${result.id}`,
      kind: "gmail_message",
      domain: "gmail",
      id: result.id!,
      label: result.subject || undefined,
    }];
    return { ...result, artifacts };
  } catch (err) {
    return { error: classifyGmailError(err) };
  }
}

// ── Send ─────────────────────────────────────────────────

async function handleSendEmail(
  step: SendEmail,
  gmail: gmail_v1.Gmail,
  userId: string,
) {
  try {
    const raw = buildRawMessage({
      to: step.to,
      subject: step.subject,
      body: step.body,
    });
    const res = await gmail.users.messages.send({
      userId,
      requestBody: { raw },
    });
    const artifacts: Artifact[] = [{
      ref: `gmail:message:${res.data.id}`,
      kind: "gmail_message",
      domain: "gmail",
      id: res.data.id!,
      label: step.subject || undefined,
    }];
    return { id: res.data.id, threadId: res.data.threadId, sent: true, artifacts };
  } catch (err) {
    return { error: classifyGmailError(err) };
  }
}

// ── Reply ────────────────────────────────────────────────

async function handleReplyToEmail(
  step: ReplyToEmail,
  gmail: gmail_v1.Gmail,
  userId: string,
) {
  try {
    // Get original message for threading headers
    const original = await gmail.users.messages.get({
      userId,
      id: step.messageId,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "To", "Message-ID"],
    });

    const headers = original.data.payload?.headers ?? [];
    const header = (name: string) =>
      headers.find((h) => h.name === name)?.value ?? "";
    const messageId = header("Message-ID");
    const subject = header("Subject");
    const from = header("From");

    // Reply goes to the original sender
    const replyTo = from;
    const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;

    const raw = buildRawMessage({
      to: replyTo,
      subject: replySubject,
      body: step.body,
      inReplyTo: messageId,
      references: messageId,
    });

    const res = await gmail.users.messages.send({
      userId,
      requestBody: { raw, threadId: original.data.threadId ?? undefined },
    });

    const artifacts: Artifact[] = [{
      ref: `gmail:message:${res.data.id}`,
      kind: "gmail_message",
      domain: "gmail",
      id: res.data.id!,
      label: replySubject || undefined,
    }];
    return { id: res.data.id, threadId: res.data.threadId, replied: true, artifacts };
  } catch (err) {
    return { error: classifyGmailError(err) };
  }
}

// ── Draft ────────────────────────────────────────────────

async function handleCreateDraft(
  step: CreateDraft,
  gmail: gmail_v1.Gmail,
  userId: string,
) {
  try {
    const raw = buildRawMessage({
      to: step.to,
      subject: step.subject,
      body: step.body,
    });
    const res = await gmail.users.drafts.create({
      userId,
      requestBody: { message: { raw } },
    });
    const artifacts: Artifact[] = [{
      ref: `gmail:draft:${res.data.id}`,
      kind: "gmail_draft",
      domain: "gmail",
      id: res.data.id!,
      label: step.subject || undefined,
    }];
    return { id: res.data.id, draftCreated: true, artifacts };
  } catch (err) {
    return { error: classifyGmailError(err) };
  }
}

// ── Archive ──────────────────────────────────────────────

async function handleArchiveEmail(
  step: ArchiveEmail,
  gmail: gmail_v1.Gmail,
  userId: string,
) {
  try {
    await gmail.users.messages.modify({
      userId,
      id: step.messageId,
      requestBody: { removeLabelIds: ["INBOX"] },
    });
    return { archived: true, messageId: step.messageId };
  } catch (err) {
    return { error: classifyGmailError(err) };
  }
}

// ── Trash ────────────────────────────────────────────────

async function handleTrashEmail(
  step: TrashEmail,
  gmail: gmail_v1.Gmail,
  userId: string,
) {
  try {
    await gmail.users.messages.trash({ userId, id: step.messageId });
    return { trashed: true, messageId: step.messageId };
  } catch (err) {
    return { error: classifyGmailError(err) };
  }
}

// ── Forward ──────────────────────────────────────────────

async function handleForwardEmail(step: ForwardEmail, gmail: gmail_v1.Gmail, userId: string) {
  try {
    const original = await gmail.users.messages.get({
      userId,
      id: step.messageId,
      format: "full",
    });

    const headers = original.data.payload?.headers ?? [];
    const header = (name: string) => headers.find((h) => h.name === name)?.value ?? "";
    const subject = header("Subject");
    const from = header("From");
    const date = header("Date");
    const to = header("To");

    const originalBody = extractBody(original.data.payload);
    const forwardHeader = [
      "---------- Forwarded message ----------",
      `From: ${from}`,
      `Date: ${date}`,
      `Subject: ${subject}`,
      `To: ${to}`,
      "",
    ].join("\n");

    const body = step.comment
      ? `${step.comment}\n\n${forwardHeader}\n${originalBody}`
      : `${forwardHeader}\n${originalBody}`;

    const fwdSubject = subject.startsWith("Fwd:") ? subject : `Fwd: ${subject}`;
    const raw = buildRawMessage({ to: step.to, subject: fwdSubject, body });
    const res = await gmail.users.messages.send({ userId, requestBody: { raw } });
    const artifacts: Artifact[] = [{
      ref: `gmail:message:${res.data.id}`,
      kind: "gmail_message",
      domain: "gmail",
      id: res.data.id!,
      label: fwdSubject || undefined,
    }];
    return { id: res.data.id, threadId: res.data.threadId, forwarded: true, artifacts };
  } catch (err) {
    return { error: classifyGmailError(err) };
  }
}

// ── Mark Read ────────────────────────────────────────────

async function handleMarkRead(step: MarkRead, gmail: gmail_v1.Gmail, userId: string) {
  try {
    await gmail.users.messages.modify({
      userId, id: step.messageId,
      requestBody: { removeLabelIds: ["UNREAD"] },
    });
    return { markedRead: true, messageId: step.messageId };
  } catch (err) {
    return { error: classifyGmailError(err) };
  }
}

// ── Mark Unread ──────────────────────────────────────────

async function handleMarkUnread(step: MarkUnread, gmail: gmail_v1.Gmail, userId: string) {
  try {
    await gmail.users.messages.modify({
      userId, id: step.messageId,
      requestBody: { addLabelIds: ["UNREAD"] },
    });
    return { markedUnread: true, messageId: step.messageId };
  } catch (err) {
    return { error: classifyGmailError(err) };
  }
}

// ── Star ─────────────────────────────────────────────────

async function handleStarEmail(step: StarEmail, gmail: gmail_v1.Gmail, userId: string) {
  try {
    await gmail.users.messages.modify({
      userId, id: step.messageId,
      requestBody: { addLabelIds: ["STARRED"] },
    });
    return { starred: true, messageId: step.messageId };
  } catch (err) {
    return { error: classifyGmailError(err) };
  }
}

// ── Unstar ───────────────────────────────────────────────

async function handleUnstarEmail(step: UnstarEmail, gmail: gmail_v1.Gmail, userId: string) {
  try {
    await gmail.users.messages.modify({
      userId, id: step.messageId,
      requestBody: { removeLabelIds: ["STARRED"] },
    });
    return { unstarred: true, messageId: step.messageId };
  } catch (err) {
    return { error: classifyGmailError(err) };
  }
}

// ── Modify Labels ────────────────────────────────────────

async function handleModifyLabels(step: ModifyLabels, gmail: gmail_v1.Gmail, userId: string) {
  try {
    await gmail.users.messages.modify({
      userId, id: step.messageId,
      requestBody: { addLabelIds: step.addLabels, removeLabelIds: step.removeLabels },
    });
    return { labelsModified: true, messageId: step.messageId, added: step.addLabels, removed: step.removeLabels };
  } catch (err) {
    return { error: classifyGmailError(err) };
  }
}

// ── Helpers ──────────────────────────────────────────────

/** Build an RFC 2822 raw message and base64url-encode it for the Gmail API. */
function buildRawMessage(opts: {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
  ];
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) lines.push(`References: ${opts.references}`);
  lines.push("", opts.body);

  const rawMessage = lines.join("\r\n");
  return Buffer.from(rawMessage).toString("base64url");
}

/** Extract plain text body from a Gmail message payload. */
function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";

  // Simple single-part message
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  // Multipart — walk parts, prefer text/plain
  if (payload.parts) {
    // First pass: look for text/plain
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }
    // Second pass: text/html with tag stripping
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = Buffer.from(part.body.data, "base64url").toString("utf-8");
        return stripHtml(html);
      }
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      if (part.mimeType?.startsWith("multipart/")) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }

  return "";
}

/** Minimal HTML → plain text. */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
