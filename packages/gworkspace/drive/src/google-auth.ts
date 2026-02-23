import { google } from "googleapis";
import { getGoogleAuth } from "@synqai/gworkspace-auth";

export function getDriveClient() {
  return google.drive({ version: "v3", auth: getGoogleAuth() });
}
