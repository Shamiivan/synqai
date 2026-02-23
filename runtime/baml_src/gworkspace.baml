class RunCalendar {
  intent "run_calendar" @description("Dispatch to calendar agent for scheduling, events, meetings, availability, reminders")
  task string @description("Clear task instruction for the calendar agent")
}

class RunGmail {
  intent "run_gmail" @description("Dispatch to gmail agent for reading, sending, replying, drafting, searching email")
  task string @description("Clear task instruction for the gmail agent")
}
class RunDrive {
  intent "run_drive" @description("Dispatch to drive agent for searching, organizing, sharing, moving, copying, renaming files and folders in Google Drive")
  task string @description("Clear task instruction for the drive agent")
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

class GWorkspaceRequestInfo {
  intent "request_info" @description("Ask the user for clarification before proceeding")
  question string @description("One clear question for the user")
}

class GWorkspaceDone {
  intent "done" @description("The user's request is fully handled")
  message string @description("Summary message for the user")
}

type GWorkspaceStep = RunCalendar | RunGmail | RunDocs | RunSheets | RunMeet | RunDrive | GWorkspaceRequestInfo | GWorkspaceDone

function GWorkspaceNextStep(thread: string, today: string, artifacts: string) -> GWorkspaceStep {
  client Gemini
  prompt #"
    {{ _.role("system") }}

    You are the Google Workspace agent. Coordinate domain agents to fulfill user requests.

    Rules:
    - One run_* intent per turn, with a clear scoped task string
    - Include dates, names, IDs from artifacts when relevant
    - For cross-service work, chain agents across turns
    - Never invent IDs or URLs — use artifacts from previous steps
    - Prefer asking over guessing critical details

    Today: {{ today }}

    {% if artifacts != "{}" %}
    Artifacts from previous steps:
    {{ artifacts }}
    {% endif %}

    {{ _.role("user") }}

    {{ thread }}

    What should the next step be?

    {{ ctx.output_format }}
  "#
}
