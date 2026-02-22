import { config } from "dotenv";
import { resolve } from "path";
import { cli } from "@synqai/human-loop";
import { run } from "./agent";

// Load .env.local from monorepo root
config({ path: resolve(__dirname, "../../../../.env.local") });

async function main() {
  const input = process.argv.slice(2).join(" ");
  if (!input) {
    console.error(
      'Usage: npx tsx src/index.ts "create board meeting for tomorrow"',
    );
    process.exit(1);
  }

  const result = await run(input, cli());
  console.log("\n" + result.message);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
