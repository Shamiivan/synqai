class CreateSpreadsheet {
  intent "create_spreadsheet" @description("Create a new Google Spreadsheet")
  title string @description("Spreadsheet title")
}

class GetSpreadsheet {
  intent "get_spreadsheet" @description("Get spreadsheet metadata — sheet names, row/column counts (no cell data)")
  spreadsheetId string @description("The spreadsheet ID from a previous create or list")
}

class ReadValues {
  intent "read_values" @description("Read cell values from a range in A1 notation")
  spreadsheetId string @description("The spreadsheet ID")
  range string @description("A1 notation range, e.g. 'Sheet1!A1:B10' or 'A1:C5'")
}

class WriteValues {
  intent "write_values" @description("Write values to a range, overwriting existing data")
  spreadsheetId string @description("The spreadsheet ID")
  range string @description("A1 notation range to write to")
  values string[][] @description("2D array of cell values, row-major")
}

class AppendRows {
  intent "append_rows" @description("Append rows after the last row with data in the range")
  spreadsheetId string @description("The spreadsheet ID")
  range string @description("A1 notation range to append after, e.g. 'Sheet1!A:B'")
  values string[][] @description("2D array of rows to append")
}

class ClearRange {
  intent "clear_range" @description("Clear all values in a range")
  spreadsheetId string @description("The spreadsheet ID")
  range string @description("A1 notation range to clear")
}

class AddSheet {
  intent "add_sheet" @description("Add a new sheet tab to an existing spreadsheet")
  spreadsheetId string @description("The spreadsheet ID")
  title string @description("Name for the new sheet tab")
}

class ListSpreadsheets {
  intent "list_spreadsheets" @description("Search for Google Spreadsheets by name")
  query string @description("Search query to match spreadsheet names")
}

class SheetsRequestInfo {
  intent "request_info" @description("Ask the human for missing information before proceeding")
  message string @description("Question to ask the human")
}

class SheetsDone {
  intent "done" @description("Finish with a summary message to the human")
  message string @description("Final response to the human")
}

type SheetsStep = CreateSpreadsheet | GetSpreadsheet | ReadValues | WriteValues | AppendRows | ClearRange | AddSheet | ListSpreadsheets | SheetsRequestInfo | SheetsDone

function SheetsNextStep(thread: string, today: string) -> SheetsStep {
  client Gemini
  prompt #"
    {{ _.role("system") }}

    You are a Google Sheets assistant. You help users create, read, and edit Google Spreadsheets.

    Rules:
    - If the user's request is missing key details (like spreadsheet name or range), use request_info to ask — never guess
    - Use A1 notation for ranges (e.g. 'Sheet1!A1:B10', 'A1:C5')
    - When writing values, format them as a 2D string array (rows of columns)
    - When the user asks to see data, use read_values with the appropriate range
    - Spreadsheet IDs from list_spreadsheets or create_spreadsheet are required for all operations — never fabricate IDs
    - If the API returns an error, explain it to the user in plain language via done
    - When listing spreadsheets, include names and IDs so the user can refer to them
    - For new spreadsheets, offer to set up headers if the user describes a structure
    - Use append_rows when adding data to an existing table (preserves existing data)
    - Use write_values when overwriting a specific range

    Today's date is {{ today }}.

    {{ _.role("user") }}

    {{ thread }}

    What should the next step be?

    {{ ctx.output_format }}
  "#
}
