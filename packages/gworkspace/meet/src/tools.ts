import type { meet_v2 } from "googleapis";
import type {
  CreateMeeting,
  GetMeeting,
  EndMeeting,
  ListConferences,
  ListRecordings,
  ListTranscripts,
  GetTranscriptEntries,
} from "../baml_client";
import type { MeetToolsDependencies, MeetTools } from "@synqai/contracts";
import { classifyMeetError } from "./errors";

// ── Factory ──────────────────────────────────────────────

export function createMeetTools(dependencies: MeetToolsDependencies): MeetTools {
  const { meet } = dependencies;
  return {
    handleCreateMeeting: (step) => handleCreateMeeting(step, meet),
    handleGetMeeting: (step) => handleGetMeeting(step, meet),
    handleEndMeeting: (step) => handleEndMeeting(step, meet),
    handleListConferences: (step) => handleListConferences(step, meet),
    handleListRecordings: (step) => handleListRecordings(step, meet),
    handleListTranscripts: (step) => handleListTranscripts(step, meet),
    handleGetTranscriptEntries: (step) => handleGetTranscriptEntries(step, meet),
  };
}

// ── Create Meeting ───────────────────────────────────────

async function handleCreateMeeting(_step: CreateMeeting, meet: meet_v2.Meet) {
  try {
    const res = await meet.spaces.create({});
    return {
      name: res.data.name,
      meetingUri: res.data.meetingUri,
      meetingCode: res.data.meetingCode,
    };
  } catch (err) {
    return { error: classifyMeetError(err) };
  }
}

// ── Get Meeting ──────────────────────────────────────────

async function handleGetMeeting(step: GetMeeting, meet: meet_v2.Meet) {
  try {
    const res = await meet.spaces.get({ name: step.spaceName });
    return {
      name: res.data.name,
      meetingUri: res.data.meetingUri,
      meetingCode: res.data.meetingCode,
      config: res.data.config,
      activeConference: res.data.activeConference,
    };
  } catch (err) {
    return { error: classifyMeetError(err) };
  }
}

// ── End Meeting ──────────────────────────────────────────

async function handleEndMeeting(step: EndMeeting, meet: meet_v2.Meet) {
  try {
    await meet.spaces.endActiveConference({ name: step.spaceName });
    return { ended: true, spaceName: step.spaceName };
  } catch (err) {
    return { error: classifyMeetError(err) };
  }
}

// ── List Conferences ─────────────────────────────────────

async function handleListConferences(step: ListConferences, meet: meet_v2.Meet) {
  try {
    const res = await meet.conferenceRecords.list({
      pageSize: step.pageSize ?? 10,
    });
    const conferences = (res.data.conferenceRecords ?? []).map((c) => ({
      name: c.name,
      startTime: c.startTime,
      endTime: c.endTime,
      space: c.space,
    }));
    return { conferences };
  } catch (err) {
    return { error: classifyMeetError(err) };
  }
}

// ── List Recordings ──────────────────────────────────────

async function handleListRecordings(step: ListRecordings, meet: meet_v2.Meet) {
  try {
    const res = await meet.conferenceRecords.recordings.list({
      parent: step.conferenceRecordName,
    });
    const recordings = (res.data.recordings ?? []).map((r) => ({
      name: r.name,
      state: r.state,
      startTime: r.startTime,
      endTime: r.endTime,
      driveDestination: r.driveDestination,
    }));
    return { recordings };
  } catch (err) {
    return { error: classifyMeetError(err) };
  }
}

// ── List Transcripts ─────────────────────────────────────

async function handleListTranscripts(step: ListTranscripts, meet: meet_v2.Meet) {
  try {
    const res = await meet.conferenceRecords.transcripts.list({
      parent: step.conferenceRecordName,
    });
    const transcripts = (res.data.transcripts ?? []).map((t) => ({
      name: t.name,
      state: t.state,
      startTime: t.startTime,
      endTime: t.endTime,
      docsDestination: t.docsDestination,
    }));
    return { transcripts };
  } catch (err) {
    return { error: classifyMeetError(err) };
  }
}

// ── Get Transcript Entries ───────────────────────────────

async function handleGetTranscriptEntries(step: GetTranscriptEntries, meet: meet_v2.Meet) {
  try {
    const res = await meet.conferenceRecords.transcripts.entries.list({
      parent: step.transcriptName,
    });
    const entries = (res.data.transcriptEntries ?? []).map((e) => ({
      name: e.name,
      participant: e.participant,
      text: e.text,
      startTime: e.startTime,
      endTime: e.endTime,
      languageCode: e.languageCode,
    }));
    return { entries };
  } catch (err) {
    return { error: classifyMeetError(err) };
  }
}
