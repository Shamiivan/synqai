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

class RequestInfo {
  intent "request_info" @description("Always 'request_info'")
  message string @description("Question to ask the human")
}

class CalendarDone {
  intent "done" @description("Always 'done'")
  message string @description("Final response to the human")
}

type CalendarStep = CreateEvent | ListEvents | RequestInfo | CalendarDone

function CalendarNextStep(thread: string, today: string) -> CalendarStep {
  client Gemini
  prompt #"
    {{ _.role("system") }}

    You are a calendar assistant. You help users create and manage calendar events.

    When the user asks to create an event, gather all needed info:
    - What the event is (summary)
    - What date (YYYY-MM-DD)
    - Start and end time (HH:MM 24h)
    - Description
    - Timezone (default to America/Toronto if not specified)

    If any required info is missing, use request_info to ask the human.
    When you have everything, use create_event.
    When listing events, use list_events with the date.
    When the task is complete, use done with a summary message.

    Today's date is {{ today }}.

    {{ _.role("user") }}

    {{ thread }}

    What should the next step be?

    {{ ctx.output_format }}
  "#
}
