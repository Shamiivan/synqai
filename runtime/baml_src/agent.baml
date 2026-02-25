// ── Control intents ──

class RequestInfo {
  intent "request_info" @description("Ask the human for missing information — ONLY when you truly cannot proceed after trying tools first")
  message string @description("One clear question for the human")
}

class Done {
  intent "done" @description("Task complete, or responding to greetings/chat/questions that don't need tools")
  message string @description("Response to the human")
}

// ── Calendar tools (7) ──

class CreateEvent {
  intent "create_event" @description("Create a new calendar event. Use when the user wants to schedule something. NOT for checking availability (use check_availability).")
  summary string @description("Event title")
  date string @description("Date in YYYY-MM-DD format")
  startTime string @description("Start time in HH:MM 24h format")
  endTime string @description("End time in HH:MM 24h format")
  description string @description("Event description")
  location string? @description("Event location if mentioned")
  timezone string @description("IANA timezone e.g. America/Toronto")
}

class ListEvents {
  intent "list_events" @description("List all events for a given date. Use when the user asks about their schedule. NOT for checking if a slot is free (use check_availability).")
  date string @description("Date in YYYY-MM-DD format")
  timezone string @description("IANA timezone e.g. America/Toronto")
}

class GetEvent {
  intent "get_event" @description("Get full details of a specific event by ID. Use when you need details beyond what list_events returned. Requires an eventId from a previous list_events.")
  eventId string @description("The event ID from a previous list_events response")
}

class UpdateEvent {
  intent "update_event" @description("Modify an existing event (partial update). Use when the user wants to change time, title, location, etc. Requires an eventId from list_events or get_event.")
  eventId string @description("The event ID from a previous get_event or list_events")
  summary string? @description("New title, omit to keep current")
  date string? @description("New date YYYY-MM-DD, omit to keep current")
  startTime string? @description("New start HH:MM 24h, omit to keep current")
  endTime string? @description("New end HH:MM 24h, omit to keep current")
  description string? @description("New description, omit to keep current")
  location string? @description("New location, omit to keep current")
  timezone string @description("IANA timezone for any time fields")
}

class DeleteEvent {
  intent "delete_event" @description("Delete an event by ID. Use when the user wants to cancel/remove an event. Requires eventId from a previous list.")
  eventId string @description("The event ID to delete")
  confirmation string @description("State what you are deleting, e.g. 'Deleting: Team standup on 2026-02-23'")
}

class CheckAvailability {
  intent "check_availability" @description("Check if a time slot is free using freeBusy API. Use when the user asks 'am I free?' or before creating events. NOT for listing events (use list_events).")
  date string @description("Date in YYYY-MM-DD format")
  startTime string @description("Start of window in HH:MM 24h format")
  endTime string @description("End of window in HH:MM 24h format")
  timezone string @description("IANA timezone")
}

class QuickAdd {
  intent "quick_add" @description("Create an event from natural language. ONLY when the user provides date AND time explicitly in one sentence, e.g. 'Lunch with Bob tomorrow at noon'. If either is missing, use request_info.")
  text string @description("The user's complete natural language description including date and time")
}

// ── Gmail tools (13) ──

class ListEmails {
  intent "list_emails" @description("Search and list emails by query. Use for finding emails, checking inbox, filtering by sender/subject/date. Returns IDs, subjects, snippets — NOT full body (use read_email for that).")
  query string @description("Gmail search query — from:, to:, subject:, is:unread, label:, newer_than:, older_than:, etc.")
  maxResults int? @description("Number of emails to return, default 10, max 20")
}

class ReadEmail {
  intent "read_email" @description("Read the full body of a specific email. Use when you need the complete content. Requires messageId from list_emails. NOT for searching (use list_emails).")
  messageId string @description("The message ID from a previous list_emails response")
}

class SendEmail {
  intent "send_email" @description("Send a new email. Use when the user wants to compose and send a message to someone.")
  to string @description("Recipient email address")
  subject string @description("Email subject line")
  body string @description("Email body in plain text")
}

class ReplyToEmail {
  intent "reply_to_email" @description("Reply to an existing email thread. Use when replying to a message. Requires messageId from read_email or list_emails.")
  messageId string @description("The message ID to reply to")
  body string @description("Reply body in plain text")
}

class ForwardEmail {
  intent "forward_email" @description("Forward an email to someone. Requires messageId. Read the email first to see what you're forwarding.")
  messageId string @description("The message ID to forward")
  to string @description("Recipient email address to forward to")
  comment string? @description("Optional message above the forwarded content")
}

class CreateDraft {
  intent "create_draft" @description("Create an email draft without sending. Use when the user says 'draft' or 'save for later'. NOT for sending (use send_email).")
  to string @description("Recipient email address")
  subject string @description("Email subject line")
  body string @description("Email body in plain text")
}

class ArchiveEmail {
  intent "archive_email" @description("Archive an email — removes from inbox but keeps in All Mail. NOT for deleting (use trash_email).")
  messageId string @description("The message ID from a previous list_emails or read_email")
}

class TrashEmail {
  intent "trash_email" @description("Move an email to trash. Use when the user says 'delete' an email.")
  messageId string @description("The message ID from a previous list_emails or read_email")
}

class MarkRead {
  intent "mark_read" @description("Mark an email as read. Use when user wants to dismiss unread status.")
  messageId string @description("The message ID to mark as read")
}

class MarkUnread {
  intent "mark_unread" @description("Mark an email as unread. Use when user wants to flag it for later.")
  messageId string @description("The message ID to mark as unread")
}

class StarEmail {
  intent "star_email" @description("Star/flag an important email.")
  messageId string @description("The message ID to star")
}

class UnstarEmail {
  intent "unstar_email" @description("Remove star from an email.")
  messageId string @description("The message ID to unstar")
}

class ModifyLabels {
  intent "modify_labels" @description("Add or remove labels from an email. Use for categorization or moving to folders.")
  messageId string @description("The message ID to modify")
  addLabels string[] @description("Label names to add (e.g. 'IMPORTANT', 'CATEGORY_PERSONAL', or custom label names)")
  removeLabels string[] @description("Label names to remove")
}

// ── Sheets tools (8) ──

class CreateSpreadsheet {
  intent "create_spreadsheet" @description("Create a new Google Spreadsheet. Use when starting a new sheet from scratch. NOT for finding existing ones (use list_spreadsheets).")
  title string @description("Spreadsheet title")
}

class GetSpreadsheet {
  intent "get_spreadsheet" @description("Get spreadsheet metadata — sheet names, row/column counts. Use to discover structure. NOT for reading cell data (use read_values).")
  spreadsheetId string @description("The spreadsheet ID from a URL or previous list/create")
}

class ReadValues {
  intent "read_values" @description("Read cell values from a range. Use when you need to see data in a sheet. NOT for metadata (use get_spreadsheet).")
  spreadsheetId string @description("The spreadsheet ID")
  range string @description("A1 notation range, e.g. 'Sheet1!A1:B10' or 'A1:C5'")
}

class WriteValues {
  intent "write_values" @description("Write values to a range, overwriting existing data. Use when replacing a specific block of cells. NOT for appending new rows (use append_rows).")
  spreadsheetId string @description("The spreadsheet ID")
  range string @description("A1 notation range to write to")
  values string[][] @description("2D array of cell values, row-major")
}

class AppendRows {
  intent "append_rows" @description("Append rows after the last row with data. Use when adding new data to a table. NOT for overwriting existing cells (use write_values).")
  spreadsheetId string @description("The spreadsheet ID")
  range string @description("A1 notation range to append after, e.g. 'Sheet1!A:B'")
  values string[][] @description("2D array of rows to append")
}

class ClearRange {
  intent "clear_range" @description("Clear all values in a range. Use when user wants to erase data.")
  spreadsheetId string @description("The spreadsheet ID")
  range string @description("A1 notation range to clear")
}

class AddSheet {
  intent "add_sheet" @description("Add a new sheet tab to an existing spreadsheet. NOT for creating a new spreadsheet file (use create_spreadsheet).")
  spreadsheetId string @description("The spreadsheet ID")
  title string @description("Name for the new sheet tab")
}

class ListSpreadsheets {
  intent "list_spreadsheets" @description("Search for Google Spreadsheets by name. Use when the user mentions a spreadsheet by name. NOT for reading data (use read_values after finding the ID).")
  query string @description("Search query to match spreadsheet names")
}

// ── Docs tools (7) ──

class CreateDocument {
  intent "create_document" @description("Create a new Google Doc. Use when starting a new document. NOT for finding existing ones (use list_documents).")
  title string @description("Document title")
  content string? @description("Optional initial content to insert")
}

class GetDocument {
  intent "get_document" @description("Get the text content of a Google Doc. Use to read/see current state before editing. NOT for searching docs by name (use list_documents).")
  documentId string @description("The document ID from a previous create or list")
}

class InsertText {
  intent "insert_text" @description("Insert text into a Google Doc. Defaults to end. Use get_document first to see current state.")
  documentId string @description("The document ID")
  text string @description("Text to insert")
  position string @description("Where to insert: 'end' (default) or a numeric character index")
}

class ReplaceText {
  intent "replace_text" @description("Find and replace text in a Google Doc. Use get_document first to confirm the text exists.")
  documentId string @description("The document ID")
  find string @description("Text to find (case-insensitive)")
  replaceWith string @description("Replacement text")
}

class ListDocuments {
  intent "list_documents" @description("Search for Google Docs by name. Use when the user mentions a document by name. NOT for reading content (use get_document after finding the ID).")
  query string @description("Search query to match document names")
}

class FormatText {
  intent "format_text" @description("Apply text formatting (bold, italic, font) to matched text. Use get_document first. NOT for paragraph styles (use format_paragraph).")
  documentId string @description("The document ID")
  target string @description("Text to format: 'title', 'first paragraph', or a text substring to match")
  bold bool? @description("Set bold")
  italic bool? @description("Set italic")
  underline bool? @description("Set underline")
  fontSize int? @description("Font size in points")
  fontFamily string? @description("Font family name")
}

class FormatParagraph {
  intent "format_paragraph" @description("Apply paragraph formatting (headings, alignment, bullets). NOT for character styles (use format_text).")
  documentId string @description("The document ID")
  target string @description("Text to format: 'title', 'first paragraph', or a text substring to match")
  headingLevel int? @description("0=normal text, 1-6=heading levels")
  alignment string? @description("START, CENTER, END, or JUSTIFIED")
  bulletType string? @description("disc, decimal, or none to remove bullets")
}

// ── Drive tools (9) ──

class SearchFiles {
  intent "search_files" @description("Search for files and folders in Google Drive. Use when the user mentions a file by name — search first, don't ask for the ID.")
  query string? @description("Search term or Drive query. Examples: 'budget report', fullText contains 'quarterly', starred = true, sharedWithMe")
  mimeTypeFilter string? @description("MIME type filter: application/vnd.google-apps.folder, .document, .spreadsheet, application/pdf, etc.")
  folderId string? @description("Only search within this folder ID")
  maxResults int? @description("Max results to return (default 20)")
}

class GetFile {
  intent "get_file" @description("Get detailed metadata for a specific file by ID. Use when you need more info than search_files returned. Requires fileId from search_files.")
  fileId string @description("The file ID from a previous search_files response")
}

class CreateFolder {
  intent "create_folder" @description("Create a new folder in Google Drive. NOT for creating files (use create_document or create_spreadsheet).")
  name string @description("Folder name")
  parentId string? @description("Parent folder ID — omit to create in root")
}

class MoveFile {
  intent "move_file" @description("Move a file or folder to a different parent folder. Requires both fileId and destinationFolderId from search_files.")
  fileId string @description("The file ID to move")
  destinationFolderId string @description("The target folder ID")
}

class CopyFile {
  intent "copy_file" @description("Create a copy of a file. NOT for moving (use move_file).")
  fileId string @description("The file ID to copy")
  newName string? @description("Name for the copy — omit to use 'Copy of <original>'")
  destinationFolderId string? @description("Folder to place the copy — omit for same location")
}

class RenameFile {
  intent "rename_file" @description("Rename a file or folder. NOT for moving (use move_file).")
  fileId string @description("The file ID to rename")
  newName string @description("The new name")
}

class TrashFile {
  intent "trash_file" @description("Move a file or folder to trash. Use when the user says 'delete' a file.")
  fileId string @description("The file ID to trash")
  confirmation string @description("State what you are trashing, e.g. 'Trashing: Q4 Report.pdf'")
}

class ShareFile {
  intent "share_file" @description("Share a file or folder with a user, group, domain, or make it public.")
  fileId string @description("The file ID to share")
  shareType string @description("One of: user, group, domain, anyone")
  role string @description("One of: reader, commenter, writer, organizer")
  emailOrDomain string? @description("Email (for user/group) or domain. Not needed for 'anyone'.")
  sendNotification bool? @description("Send email notification (default true)")
}

class ListPermissions {
  intent "list_permissions" @description("List who has access to a file or folder. Use when checking sharing status.")
  fileId string @description("The file ID to check permissions for")
}

// ── Meet tools (7) ──

class CreateMeeting {
  intent "create_meeting" @description("Create a new Google Meet meeting space. Always return the meeting link to the user.")
}

class GetMeeting {
  intent "get_meeting" @description("Get details of a meeting space. Requires spaceName from a previous create or list.")
  spaceName string @description("The space resource name, e.g. 'spaces/abc123'")
}

class EndMeeting {
  intent "end_meeting" @description("End the active conference in a meeting space.")
  spaceName string @description("The space resource name")
}

class ListConferences {
  intent "list_conferences" @description("List recent conference records. Use to find past meetings for recordings/transcripts.")
  pageSize int? @description("Number of results to return, default 10")
}

class ListRecordings {
  intent "list_recordings" @description("List recordings for a specific conference. NOT for transcripts (use list_transcripts).")
  conferenceRecordName string @description("The conference record resource name, e.g. 'conferenceRecords/abc123'")
}

class ListTranscripts {
  intent "list_transcripts" @description("List transcripts for a specific conference. NOT for recordings (use list_recordings).")
  conferenceRecordName string @description("The conference record resource name")
}

class GetTranscriptEntries {
  intent "get_transcript_entries" @description("Get the text entries of a transcript — speaker names and what they said.")
  transcriptName string @description("The transcript resource name, e.g. 'conferenceRecords/abc123/transcripts/def456'")
}

// ── Union type (all 53 intents) ──

type AgentStep = RequestInfo | Done | CreateEvent | ListEvents | GetEvent | UpdateEvent | DeleteEvent | CheckAvailability | QuickAdd | ListEmails | ReadEmail | SendEmail | ReplyToEmail | ForwardEmail | CreateDraft | ArchiveEmail | TrashEmail | MarkRead | MarkUnread | StarEmail | UnstarEmail | ModifyLabels | CreateSpreadsheet | GetSpreadsheet | ReadValues | WriteValues | AppendRows | ClearRange | AddSheet | ListSpreadsheets | CreateDocument | GetDocument | InsertText | ReplaceText | ListDocuments | FormatText | FormatParagraph | SearchFiles | GetFile | CreateFolder | MoveFile | CopyFile | RenameFile | TrashFile | ShareFile | ListPermissions | CreateMeeting | GetMeeting | EndMeeting | ListConferences | ListRecordings | ListTranscripts | GetTranscriptEntries

// ── Unified agent function ──

function NextStep(thread: string, today: string) -> AgentStep {
  client Gemini
  prompt #"
    {{ _.role("system") }}

    You are Joe, an AI assistant on Discord. You manage Google Workspace: Calendar, Gmail, Sheets, Docs, Drive, and Meet.

    ## Core Principle: Bias to Action
    - Use tools to discover information instead of asking the user.
    - Extract IDs from URLs: spreadsheet docs.google.com/spreadsheets/d/{ID}, doc docs.google.com/document/d/{ID}.
    - When the user mentions a file/doc/sheet by name, search for it first — never ask for the ID.
    - When the user delegates a decision ("format as you see fit"), use your best judgment and proceed.
    - Use defaults silently: calendar duration 30min, timezone America/Toronto.
    - Use request_info ONLY when you truly cannot proceed after trying tools.

    ## Tool Usage Rules
    - IDs from list/search/create results are required for all operations — never fabricate IDs.
    - Before creating calendar events, list_events for the target date to check conflicts.
    - Before editing documents or sheets, read them first to see current state.
    - Always read_email before replying or forwarding.
    - If an API returns an error, explain it in plain language via done.

    ## Domain Quick Reference
    - Calendar: YYYY-MM-DD dates, HH:MM 24h times, default 30min duration, America/Toronto timezone.
    - Gmail: search syntax from:, to:, subject:, is:unread, label:, newer_than:, older_than:, has:attachment.
    - Sheets: A1 notation ranges (e.g. 'Sheet1!A1:B10'). Values are 2D string arrays.
    - Docs: format target can be 'title', 'first paragraph', or exact text to match. Always get_document first.
    - Drive: search supports fullText contains, starred = true, sharedWithMe. Use search_files before asking for file IDs.
    - Meet: always return the meeting link after creating.

    Today: {{ today }}

    {{ _.role("user") }}

    {{ thread }}

    What should the next step be?

    {{ ctx.output_format }}
  "#
}
