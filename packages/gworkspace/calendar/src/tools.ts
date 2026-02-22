import type { CreateEvent, ListEvents } from "../baml_client";
import { getCalendarClient, calendarId } from "./google-auth";

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
    return {
      id: res.data.id!,
      summary: res.data.summary!,
      link: res.data.htmlLink!,
    };
  } catch (err: any) {
    return { error: `Failed to create event: ${err.message}` };
  }
}

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
  } catch (err: any) {
    return { error: `Failed to list events: ${err.message}`, events: [] };
  }
}

/** Convert IANA timezone to a UTC offset string for date parsing. */
function getUtcOffset(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "shortOffset" });
    const parts = formatter.formatToParts(now);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    // tzPart.value is like "GMT-5" or "GMT+5:30"
    const match = tzPart?.value.match(/GMT([+-]\d{1,2}(?::\d{2})?)/);
    if (match) {
      const raw = match[1]; // e.g. "-5" or "+5:30"
      const [h, m] = raw.includes(":") ? raw.split(":") : [raw, "00"];
      const sign = h.startsWith("-") ? "-" : "+";
      const absH = Math.abs(parseInt(h)).toString().padStart(2, "0");
      const absM = (m ?? "00").padStart(2, "0");
      return `${sign}${absH}:${absM}`;
    }
  } catch {}
  return "Z";
}
