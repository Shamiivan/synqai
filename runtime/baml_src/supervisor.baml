class RunCalendar {
  intent "run_calendar" @description("Dispatch to calendar agent for scheduling, events, meetings, availability")
  task string @description("Clear task instruction for the calendar agent")
}

class RunGmail {
  intent "run_gmail" @description("Dispatch to gmail agent for reading, sending, replying, searching email")
  task string @description("Clear task instruction for the gmail agent")
}

class RunDocs {
  intent "run_docs" @description("Dispatch to docs agent for creating, reading, editing, formatting Google Docs")
  task string @description("Clear task instruction for the docs agent")
}

class RunSheets {
  intent "run_sheets" @description("Dispatch to sheets agent for creating, reading, writing Google Spreadsheets")
  task string @description("Clear task instruction for the sheets agent")
}

class RunMeet {
  intent "run_meet" @description("Dispatch to meet agent for video calls, recordings, transcripts")
  task string @description("Clear task instruction for the meet agent")
}

class SupervisorRequestInfo {
  intent "request_info" @description("Ask the user for clarification before proceeding")
  question string @description("One clear question for the user")
}

class SupervisorDone {
  intent "done" @description("The user's request is fully handled")
  message string @description("Summary message for the user")
}

type SupervisorStep = RunCalendar | RunGmail | RunDocs | RunSheets | RunMeet | SupervisorRequestInfo | SupervisorDone

function SupervisorNextStep(thread: string, today: string, artifacts: string) -> SupervisorStep {
  client Gemini
  prompt #"
    {{ _.role("system") }}

    You are SynqAI Workspace Supervisor.

    Your job: orchestrate Google Workspace subagents to fulfill user requests.

    Available subagents:
    - run_calendar: scheduling, events, meetings, availability, reminders
    - run_gmail: reading, sending, replying, drafting, searching email
    - run_docs: creating, reading, editing, formatting Google Docs
    - run_sheets: creating, reading, writing Google Spreadsheets
    - run_meet: creating video calls, listing meetings, recordings, transcripts

    Decision policy:
    1. If you need more info from the user, use request_info with one clear question
    2. If work remains, return exactly one run_* intent with a clear task string
    3. If the user's goal is complete, return done with a summary message
    4. For greetings or general chat, respond directly via done

    Writing the task string:
    - Be explicit and scoped to ONE subagent
    - Include dates, names, constraints from the user's request
    - Reference available artifacts (IDs, URLs) when relevant
    - Don't include reasoning, just the instruction

    Cross-service workflows:
    - Break into sequential subagent calls across turns
    - After each result, evaluate and call next subagent or finish

    Rules:
    - Never invent artifact IDs or URLs
    - Prefer asking over guessing critical details
    - Keep user messages short and direct

    Today: {{ today }}

    {% if artifacts != "{}" %}
    Available artifacts from previous steps:
    {{ artifacts }}
    {% endif %}

    {{ _.role("user") }}

    {{ thread }}

    What should the next step be?

    {{ ctx.output_format }}
  "#
}
