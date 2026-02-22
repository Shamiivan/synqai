class CreateEvent {
  intent "create_event" @description("Always 'create_event'")
  summary string @description("Event title")
  date string @description("Date in YYYY-MM-DD format")
  startTime string @description("Start time in HH:MM 24h format")
  endTime string @description("End time in HH:MM 24h format")
  description string @description("Event description")
  location string? @description("Event location if mentioned")
  timezone string @description("IANA timezone e.g. America/New_York")
}

class ListEvents {
  intent "list_events" @description("Always 'list_events'")
  date string @description("Date in YYYY-MM-DD format")
  timezone string @description("IANA timezone e.g. America/New_York")
}

class GetEvent {
  intent "get_event" @description("Always 'get_event'")
  eventId string @description("The event ID from a previous list_events response")
}

class UpdateEvent {
  intent "update_event" @description("Always 'update_event'")
  eventId string @description("The event ID from a previous get_event or list_events")
  summary string? @description("New title, omit to keep current")
  date string? @description("New date YYYY-MM-DD, omit to keep current")
  startTime string? @description("New start HH:MM 24h, omit to keep current")
  endTime string? @description("New end HH:MM 24h, omit to keep current")
  description string? @description("New description, omit to keep current")
  location string? @description("New location, omit to keep current")
  timezone string @description("IANA timezone for any time fields")
}

class DeleteEvent {
  intent "delete_event" @description("Always 'delete_event'")
  eventId string @description("The event ID to delete")
  confirmation string @description("State what you are deleting, e.g. 'Deleting: Team standup on 2026-02-23'")
}

class CheckAvailability {
  intent "check_availability" @description("Always 'check_availability'")
  date string @description("Date in YYYY-MM-DD format")
  startTime string @description("Start of window in HH:MM 24h format")
  endTime string @description("End of window in HH:MM 24h format")
  timezone string @description("IANA timezone")
}

class QuickAdd {
  intent "quick_add" @description("Always 'quick_add'")
  text string @description("Natural language event description e.g. 'Lunch with Bob tomorrow at noon'")
}

class RequestInfo {
  intent "request_info" @description("Always 'request_info'")
  message string @description("Question to ask the human")
}

class CalendarDone {
  intent "done" @description("Always 'done'")
  message string @description("Final response to the human")
}

type CalendarStep = CreateEvent | ListEvents | GetEvent | UpdateEvent | DeleteEvent | CheckAvailability | QuickAdd | RequestInfo | CalendarDone

function CalendarNextStep(thread: string, today: string) -> CalendarStep {
  client Gemini
  prompt #"
    {{ _.role("system") }}

    You are a calendar assistant. You help users create, view, update, and delete calendar events.

    Available actions:
    - create_event: Create a new event (needs summary, date, start/end time, description, timezone)
    - list_events: List all events for a given date
    - get_event: Get full details of a specific event by ID (from a previous list)
    - update_event: Modify an existing event (partial update — only include fields to change)
    - delete_event: Delete an event by ID (always confirm with user first)
    - check_availability: Check if a time slot is free using freeBusy API
    - quick_add: Create an event from natural language (use only when user gives a full description in one sentence)
    - request_info: Ask the human for missing information
    - done: Finish with a summary message

    Rules:
    - Default timezone: America/Toronto
    - Default event duration: 1 hour (if end time not specified)
    - Always list_events for the target date before creating, to check for conflicts
    - If a conflict exists, inform the user via request_info before proceeding
    - When listing events, include the full day (not just working hours)
    - For recurring events, clarify if the user means this instance or all
    - When updating or deleting, always confirm the right event via get_event or list_events first
    - Never delete without user confirmation via request_info
    - If the API returns an error, explain it to the user in plain language via done
    - Event IDs from list_events are required for get/update/delete — never guess or fabricate IDs
    - Use quick_add only when the user provides a complete natural event description in one sentence
    - When the user asks about a specific event, use get_event with the event ID from a previous list

    Today's date is {{ today }}.

    {{ _.role("user") }}

    {{ thread }}

    What should the next step be?

    {{ ctx.output_format }}
  "#
}
