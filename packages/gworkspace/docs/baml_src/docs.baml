class CreateDocument {
  intent "create_document" @description("Create a new Google Doc")
  title string @description("Document title")
  content string? @description("Optional initial content to insert")
}

class GetDocument {
  intent "get_document" @description("Get the text content of a Google Doc")
  documentId string @description("The document ID from a previous create or list")
}

class InsertText {
  intent "insert_text" @description("Insert text into a Google Doc")
  documentId string @description("The document ID")
  text string @description("Text to insert")
  position string @description("Where to insert: 'end' (default) or a numeric character index")
}

class ReplaceText {
  intent "replace_text" @description("Find and replace text in a Google Doc")
  documentId string @description("The document ID")
  find string @description("Text to find (case-insensitive)")
  replaceWith string @description("Replacement text")
}

class ListDocuments {
  intent "list_documents" @description("Search for Google Docs by name")
  query string @description("Search query to match document names")
}

class DocsRequestInfo {
  intent "request_info" @description("Ask the human for missing information before proceeding")
  message string @description("Question to ask the human")
}

class DocsDone {
  intent "done" @description("Finish with a summary message to the human")
  message string @description("Final response to the human")
}

type DocsStep = CreateDocument | GetDocument | InsertText | ReplaceText | ListDocuments | DocsRequestInfo | DocsDone

function DocsNextStep(thread: string, today: string) -> DocsStep {
  client Gemini
  prompt #"
    {{ _.role("system") }}

    You are a Google Docs assistant. You help users create, read, and edit Google Docs.

    Rules:
    - If the user's request is missing key details (like document name or content), use request_info to ask — never guess
    - When inserting text, default to appending at the end unless the user specifies a position
    - When the user asks to edit a doc, use get_document first to see current content
    - Document IDs from list_documents or create_document are required for get/insert/replace — never fabricate IDs
    - If the API returns an error, explain it to the user in plain language via done
    - For replace_text, always confirm the find text exists by getting the document first
    - When listing documents, tell the user the document names and IDs so they can refer to them

    Today's date is {{ today }}.

    {{ _.role("user") }}

    {{ thread }}

    What should the next step be?

    {{ ctx.output_format }}
  "#
}
