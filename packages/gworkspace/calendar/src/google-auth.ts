import { google } from "googleapis";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export function getCalendarClient() {
  const auth = new google.auth.OAuth2(
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET"),
  );

  auth.setCredentials({ refresh_token: requireEnv("GOOGLE_REFRESH_TOKEN") });

  return google.calendar({ version: "v3", auth });
}

export const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
