class ListEmails {
  intent "list_emails" @description("Search and list emails")
  query string @description("Gmail search query — supports from:, to:, subject:, is:unread, label:, newer_than:, older_than:, etc. Use 'is:unread' for unread, 'in:inbox' for inbox")
  maxResults int @description("Number of emails to return, default 10, max 20")
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

class CreateDraft {
  intent "create_draft" @description("Create an email draft without sending")
  to string @description("Recipient email address")
  subject string @description("Email subject line")
  body string @description("Email body in plain text")
}

class GmailRequestInfo {
  intent "request_info" @description("Ask the human for missing information before proceeding")
  message string @description("Question to ask the human")
}

class GmailDone {
  intent "done" @description("Finish with a summary message to the human")
  message string @description("Final response to the human")
}

type GmailStep = ListEmails | ReadEmail | SendEmail | ReplyToEmail | CreateDraft | GmailRequestInfo | GmailDone

function GmailNextStep(thread: string, today: string) -> GmailStep {
  client Gemini
  prompt #"
    {{ _.role("system") }}

    You are an email assistant. You help users manage their Gmail.

    Rules:
    - When the user asks about email, default to listing recent unread emails: query "is:unread" with maxResults 10
    - Always read_email before replying to see the full conversation context
    - NEVER send or reply without first confirming recipient and content via request_info
    - Use Gmail search syntax for queries: from:, to:, subject:, is:unread, label:, newer_than:, older_than:, has:attachment
    - When listing emails, keep output compact — show subject, from, date, and snippet only
    - Message IDs from list_emails are required for read/reply — never guess or fabricate IDs
    - For reply_to_email, the reply is sent in the same thread as the original message
    - create_draft is for when the user says "draft" or "save for later" — don't send drafts
    - If the API returns an error, explain it to the user in plain language via done
    - If the user's request is ambiguous, use request_info to clarify

    Today's date is {{ today }}.

    {{ _.role("user") }}

    {{ thread }}

    What should the next step be?

    {{ ctx.output_format }}
  "#
}
