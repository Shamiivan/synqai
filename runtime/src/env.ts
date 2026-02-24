// Side-effect-only module: loads .env.local before any other code.
// Must be the FIRST import in main.ts so esbuild's import hoisting
// still resolves this module (and runs dotenv) before logging.ts etc.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// BAML's onLogEvent callback requires the internal tracer to be initialized.
// The tracer only initializes when these env vars are non-empty.
// Values don't need to be real Boundary Studio credentials.
process.env.BOUNDARY_SECRET ??= "local";
process.env.BOUNDARY_PROJECT_ID ??= "local";
