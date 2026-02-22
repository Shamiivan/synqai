import { config } from "dotenv";
import { resolve } from "path";
import { Thread, cli } from "@synqai/human-loop";
import { agentLoop, getLastIntent, getLastMessage } from "./agent";

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

  const ask = cli();
  let thread = new Thread([{ type: "user_input", data: input }]);

  // Outer loop: re-run agentLoop after each human answer
  while (true) {
    thread = await agentLoop(thread);
    const intent = getLastIntent(thread);

    if (intent === "done") {
      console.log("\n" + getLastMessage(thread));
      break;
    }

    if (intent === "request_info") {
      const answer = await ask(getLastMessage(thread) ?? "Need more info:");
      thread.events.push({ type: "human_response", data: answer });
      continue;
    }

    console.log("Unexpected intent:", intent);
    break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
