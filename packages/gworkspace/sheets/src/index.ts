import { config } from "dotenv";
import { resolve } from "path";
import { createInterface } from "readline";
import { Thread } from "@synqai/human-loop";
import { b } from "../baml_client";
import { createSheetsTools } from "./tools";
import { createSheetsAgent, getLastIntent, getLastMessage } from "./agent";
import { getSheetsClient, getDriveClient } from "./google-auth";

config({ path: resolve(__dirname, "../../../../.env.local") });

function cliAsk(message: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message}\n> `, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => noopLogger,
};

async function main() {
  const input = process.argv.slice(2).join(" ");
  if (!input) {
    console.error('Usage: npx tsx src/index.ts "Create a spreadsheet called Budget"');
    process.exit(1);
  }

  const tools = createSheetsTools({ sheets: getSheetsClient(), drive: getDriveClient() });
  const agent = createSheetsAgent({
    baml: { sheetsNextStep: (thread, today) => b.SheetsNextStep(thread, today) },
    tools,
    log: noopLogger,
  });

  let thread = new Thread([{ type: "user_input", data: input }]);

  while (true) {
    thread = await agent.run(thread);
    const intent = getLastIntent(thread);

    if (intent === "done") {
      console.log("\n" + getLastMessage(thread));
      break;
    }

    if (intent === "request_info") {
      const answer = await cliAsk(getLastMessage(thread) ?? "Need more info:");
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
