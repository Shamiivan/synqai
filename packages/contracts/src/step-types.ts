// Step types for all tool intents.
// Source of truth: runtime/baml_src/agent.baml
// These are hand-maintained copies of the BAML-generated interfaces so that
// tool handler packages don't need their own baml_client.

// ── Calendar ──

export interface CreateEvent {
  intent: "create_event";
  summary: string;
  date: string;
  startTime: string;
  endTime: string;
  description: string;
  location?: string | null;
  timezone: string;
}

export interface ListEvents {
  intent: "list_events";
  date: string;
  timezone: string;
}

export interface GetEvent {
  intent: "get_event";
  eventId: string;
}

export interface UpdateEvent {
  intent: "update_event";
  eventId: string;
  summary?: string | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  description?: string | null;
  location?: string | null;
  timezone: string;
}

export interface DeleteEvent {
  intent: "delete_event";
  eventId: string;
  confirmation: string;
}

export interface CheckAvailability {
  intent: "check_availability";
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
}

export interface QuickAdd {
  intent: "quick_add";
  text: string;
}

// ── Gmail ──

export interface ListEmails {
  intent: "list_emails";
  query: string;
  maxResults?: number | null;
}

export interface ReadEmail {
  intent: "read_email";
  messageId: string;
}

export interface SendEmail {
  intent: "send_email";
  to: string;
  subject: string;
  body: string;
}

export interface ReplyToEmail {
  intent: "reply_to_email";
  messageId: string;
  body: string;
}

export interface ForwardEmail {
  intent: "forward_email";
  messageId: string;
  to: string;
  comment?: string | null;
}

export interface CreateDraft {
  intent: "create_draft";
  to: string;
  subject: string;
  body: string;
}

export interface ArchiveEmail {
  intent: "archive_email";
  messageId: string;
}

export interface TrashEmail {
  intent: "trash_email";
  messageId: string;
}

export interface MarkRead {
  intent: "mark_read";
  messageId: string;
}

export interface MarkUnread {
  intent: "mark_unread";
  messageId: string;
}

export interface StarEmail {
  intent: "star_email";
  messageId: string;
}

export interface UnstarEmail {
  intent: "unstar_email";
  messageId: string;
}

export interface ModifyLabels {
  intent: "modify_labels";
  messageId: string;
  addLabels: string[];
  removeLabels: string[];
}

// ── Sheets ──

export interface CreateSpreadsheet {
  intent: "create_spreadsheet";
  title: string;
}

export interface GetSpreadsheet {
  intent: "get_spreadsheet";
  spreadsheetId: string;
}

export interface ReadValues {
  intent: "read_values";
  spreadsheetId: string;
  range: string;
}

export interface WriteValues {
  intent: "write_values";
  spreadsheetId: string;
  range: string;
  values: string[][];
}

export interface AppendRows {
  intent: "append_rows";
  spreadsheetId: string;
  range: string;
  values: string[][];
}

export interface ClearRange {
  intent: "clear_range";
  spreadsheetId: string;
  range: string;
}

export interface AddSheet {
  intent: "add_sheet";
  spreadsheetId: string;
  title: string;
}

export interface ListSpreadsheets {
  intent: "list_spreadsheets";
  query: string;
}

// ── Docs ──

export interface CreateDocument {
  intent: "create_document";
  title: string;
  content?: string | null;
}

export interface GetDocument {
  intent: "get_document";
  documentId: string;
}

export interface InsertText {
  intent: "insert_text";
  documentId: string;
  text: string;
  position: string;
}

export interface ReplaceText {
  intent: "replace_text";
  documentId: string;
  find: string;
  replaceWith: string;
}

export interface ListDocuments {
  intent: "list_documents";
  query: string;
}

export interface FormatText {
  intent: "format_text";
  documentId: string;
  target: string;
  bold?: boolean | null;
  italic?: boolean | null;
  underline?: boolean | null;
  fontSize?: number | null;
  fontFamily?: string | null;
}

export interface FormatParagraph {
  intent: "format_paragraph";
  documentId: string;
  target: string;
  headingLevel?: number | null;
  alignment?: string | null;
  bulletType?: string | null;
}

// ── Drive ──

export interface SearchFiles {
  intent: "search_files";
  query?: string | null;
  mimeTypeFilter?: string | null;
  folderId?: string | null;
  maxResults?: number | null;
}

export interface GetFile {
  intent: "get_file";
  fileId: string;
}

export interface CreateFolder {
  intent: "create_folder";
  name: string;
  parentId?: string | null;
}

export interface MoveFile {
  intent: "move_file";
  fileId: string;
  destinationFolderId: string;
}

export interface CopyFile {
  intent: "copy_file";
  fileId: string;
  newName?: string | null;
  destinationFolderId?: string | null;
}

export interface RenameFile {
  intent: "rename_file";
  fileId: string;
  newName: string;
}

export interface TrashFile {
  intent: "trash_file";
  fileId: string;
  confirmation: string;
}

export interface ShareFile {
  intent: "share_file";
  fileId: string;
  shareType: string;
  role: string;
  emailOrDomain?: string | null;
  sendNotification?: boolean | null;
}

export interface ListPermissions {
  intent: "list_permissions";
  fileId: string;
}

// ── Meet ──

export interface CreateMeeting {
  intent: "create_meeting";
}

export interface GetMeeting {
  intent: "get_meeting";
  spaceName: string;
}

export interface EndMeeting {
  intent: "end_meeting";
  spaceName: string;
}

export interface ListConferences {
  intent: "list_conferences";
  pageSize?: number | null;
}

export interface ListRecordings {
  intent: "list_recordings";
  conferenceRecordName: string;
}

export interface ListTranscripts {
  intent: "list_transcripts";
  conferenceRecordName: string;
}

export interface GetTranscriptEntries {
  intent: "get_transcript_entries";
  transcriptName: string;
}
