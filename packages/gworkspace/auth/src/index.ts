import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export function getGoogleAuth(): OAuth2Client {
  const auth = new google.auth.OAuth2(
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET"),
  );

  auth.setCredentials({ refresh_token: requireEnv("GOOGLE_REFRESH_TOKEN") });

  return auth;
}
