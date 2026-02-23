class SearchFiles {
  intent "search_files" @description("Search for files and folders in Google Drive")
  query string? @description("Search term or raw Drive query. Omit to list all files matching the mimeTypeFilter/folderId. Examples: 'budget report', fullText contains 'quarterly', starred = true, sharedWithMe")
  mimeTypeFilter string? @description("Optional MIME type filter: application/vnd.google-apps.folder, application/vnd.google-apps.document, application/vnd.google-apps.spreadsheet, application/pdf, etc.")
  folderId string? @description("Optional — only search within this folder ID")
  maxResults int? @description("Max results to return (default 20)")
}

class GetFile {
  intent "get_file" @description("Get detailed metadata for a specific file by ID")
  fileId string @description("The file ID from a previous search_files response")
}

class CreateFolder {
  intent "create_folder" @description("Create a new folder in Google Drive")
  name string @description("Folder name")
  parentId string? @description("Parent folder ID — omit to create in root (My Drive)")
}

class MoveFile {
  intent "move_file" @description("Move a file or folder to a different parent folder")
  fileId string @description("The file ID to move")
  destinationFolderId string @description("The target folder ID")
}

class CopyFile {
  intent "copy_file" @description("Create a copy of a file")
  fileId string @description("The file ID to copy")
  newName string? @description("Name for the copy — omit to use 'Copy of <original>'")
  destinationFolderId string? @description("Folder to place the copy — omit for same location")
}

class RenameFile {
  intent "rename_file" @description("Rename a file or folder")
  fileId string @description("The file ID to rename")
  newName string @description("The new name")
}

class TrashFile {
  intent "trash_file" @description("Move a file or folder to trash — always confirm with user first")
  fileId string @description("The file ID to trash")
  confirmation string @description("State what you are trashing, e.g. 'Trashing: Q4 Report.pdf'")
}

class ShareFile {
  intent "share_file" @description("Share a file or folder with a user, group, domain, or make it public")
  fileId string @description("The file ID to share")
  shareType string @description("One of: user, group, domain, anyone")
  role string @description("One of: reader, commenter, writer, organizer")
  emailOrDomain string? @description("Email address (for user/group) or domain name (for domain). Not needed for 'anyone'.")
  sendNotification bool? @description("Whether to send an email notification (default true for user/group)")
}

class ListPermissions {
  intent "list_permissions" @description("List who has access to a file or folder")
  fileId string @description("The file ID to check permissions for")
}

class RequestInfo {
  intent "request_info" @description("Ask the human for missing information before proceeding")
  message string @description("Question to ask the human")
}

class DriveDone {
  intent "done" @description("Finish with a summary message to the human")
  message string @description("Final response to the human")
}

type DriveStep = SearchFiles | GetFile | CreateFolder | MoveFile | CopyFile | RenameFile | TrashFile | ShareFile | ListPermissions | RequestInfo | DriveDone

function DriveNextStep(thread: string, today: string) -> DriveStep {
  client Gemini
  prompt #"
    {{ _.role("system") }}

    You are a Google Drive file management assistant. You help users search, organize, and share files in their Drive.

    Rules:
    - If the user's request is missing key details (which file, where to move it, etc.), ALWAYS use request_info to ask — never guess
    - When the user mentions a file by name, ALWAYS search_files first to find its ID before acting
    - File IDs from search_files are required for all operations — never guess or fabricate IDs
    - For move/copy/rename/trash, confirm you have the right file via get_file or search_files first
    - Never trash without user confirmation via request_info
    - When sharing, confirm the email/role with the user if not explicitly stated
    - When listing folder contents, use search_files with the folder ID in folderId parameter
    - If the API returns an error, explain it to the user in plain language via done
    - If a search result is a shortcut (mimeType = application/vnd.google-apps.shortcut), use get_file on shortcutTarget.id to resolve it
    - If search returns incompleteSearch: true, tell the user results may be incomplete

    Search query syntax (use in the query field):
    - Name search: just use the search term (e.g. "budget report") — it will be wrapped in name contains automatically
    - Content search: fullText contains 'quarterly results'
    - Starred files: starred = true
    - Shared with me: sharedWithMe
    - By owner: 'user@example.com' in owners
    - By date: modifiedTime > '2026-01-01T00:00:00'
    - By writer: 'user@example.com' in writers
    - Combine with and/or: starred = true and name contains 'report'

    MIME type filters (use in mimeTypeFilter field):
    - Folder: application/vnd.google-apps.folder
    - Google Doc: application/vnd.google-apps.document
    - Google Sheet: application/vnd.google-apps.spreadsheet
    - Google Slides: application/vnd.google-apps.presentation
    - Google Form: application/vnd.google-apps.form
    - Google Drawing: application/vnd.google-apps.drawing
    - PDF: application/pdf
    - Images: use query mimeType contains 'image/'
    - Videos: use query mimeType contains 'video/'

    Today's date is {{ today }}.

    {{ _.role("user") }}

    {{ thread }}

    What should the next step be?

    {{ ctx.output_format }}
  "#
}
