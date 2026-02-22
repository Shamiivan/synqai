import { google } from "googleapis";
import { getGoogleAuth } from "@synqai/gworkspace-auth";

export function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getGoogleAuth() });
}

export function getDriveClient() {
  return google.drive({ version: "v3", auth: getGoogleAuth() });
}
