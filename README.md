# SynqAI

A Discord-integrated AI agent system with human-in-the-loop workflows. Users chat in Discord, an LLM router decides intent, and specialized agents (starting with Google Calendar) handle tasks — pausing to ask clarifying questions when needed.

## Architecture

```
Discord message
  → bot.ts (creates run in Convex)
  → worker.ts (claims run, calls router)
  → Router BAML (Gemini Flash) → "done" or "handoff"
     └─ handoff → Calendar agent loop
        └─ create_event / list_events / request_info / done
           └─ request_info → pause run, ask user in Discord thread
              └─ user replies → resume run, continue agent loop
```

**Stack:** TypeScript, pnpm monorepo, Convex (backend), BAML (typed prompts), Gemini 2.5 Flash, discord.js, googleapis.

## Project Structure

```
router/
  bot.ts              Discord bot + thread management
  worker.ts           Agent execution loop (claim → route → finish/pause)
  agents/router.ts    Intent dispatcher
  baml_src/           Router BAML definitions

packages/
  gworkspace/calendar/
    src/agent.ts      Calendar agent loop
    src/tools.ts      Google Calendar API (create/list events)
    src/google-auth.ts OAuth2 setup
    scripts/get-token.ts  One-time OAuth token helper

  human-loop/
    src/index.ts      Thread class (conversation history) + AskHuman type

convex/
  schema.ts           agentRuns + conversations tables
  runs.ts             create, claim, pause, resume, finish mutations
```

## Setup

### Prerequisites

- Node.js 18+
- pnpm (`corepack enable && corepack prepare pnpm@10.26.1`)
- A [Convex](https://convex.dev) account
- A [Discord bot](https://discord.com/developers/applications) token
- Google Cloud OAuth2 credentials (Calendar API enabled)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Create `.env.local` in the repo root:

```bash
# Convex
CONVEX_URL=https://<your-deployment>.convex.cloud
CONVEX_DEPLOYMENT=dev:<your-deployment>

# Discord
DISCORD_TOKEN=<your-bot-token>

# Google Calendar
GOOGLE_CLIENT_ID=<oauth-client-id>
GOOGLE_CLIENT_SECRET=<oauth-client-secret>
GOOGLE_REFRESH_TOKEN=<see step 3>
GOOGLE_CALENDAR_ID=primary  # optional, defaults to primary
```

### 3. Get Google refresh token (one-time)

```bash
cd packages/gworkspace/calendar
pnpm exec tsx scripts/get-token.ts
```

Opens your browser for OAuth consent, then prints a refresh token. Paste it into `.env.local` as `GOOGLE_REFRESH_TOKEN`.

### 4. Start Convex backend

```bash
pnpm run dev:convex
```

Keep this running — it syncs your schema and generates types.

### 5. Start the bot

In a second terminal:

```bash
pnpm run bot
```

This starts the Discord bot and the worker loop. Send a message in your Discord server and the bot will respond.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm run dev:convex` | Start Convex dev server |
| `pnpm run bot` | Start Discord bot + worker |
| `pnpm run baml:generate` | Regenerate router BAML client |
| `cd packages/gworkspace/calendar && pnpm run dev` | Test calendar agent standalone (CLI) |

## How It Works

1. **User sends a Discord message** — bot creates a pending run in Convex
2. **Worker claims the run** — calls router BAML to classify intent
3. **Router decides**: reply directly (`done_for_now`) or hand off to a specialist agent (`handoff`)
4. **Calendar agent loops**: calls Gemini to decide next action (create event, list events, ask for info, or finish)
5. **If info is missing**: run pauses (`waiting_human`), bot posts a question in a Discord thread
6. **User replies in thread**: bot forwards the answer, run resumes from where it left off
7. **When done**: bot posts the final response in the original channel
