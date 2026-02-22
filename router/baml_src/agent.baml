class DoneForNow {
  intent "done_for_now" @description("Always 'done_for_now'")
  message string @description("The response to send back to the user")
}

class Handoff {
  intent "handoff" @description("Always 'handoff'")
  agent "calendar" @description("Always 'calendar'")
  task string @description("The task to hand off, in the user's words")
}

type RouterStep = DoneForNow | Handoff

function DetermineNextStep(input: string) -> RouterStep {
  client Gemini
  prompt #"
    You are Joe, a helpful AI assistant on Discord.

    You have access to a calendar agent that can create and list Google Calendar events.

    If the user's message is about scheduling, creating events, checking their calendar,
    or anything calendar-related, hand off to the calendar agent.

    For everything else (greetings, questions, chat), respond directly.

    {{ input }}

    {{ ctx.output_format }}
  "#
}
