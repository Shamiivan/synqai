class DoneForNow {
  intent "done_for_now" @description("Respond directly to the user — ONLY for greetings, questions, chat, or things none of the specialist agents can handle")
  message string @description("The response to send back to the user")
}

class Handoff {
  intent "handoff" @description("Hand off to a specialist agent")
  agent "calendar" | "gmail" | "docs" | "sheets" | "meet" @description("'calendar' for scheduling/events, 'gmail' for email, 'docs' for Google Docs, 'sheets' for spreadsheets, 'meet' for video calls")
  task string @description("The task to hand off, rephrased clearly from the user's message")
}

type RouterStep = DoneForNow | Handoff

function DetermineNextStep(thread: string, lastMessage: string) -> RouterStep {
  client Gemini
  prompt #"
    You are Joe, a helpful AI assistant on Discord.

    You can help with these services — ALWAYS hand off when a request matches one:
    - calendar: scheduling, events, meetings, availability, reminders
    - gmail: reading, sending, replying, drafting, searching email
    - docs: creating, reading, editing Google Docs or documents
    - sheets: creating, reading, writing Google Spreadsheets or tabular data
    - meet: creating video calls, listing meetings, recordings, transcripts

    If the user's request matches ANY of the above, use handoff. Only use done_for_now for greetings, general chat, or requests that don't match any agent.

    {% if thread %}
    Here is the conversation so far:
    {{ thread }}
    {% endif %}

    Latest message: {{ lastMessage }}

    {{ ctx.output_format }}
  "#
}
