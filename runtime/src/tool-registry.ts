import type {
  CalendarTools,
  GmailTools,
  SheetsTools,
  DocsTools,
  DriveTools,
  MeetTools,
} from "@synqai/contracts";

export type ToolHandler = (step: any) => Promise<any>;

export interface ToolRegistry {
  handlers: Record<string, ToolHandler>;
}

export function createToolRegistry(deps: {
  calendarTools: CalendarTools;
  gmailTools: GmailTools;
  sheetsTools: SheetsTools;
  docsTools: DocsTools;
  driveTools: DriveTools;
  meetTools: MeetTools;
}): ToolRegistry {
  return {
    handlers: {
      // Calendar (7)
      create_event: (s) => deps.calendarTools.handleCreateEvent(s),
      list_events: (s) => deps.calendarTools.handleListEvents(s),
      get_event: (s) => deps.calendarTools.handleGetEvent(s),
      update_event: (s) => deps.calendarTools.handleUpdateEvent(s),
      delete_event: (s) => deps.calendarTools.handleDeleteEvent(s),
      check_availability: (s) => deps.calendarTools.handleCheckAvailability(s),
      quick_add: (s) => deps.calendarTools.handleQuickAdd(s),
      // Gmail (13)
      list_emails: (s) => deps.gmailTools.handleListEmails(s),
      read_email: (s) => deps.gmailTools.handleReadEmail(s),
      send_email: (s) => deps.gmailTools.handleSendEmail(s),
      reply_to_email: (s) => deps.gmailTools.handleReplyToEmail(s),
      forward_email: (s) => deps.gmailTools.handleForwardEmail(s),
      create_draft: (s) => deps.gmailTools.handleCreateDraft(s),
      archive_email: (s) => deps.gmailTools.handleArchiveEmail(s),
      trash_email: (s) => deps.gmailTools.handleTrashEmail(s),
      mark_read: (s) => deps.gmailTools.handleMarkRead(s),
      mark_unread: (s) => deps.gmailTools.handleMarkUnread(s),
      star_email: (s) => deps.gmailTools.handleStarEmail(s),
      unstar_email: (s) => deps.gmailTools.handleUnstarEmail(s),
      modify_labels: (s) => deps.gmailTools.handleModifyLabels(s),
      // Sheets (8)
      create_spreadsheet: (s) => deps.sheetsTools.handleCreateSpreadsheet(s),
      get_spreadsheet: (s) => deps.sheetsTools.handleGetSpreadsheet(s),
      read_values: (s) => deps.sheetsTools.handleReadValues(s),
      write_values: (s) => deps.sheetsTools.handleWriteValues(s),
      append_rows: (s) => deps.sheetsTools.handleAppendRows(s),
      clear_range: (s) => deps.sheetsTools.handleClearRange(s),
      add_sheet: (s) => deps.sheetsTools.handleAddSheet(s),
      list_spreadsheets: (s) => deps.sheetsTools.handleListSpreadsheets(s),
      // Docs (7)
      create_document: (s) => deps.docsTools.handleCreateDocument(s),
      get_document: (s) => deps.docsTools.handleGetDocument(s),
      insert_text: (s) => deps.docsTools.handleInsertText(s),
      replace_text: (s) => deps.docsTools.handleReplaceText(s),
      list_documents: (s) => deps.docsTools.handleListDocuments(s),
      format_text: (s) => deps.docsTools.handleFormatText(s),
      format_paragraph: (s) => deps.docsTools.handleFormatParagraph(s),
      // Drive (9)
      search_files: (s) => deps.driveTools.handleSearchFiles(s),
      get_file: (s) => deps.driveTools.handleGetFile(s),
      create_folder: (s) => deps.driveTools.handleCreateFolder(s),
      move_file: (s) => deps.driveTools.handleMoveFile(s),
      copy_file: (s) => deps.driveTools.handleCopyFile(s),
      rename_file: (s) => deps.driveTools.handleRenameFile(s),
      trash_file: (s) => deps.driveTools.handleTrashFile(s),
      share_file: (s) => deps.driveTools.handleShareFile(s),
      list_permissions: (s) => deps.driveTools.handleListPermissions(s),
      // Meet (7)
      create_meeting: (s) => deps.meetTools.handleCreateMeeting(s),
      get_meeting: (s) => deps.meetTools.handleGetMeeting(s),
      end_meeting: (s) => deps.meetTools.handleEndMeeting(s),
      list_conferences: (s) => deps.meetTools.handleListConferences(s),
      list_recordings: (s) => deps.meetTools.handleListRecordings(s),
      list_transcripts: (s) => deps.meetTools.handleListTranscripts(s),
      get_transcript_entries: (s) => deps.meetTools.handleGetTranscriptEntries(s),
    },
  };
}
