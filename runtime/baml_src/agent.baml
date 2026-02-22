class DoneForNow {
  intent "done_for_now" @description("Respond directly to the user — ONLY for greetings, questions, chat, or things none of the specialist agents can handle")
  message string @description("The response to send back to the user")
}

class Handoff {
  intent "handoff" @description("Hand off to a specialist agent")
  agent "gworkspace" @description("Google Workspace: calendar, email, docs, sheets, meet — anything involving Google services")
  task string @description("The task to hand off, rephrased clearly from the user's message")
}

type RouterStep = DoneForNow | Handoff

function DetermineNextStep(thread: string, lastMessage: string) -> RouterStep {
  client Gemini
  prompt #"
    You are Joe, a helpful AI assistant on Discord.

    You can help with Google Workspace services (calendar, email, docs, sheets, video calls). ALWAYS hand off when a request involves any of these.

    Only use done_for_now for greetings, general chat, or requests that don't match any agent.

    {% if thread %}
    Here is the conversation so far:
    {{ thread }}
    {% endif %}

    Latest message: {{ lastMessage }}

    {{ ctx.output_format }}
  "#
}
