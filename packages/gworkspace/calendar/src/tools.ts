import type { CreateEvent, ListEvents } from "../baml_client";

export async function handleCreateEvent(event: CreateEvent) {
  console.log(`[stub] Creating event: "${event.summary}" on ${event.date} ${event.startTime}-${event.endTime}`);
  return {
    id: "fake-" + Math.random().toString(36).slice(2, 8),
    summary: event.summary,
    link: "https://calendar.google.com/fake",
  };
}

export async function handleListEvents(query: ListEvents) {
  console.log(`[stub] Listing events for ${query.date}`);
  return { events: [] };
}
