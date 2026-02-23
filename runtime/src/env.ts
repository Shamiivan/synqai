// Side-effect-only module: loads .env.local before any other code.
// Must be the FIRST import in main.ts so esbuild's import hoisting
// still resolves this module (and runs dotenv) before logging.ts etc.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
