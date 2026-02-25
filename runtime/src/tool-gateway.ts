type ActionClass = "read" | "write" | "update" | "delete";
type RiskFlag = "external" | "irreversible" | "permission_change";

interface ToolMeta {
  action: ActionClass;
  flags: RiskFlag[];
  confirmMessage?: (step: any) => string;
}

// Policy: DELETE always confirms. Any risk flag escalates to confirm.
function resolvePolicy(meta: ToolMeta): "allow" | "confirm" {
  if (meta.action === "delete") return "confirm";
  if (meta.flags.length > 0) return "confirm";
  return "allow";
}

const TOOL_META: Record<string, ToolMeta> = {
  // ── READ (no flags, always allow) ──
  list_events:            { action: "read",   flags: [] },
  get_event:              { action: "read",   flags: [] },
  check_availability:     { action: "read",   flags: [] },
  list_emails:            { action: "read",   flags: [] },
  read_email:             { action: "read",   flags: [] },
  get_spreadsheet:        { action: "read",   flags: [] },
  read_values:            { action: "read",   flags: [] },
  list_spreadsheets:      { action: "read",   flags: [] },
  get_document:           { action: "read",   flags: [] },
  list_documents:         { action: "read",   flags: [] },
  search_files:           { action: "read",   flags: [] },
  get_file:               { action: "read",   flags: [] },
  list_permissions:       { action: "read",   flags: [] },
  get_meeting:            { action: "read",   flags: [] },
  list_conferences:       { action: "read",   flags: [] },
  list_recordings:        { action: "read",   flags: [] },
  list_transcripts:       { action: "read",   flags: [] },
  get_transcript_entries: { action: "read",   flags: [] },

  // ── WRITE (allow unless flagged) ──
  create_event:        { action: "write", flags: [] },
  quick_add:           { action: "write", flags: [] },
  create_draft:        { action: "write", flags: [] },
  create_spreadsheet:  { action: "write", flags: [] },
  write_values:        { action: "write", flags: [] },
  append_rows:         { action: "write", flags: [] },
  add_sheet:           { action: "write", flags: [] },
  create_document:     { action: "write", flags: [] },
  insert_text:         { action: "write", flags: [] },
  create_folder:       { action: "write", flags: [] },
  copy_file:           { action: "write", flags: [] },
  create_meeting:      { action: "write", flags: [] },

  send_email: {
    action: "write",
    flags: ["external", "irreversible"],
    confirmMessage: (s) => `Send email to ${s.to}? Subject: "${s.subject}"`,
  },
  reply_to_email: {
    action: "write",
    flags: ["external", "irreversible"],
    confirmMessage: (s) => `Send reply to message ${s.messageId}?`,
  },
  forward_email: {
    action: "write",
    flags: ["external", "irreversible"],
    confirmMessage: (s) => `Forward message to ${s.to}?`,
  },
  share_file: {
    action: "write",
    flags: ["external", "permission_change"],
    confirmMessage: (s) => `Share file with ${s.emailOrDomain || "anyone"} as ${s.role}?`,
  },

  // ── UPDATE (allow) ──
  update_event:    { action: "update", flags: [] },
  replace_text:    { action: "update", flags: [] },
  format_text:     { action: "update", flags: [] },
  format_paragraph:{ action: "update", flags: [] },
  rename_file:     { action: "update", flags: [] },
  move_file:       { action: "update", flags: [] },
  mark_read:       { action: "update", flags: [] },
  mark_unread:     { action: "update", flags: [] },
  star_email:      { action: "update", flags: [] },
  unstar_email:    { action: "update", flags: [] },
  modify_labels:   { action: "update", flags: [] },
  archive_email:   { action: "update", flags: [] },

  // ── DELETE (always confirm) ──
  delete_event: {
    action: "delete",
    flags: ["irreversible"],
    confirmMessage: (s) => `Delete event: ${s.confirmation || s.eventId}?`,
  },
  trash_email: {
    action: "delete",
    flags: [],
    confirmMessage: (s) => `Trash email ${s.messageId}?`,
  },
  clear_range: {
    action: "delete",
    flags: ["irreversible"],
    confirmMessage: (s) => `Clear range ${s.range} in spreadsheet?`,
  },
  trash_file: {
    action: "delete",
    flags: [],
    confirmMessage: (s) => `Trash file: ${s.confirmation || s.fileId}?`,
  },
  end_meeting: {
    action: "delete",
    flags: [],
    confirmMessage: (s) => `End meeting ${s.spaceName}?`,
  },
};

export type GatewayResult =
  | { action: "execute" }
  | { action: "confirm"; message: string };

/**
 * Check whether a tool call should execute or needs human confirmation.
 * Fails closed: unknown intents require confirmation.
 */
export function checkGateway(intent: string, step: any): GatewayResult {
  const meta = TOOL_META[intent];

  // Fail closed — unknown tools need confirmation
  if (!meta) {
    return { action: "confirm", message: `Unknown action: ${intent}. Confirm?` };
  }

  if (resolvePolicy(meta) === "confirm") {
    const message = meta.confirmMessage
      ? meta.confirmMessage(step)
      : `Confirm: ${intent}?`;
    return { action: "confirm", message };
  }

  return { action: "execute" };
}
