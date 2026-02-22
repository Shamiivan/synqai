import { google } from "googleapis";
import { getGoogleAuth } from "@synqai/gworkspace-auth";

export function getGmailClient() {
  return google.gmail({ version: "v1", auth: getGoogleAuth() });
}

export const userId = "me";
