# SynqAI

A Discord-integrated AI agent that manages Google Workspace. One unified agent loop sees all 51 tools across Calendar, Gmail, Sheets, Docs, Drive, and Meet — pausing for human confirmation on destructive or external actions.

## Architecture

```
Discord message
  → bot.ts (creates run in Convex)
  → worker.ts (claims run, calls agent)
  → Agent loop (Gemini Flash picks from 51 tools)
     ├─ Tool Gateway (code-enforced safety: confirm before send/delete/share)
     ├─ Tool Registry (flat intent → handler map)
     └─ request_info → pause run, ask user in Discord thread
        └─ user replies → resume run, continue loop
```

**Stack:** TypeScript, pnpm monorepo, Convex, BAML, Gemini 2.5 Flash, discord.js, googleapis.

## Project Structure

```
runtime/
  src/main.ts           Wiring: tools → registry → agent → worker → bot
  src/agent-loop.ts     Inner loop (30 turns, stuck detection, gateway)
  src/tool-registry.ts  Flat map: 51 intents → handlers
  src/tool-gateway.ts   Safety: action classes + risk flags
  src/worker.ts         Outer HITL loop (claim → run → pause/finish)
  src/bot.ts            Discord transport
  baml_src/agent.baml   Unified BAML (all tool types + control intents)

packages/
  gworkspace/{calendar,gmail,docs,sheets,drive,meet}/
    src/tools.ts        Domain tool handlers (Google API calls)
    src/google-auth.ts  OAuth2 setup
  contracts/
    src/index.ts        Shared interfaces (tools, logger, gateway)
    src/step-types.ts   Step types for all 51 tools
  human-loop/           Thread class (conversation history)

convex/
  schema.ts             agentRuns + conversations tables
  runs.ts               Lifecycle mutations (create, claim, pause, resume, finish)
```

## Setup

1. `pnpm install`
2. Create `.env.local` with `CONVEX_URL`, `DISCORD_TOKEN`, Google OAuth credentials
3. `pnpm run dev:convex` (keep running)
4. `pnpm run bot` (starts Discord bot + worker)

## Commands

| Command | Description |
|---------|-------------|
| `pnpm run dev:convex` | Start Convex dev server |
| `pnpm run bot` | Start Discord bot + worker |
| `pnpm run baml:generate` | Regenerate BAML client |
| `pnpm run test:convex` | Run Convex tests |

## Adding a New Tool

1. Add class in `runtime/baml_src/agent.baml`
2. Add handler in `runtime/src/tool-registry.ts`
3. Add entry in `runtime/src/tool-gateway.ts` (pick action class + risk flags)
4. Add step type in `packages/contracts/src/step-types.ts`
