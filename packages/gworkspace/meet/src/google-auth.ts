import { google } from "googleapis";
import { getGoogleAuth } from "@synqai/gworkspace-auth";

export function getMeetClient() {
  return google.meet({ version: "v2", auth: getGoogleAuth() });
}
