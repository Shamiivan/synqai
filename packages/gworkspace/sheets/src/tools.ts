import type { sheets_v4, drive_v3 } from "googleapis";
import type {
  CreateSpreadsheet,
  GetSpreadsheet,
  ReadValues,
  WriteValues,
  AppendRows,
  ClearRange,
  AddSheet,
  ListSpreadsheets,
} from "../baml_client";
import type { SheetsToolsDependencies, SheetsTools } from "@synqai/contracts";
import { classifySheetsError } from "./errors";

// ── Factory ──────────────────────────────────────────────

export function createSheetsTools(dependencies: SheetsToolsDependencies): SheetsTools {
  const { sheets, drive } = dependencies;
  return {
    handleCreateSpreadsheet: (step) => handleCreateSpreadsheet(step, sheets),
    handleGetSpreadsheet: (step) => handleGetSpreadsheet(step, sheets),
    handleReadValues: (step) => handleReadValues(step, sheets),
    handleWriteValues: (step) => handleWriteValues(step, sheets),
    handleAppendRows: (step) => handleAppendRows(step, sheets),
    handleClearRange: (step) => handleClearRange(step, sheets),
    handleAddSheet: (step) => handleAddSheet(step, sheets),
    handleListSpreadsheets: (step) => handleListSpreadsheets(step, drive),
  };
}

// ── Create ────────────────────────────────────────────────

async function handleCreateSpreadsheet(step: CreateSpreadsheet, sheets: sheets_v4.Sheets) {
  try {
    const res = await sheets.spreadsheets.create({
      requestBody: { properties: { title: step.title } },
    });
    return {
      id: res.data.spreadsheetId!,
      title: res.data.properties?.title!,
      url: res.data.spreadsheetUrl!,
    };
  } catch (err) {
    return { error: classifySheetsError(err) };
  }
}

// ── Get Spreadsheet Metadata ─────────────────────────────

async function handleGetSpreadsheet(step: GetSpreadsheet, sheets: sheets_v4.Sheets) {
  try {
    const res = await sheets.spreadsheets.get({
      spreadsheetId: step.spreadsheetId,
    });
    const sheetTabs = (res.data.sheets ?? []).map((s) => ({
      title: s.properties?.title,
      sheetId: s.properties?.sheetId,
      rowCount: s.properties?.gridProperties?.rowCount,
      columnCount: s.properties?.gridProperties?.columnCount,
    }));
    return {
      id: res.data.spreadsheetId,
      title: res.data.properties?.title,
      url: res.data.spreadsheetUrl,
      sheets: sheetTabs,
    };
  } catch (err) {
    return { error: classifySheetsError(err) };
  }
}

// ── Read Values ──────────────────────────────────────────

async function handleReadValues(step: ReadValues, sheets: sheets_v4.Sheets) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: step.spreadsheetId,
      range: step.range,
    });
    return { values: res.data.values ?? [] };
  } catch (err) {
    return { error: classifySheetsError(err) };
  }
}

// ── Write Values ─────────────────────────────────────────

async function handleWriteValues(step: WriteValues, sheets: sheets_v4.Sheets) {
  try {
    const res = await sheets.spreadsheets.values.update({
      spreadsheetId: step.spreadsheetId,
      range: step.range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: step.values },
    });
    return {
      updatedRange: res.data.updatedRange,
      updatedRows: res.data.updatedRows,
      updatedColumns: res.data.updatedColumns,
      updatedCells: res.data.updatedCells,
    };
  } catch (err) {
    return { error: classifySheetsError(err) };
  }
}

// ── Append Rows ──────────────────────────────────────────

async function handleAppendRows(step: AppendRows, sheets: sheets_v4.Sheets) {
  try {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: step.spreadsheetId,
      range: step.range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: step.values },
    });
    return {
      updatedRange: res.data.updates?.updatedRange,
      updatedRows: res.data.updates?.updatedRows,
      updatedCells: res.data.updates?.updatedCells,
    };
  } catch (err) {
    return { error: classifySheetsError(err) };
  }
}

// ── Clear Range ──────────────────────────────────────────

async function handleClearRange(step: ClearRange, sheets: sheets_v4.Sheets) {
  try {
    const res = await sheets.spreadsheets.values.clear({
      spreadsheetId: step.spreadsheetId,
      range: step.range,
    });
    return { clearedRange: res.data.clearedRange };
  } catch (err) {
    return { error: classifySheetsError(err) };
  }
}

// ── Add Sheet Tab ────────────────────────────────────────

async function handleAddSheet(step: AddSheet, sheets: sheets_v4.Sheets) {
  try {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: step.spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: step.title } } }],
      },
    });
    const newSheet = res.data.replies?.[0]?.addSheet?.properties;
    return {
      sheetId: newSheet?.sheetId,
      title: newSheet?.title,
    };
  } catch (err) {
    return { error: classifySheetsError(err) };
  }
}

// ── List Spreadsheets ────────────────────────────────────

async function handleListSpreadsheets(step: ListSpreadsheets, drive: drive_v3.Drive) {
  try {
    const res = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.spreadsheet' and name contains '${step.query.replace(/'/g, "\\'")}' and trashed=false`,
      fields: "files(id,name,modifiedTime,webViewLink)",
      pageSize: 20,
    });

    const spreadsheets = (res.data.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
      url: f.webViewLink,
    }));

    return { spreadsheets };
  } catch (err) {
    return { error: classifySheetsError(err) };
  }
}
