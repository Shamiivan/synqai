import { google } from "googleapis";
import { getGoogleAuth } from "@synqai/gworkspace-auth";

export function getDocsClient() {
  return google.docs({ version: "v1", auth: getGoogleAuth() });
}

export function getDriveClient() {
  return google.drive({ version: "v3", auth: getGoogleAuth() });
}
