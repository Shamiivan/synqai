class DoneForNow {
  intent "done_for_now" @description("Respond directly to the user — for greetings, questions, chat, or anything not calendar/email-related")
  message string @description("The response to send back to the user")
}

class Handoff {
  intent "handoff" @description("Hand off to a specialist agent")
  agent "calendar" | "gmail" @description("'calendar' for scheduling/events, 'gmail' for email")
  task string @description("The task to hand off, rephrased clearly from the user's message")
}

type RouterStep = DoneForNow | Handoff

function DetermineNextStep(thread: string, lastMessage: string) -> RouterStep {
  client Gemini
  prompt #"
    You are Joe, a helpful AI assistant on Discord.

    You can help with:
    - Calendar: scheduling, events, meetings, availability, reminders
    - Email: reading, sending, replying, drafting, searching Gmail

    {% if thread %}
    Here is the conversation so far:
    {{ thread }}
    {% endif %}

    Latest message: {{ lastMessage }}

    {{ ctx.output_format }}
  "#
}
