import type {
  CreateEvent,
  ListEvents,
  GetEvent,
  UpdateEvent,
  DeleteEvent,
  CheckAvailability,
  QuickAdd,
} from "../baml_client";
import { getCalendarClient, calendarId } from "./google-auth";
import { classifyCalendarError } from "./errors";

// ── Create ────────────────────────────────────────────────

export async function handleCreateEvent(event: CreateEvent) {
  try {
    const calendar = getCalendarClient();
    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: event.summary,
        description: event.description,
        location: event.location ?? undefined,
        start: { dateTime: `${event.date}T${event.startTime}:00`, timeZone: event.timezone },
        end: { dateTime: `${event.date}T${event.endTime}:00`, timeZone: event.timezone },
      },
    });
    return { id: res.data.id!, summary: res.data.summary!, link: res.data.htmlLink! };
  } catch (err) {
    return { error: classifyCalendarError(err) };
  }
}

// ── List ──────────────────────────────────────────────────

export async function handleListEvents(query: ListEvents) {
  try {
    const calendar = getCalendarClient();
    const timeMin = `${query.date}T00:00:00`;
    const timeMax = `${query.date}T23:59:59`;
    const res = await calendar.events.list({
      calendarId,
      timeMin: new Date(`${timeMin}${getUtcOffset(query.timezone)}`).toISOString(),
      timeMax: new Date(`${timeMax}${getUtcOffset(query.timezone)}`).toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });
    const events = (res.data.items ?? []).map((e) => ({
      id: e.id,
      summary: e.summary,
      start: e.start?.dateTime ?? e.start?.date,
      end: e.end?.dateTime ?? e.end?.date,
      location: e.location,
    }));
    return { events };
  } catch (err) {
    return { error: classifyCalendarError(err), events: [] };
  }
}

// ── Get ───────────────────────────────────────────────────

export async function handleGetEvent(query: GetEvent) {
  try {
    const calendar = getCalendarClient();
    const res = await calendar.events.get({ calendarId, eventId: query.eventId });
    const e = res.data;
    return {
      id: e.id,
      summary: e.summary,
      description: e.description,
      start: e.start?.dateTime ?? e.start?.date,
      end: e.end?.dateTime ?? e.end?.date,
      location: e.location,
      attendees: (e.attendees ?? []).map((a) => a.email),
      htmlLink: e.htmlLink,
      status: e.status,
    };
  } catch (err) {
    return { error: classifyCalendarError(err) };
  }
}

// ── Update ────────────────────────────────────────────────

export async function handleUpdateEvent(update: UpdateEvent) {
  try {
    const calendar = getCalendarClient();
    const body: Record<string, unknown> = {};

    if (update.summary != null) body.summary = update.summary;
    if (update.description != null) body.description = update.description;
    if (update.location != null) body.location = update.location;

    if (update.date != null || update.startTime != null) {
      // Need to build start — fetch current event for defaults
      const current = await calendar.events.get({ calendarId, eventId: update.eventId });
      const curStart = current.data.start?.dateTime ?? "";
      const curDate = update.date ?? curStart.slice(0, 10);
      const curTime = update.startTime ?? curStart.slice(11, 16);
      body.start = { dateTime: `${curDate}T${curTime}:00`, timeZone: update.timezone };
    }

    if (update.date != null || update.endTime != null) {
      const current = await calendar.events.get({ calendarId, eventId: update.eventId });
      const curEnd = current.data.end?.dateTime ?? "";
      const curDate = update.date ?? curEnd.slice(0, 10);
      const curTime = update.endTime ?? curEnd.slice(11, 16);
      body.end = { dateTime: `${curDate}T${curTime}:00`, timeZone: update.timezone };
    }

    const res = await calendar.events.patch({ calendarId, eventId: update.eventId, requestBody: body });
    return { id: res.data.id!, summary: res.data.summary!, link: res.data.htmlLink!, updated: true };
  } catch (err) {
    return { error: classifyCalendarError(err) };
  }
}

// ── Delete ────────────────────────────────────────────────

export async function handleDeleteEvent(del: DeleteEvent) {
  try {
    const calendar = getCalendarClient();
    await calendar.events.delete({ calendarId, eventId: del.eventId });
    return { deleted: true, eventId: del.eventId };
  } catch (err) {
    return { error: classifyCalendarError(err) };
  }
}

// ── Check Availability ───────────────────────────────────

export async function handleCheckAvailability(query: CheckAvailability) {
  try {
    const calendar = getCalendarClient();
    const timeMin = new Date(`${query.date}T${query.startTime}:00${getUtcOffset(query.timezone)}`).toISOString();
    const timeMax = new Date(`${query.date}T${query.endTime}:00${getUtcOffset(query.timezone)}`).toISOString();
    const res = await calendar.freebusy.query({
      requestBody: { timeMin, timeMax, items: [{ id: calendarId }] },
    });
    const busySlots = res.data.calendars?.[calendarId]?.busy ?? [];
    return {
      busy: busySlots.length > 0,
      conflicts: busySlots.map((s) => ({ start: s.start, end: s.end })),
    };
  } catch (err) {
    return { error: classifyCalendarError(err) };
  }
}

// ── Quick Add ─────────────────────────────────────────────

export async function handleQuickAdd(query: QuickAdd) {
  try {
    const calendar = getCalendarClient();
    const res = await calendar.events.quickAdd({ calendarId, text: query.text });
    const e = res.data;
    return {
      id: e.id,
      summary: e.summary,
      start: e.start?.dateTime ?? e.start?.date,
      end: e.end?.dateTime ?? e.end?.date,
      link: e.htmlLink,
    };
  } catch (err) {
    return { error: classifyCalendarError(err) };
  }
}

// ── Helpers ───────────────────────────────────────────────

/** Convert IANA timezone to a UTC offset string for date parsing. */
function getUtcOffset(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "shortOffset" });
    const parts = formatter.formatToParts(now);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    const match = tzPart?.value.match(/GMT([+-]\d{1,2}(?::\d{2})?)/);
    if (match) {
      const raw = match[1];
      const [h, m] = raw.includes(":") ? raw.split(":") : [raw, "00"];
      const sign = h.startsWith("-") ? "-" : "+";
      const absH = Math.abs(parseInt(h)).toString().padStart(2, "0");
      const absM = (m ?? "00").padStart(2, "0");
      return `${sign}${absH}:${absM}`;
    }
  } catch {}
  return "Z";
}
