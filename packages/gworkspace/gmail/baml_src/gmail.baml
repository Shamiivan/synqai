class ListEmails {
  intent "list_emails" @description("Search and list emails")
  query string @description("Gmail search query — supports from:, to:, subject:, is:unread, label:, newer_than:, older_than:, etc. Use 'is:unread' for unread, 'in:inbox' for inbox")
  maxResults int? @description("Number of emails to return, default 10, max 20")
}

class ReadEmail {
  intent "read_email" @description("Read the full body of a specific email")
  messageId string @description("The message ID from a previous list_emails response")
}

class SendEmail {
  intent "send_email" @description("Send a new email — ONLY after confirming recipient and content via request_info")
  to string @description("Recipient email address")
  subject string @description("Email subject line")
  body string @description("Email body in plain text")
}

class ReplyToEmail {
  intent "reply_to_email" @description("Reply to an existing email thread — ONLY after confirming content via request_info")
  messageId string @description("The message ID to reply to, from a previous read_email or list_emails")
  body string @description("Reply body in plain text")
}

class ForwardEmail {
  intent "forward_email" @description("Forward an email to someone — ONLY after confirming recipient via request_info")
  messageId string @description("The message ID to forward, from a previous read_email or list_emails")
  to string @description("Recipient email address to forward to")
  comment string? @description("Optional message to include above the forwarded content")
}

class CreateDraft {
  intent "create_draft" @description("Create an email draft without sending")
  to string @description("Recipient email address")
  subject string @description("Email subject line")
  body string @description("Email body in plain text")
}

class ArchiveEmail {
  intent "archive_email" @description("Archive an email — removes from inbox but keeps in All Mail")
  messageId string @description("The message ID from a previous list_emails or read_email response")
}

class TrashEmail {
  intent "trash_email" @description("Move an email to trash — confirm with user first via request_info")
  messageId string @description("The message ID from a previous list_emails or read_email response")
}

class MarkRead {
  intent "mark_read" @description("Mark an email as read")
  messageId string @description("The message ID to mark as read")
}

class MarkUnread {
  intent "mark_unread" @description("Mark an email as unread")
  messageId string @description("The message ID to mark as unread")
}

class StarEmail {
  intent "star_email" @description("Star/flag an important email")
  messageId string @description("The message ID to star")
}

class UnstarEmail {
  intent "unstar_email" @description("Remove star from an email")
  messageId string @description("The message ID to unstar")
}

class ModifyLabels {
  intent "modify_labels" @description("Add or remove labels from an email — use for categorization, moving to folders, etc.")
  messageId string @description("The message ID to modify")
  addLabels string[] @description("Label names to add (e.g. 'IMPORTANT', 'CATEGORY_PERSONAL', or custom label names)")
  removeLabels string[] @description("Label names to remove")
}

class GmailRequestInfo {
  intent "request_info" @description("Ask the human for missing information before proceeding")
  message string @description("Question to ask the human")
}

class GmailDone {
  intent "done" @description("Finish with a summary message to the human")
  message string @description("Final response to the human")
}

type GmailStep = ListEmails | ReadEmail | SendEmail | ReplyToEmail | ForwardEmail | CreateDraft | ArchiveEmail | TrashEmail | MarkRead | MarkUnread | StarEmail | UnstarEmail | ModifyLabels | GmailRequestInfo | GmailDone

function GmailNextStep(thread: string, today: string) -> GmailStep {
  client Gemini
  prompt #"
    {{ _.role("system") }}

    You are an email assistant. You help users manage their Gmail.

    Rules:
    - When the user asks about email, default to listing recent unread emails: query "is:unread" with maxResults 10
    - Always read_email before replying or forwarding to see the full conversation context
    - NEVER send, reply, or forward without first confirming recipient and content via request_info
    - Use Gmail search syntax for queries: from:, to:, subject:, is:unread, is:starred, label:, newer_than:, older_than:, has:attachment
    - When listing emails, keep output compact — show subject, from, date, and snippet only
    - Message IDs from list_emails are required for all per-message actions — never guess or fabricate IDs
    - For reply_to_email, the reply is sent in the same thread as the original message
    - For forward_email, read the email first to include its content in the forward
    - create_draft is for when the user says "draft" or "save for later" — don't send drafts
    - For archive_email, the email is removed from inbox but stays in All Mail
    - For trash_email, ALWAYS confirm with the user via request_info before trashing — never trash without confirmation
    - "delete" means trash_email (Gmail doesn't have permanent delete via API)
    - mark_read / mark_unread toggle the read status of a message
    - star_email / unstar_email toggle the star flag
    - modify_labels adds or removes Gmail labels (system labels like IMPORTANT, SPAM, or custom labels)
    - If the API returns an error, explain it to the user in plain language via done
    - If the user's request is ambiguous, use request_info to clarify

    Today's date is {{ today }}.

    {{ _.role("user") }}

    {{ thread }}

    What should the next step be?

    {{ ctx.output_format }}
  "#
}
