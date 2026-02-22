import { google } from "googleapis";
import { getGoogleAuth } from "@synqai/gworkspace-auth";

export function getCalendarClient() {
  return google.calendar({ version: "v3", auth: getGoogleAuth() });
}

export const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
