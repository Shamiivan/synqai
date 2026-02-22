/**
 * One-time script: opens your browser for Google OAuth consent,
 * then prints the refresh token to paste into .env.local.
 *
 * Requests all scopes needed by calendar + gmail agents at once.
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

// Load .env.local from monorepo root (4 levels up from scripts/)
dotenv.config({ path: path.resolve(__dirname, "../../../../../.env.local") });

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
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
