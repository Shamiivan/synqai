/**
 * One-time script: opens your browser for Google OAuth consent,
 * then prints the refresh token to paste into .env.local.
 *
 * Requests ALL scopes configured on the Google Cloud project in one consent flow.
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy pnpm exec tsx scripts/get-token.ts
 *
 * Or set them in .env.local first and run from the auth package dir.
 */
import { google } from "googleapis";
import http from "node:http";
import { URL } from "node:url";
import path from "node:path";
import { exec } from "node:child_process";
import dotenv from "dotenv";

// Load .env.local from monorepo root (scripts/ → auth/ → gworkspace/ → packages/ → synqai/)
dotenv.config({ path: path.resolve(__dirname, "../../../../.env.local") });

const SCOPES = [
  // Calendar
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.events.owned.readonly",
  "https://www.googleapis.com/auth/calendar.events.public.readonly",
  "https://www.googleapis.com/auth/calendar.events.freebusy",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.calendars",
  "https://www.googleapis.com/auth/calendar.calendars.readonly",
  "https://www.googleapis.com/auth/calendar.acls",
  "https://www.googleapis.com/auth/calendar.acls.readonly",
  "https://www.googleapis.com/auth/calendar.settings.readonly",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.app.created",

  // Gmail — only broad scopes; gmail.metadata conflicts with q parameter when
  // present alongside gmail.readonly (Google enforces narrowest scope first)
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.insert",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/gmail.settings.sharing",

  // Drive
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.meet.readonly",
  "https://www.googleapis.com/auth/drive.metadata",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.scripts",
  "https://www.googleapis.com/auth/drive.activity",
  "https://www.googleapis.com/auth/drive.activity.readonly",

  // Meet
  "https://www.googleapis.com/auth/meetings.conference.media.readonly",
  "https://www.googleapis.com/auth/meetings.conference.media.audio.readonly",
  "https://www.googleapis.com/auth/meetings.conference.media.video.readonly",

  // User info
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",

  // IAM
  "https://www.googleapis.com/auth/iam.test",
];
const PORT = 3199;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in env or .env.local");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

console.log("\nOpening browser for Google OAuth consent...\n");
console.log("If the browser doesn't open, visit:\n", authUrl, "\n");

// Try to open browser (best-effort)
const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
exec(`${cmd} "${authUrl}"`);

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) {
    res.writeHead(404);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");

  if (!code) {
    res.writeHead(400);
    res.end("Missing code parameter");
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>Done! You can close this tab.</h1>");

    console.log("=".repeat(60));
    console.log("Add this to your .env.local:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log("=".repeat(60));
  } catch (err: any) {
    res.writeHead(500);
    res.end("Token exchange failed: " + err.message);
    console.error("Token exchange failed:", err.message);
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}/callback for OAuth redirect...\n`);
});
