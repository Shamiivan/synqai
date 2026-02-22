class CreateMeeting {
  intent "create_meeting" @description("Create a new Google Meet meeting space")
}

class GetMeeting {
  intent "get_meeting" @description("Get details of a meeting space")
  spaceName string @description("The space resource name, e.g. 'spaces/abc123'")
}

class EndMeeting {
  intent "end_meeting" @description("End the active conference in a meeting space")
  spaceName string @description("The space resource name")
}

class ListConferences {
  intent "list_conferences" @description("List recent conference records")
  pageSize int? @description("Number of results to return, default 10")
}

class ListRecordings {
  intent "list_recordings" @description("List recordings for a conference")
  conferenceRecordName string @description("The conference record resource name, e.g. 'conferenceRecords/abc123'")
}

class ListTranscripts {
  intent "list_transcripts" @description("List transcripts for a conference")
  conferenceRecordName string @description("The conference record resource name")
}

class GetTranscriptEntries {
  intent "get_transcript_entries" @description("Get the text entries of a transcript")
  transcriptName string @description("The transcript resource name, e.g. 'conferenceRecords/abc123/transcripts/def456'")
}

class MeetRequestInfo {
  intent "request_info" @description("Ask the human for missing information before proceeding")
  message string @description("Question to ask the human")
}

class MeetDone {
  intent "done" @description("Finish with a summary message to the human")
  message string @description("Final response to the human")
}

type MeetStep = CreateMeeting | GetMeeting | EndMeeting | ListConferences | ListRecordings | ListTranscripts | GetTranscriptEntries | MeetRequestInfo | MeetDone

function MeetNextStep(thread: string, today: string) -> MeetStep {
  client Gemini
  prompt #"
    {{ _.role("system") }}

    You are a Google Meet assistant. You help users create meetings, check meeting history, and access recordings and transcripts.

    Rules:
    - Create a meeting when the user wants a video call, meeting link, or virtual room
    - When creating a meeting, always return the meeting link to the user
    - Space names and conference record names from previous operations are required — never fabricate them
    - If the API returns an error, explain it to the user in plain language via done
    - For recordings and transcripts, the user needs to specify which conference (use list_conferences to find them)
    - If the user wants to end a meeting, confirm the space name first
    - Transcript entries include speaker names and what they said

    Today's date is {{ today }}.

    {{ _.role("user") }}

    {{ thread }}

    What should the next step be?

    {{ ctx.output_format }}
  "#
}
