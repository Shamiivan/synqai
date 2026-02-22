import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { ConvexClient } from "convex/browser";
import { b } from "./baml_client";
import { api } from "../convex/_generated/api.js";

const convex = new ConvexClient(process.env.CONVEX_URL!);

let processing = false;

convex.onUpdate(api.runs.listPending, {}, async (pending) => {
  if (pending.length === 0 || processing) return;
  processing = true;

  try {
    const run = await convex.mutation(api.runs.claim, {});
    if (!run) return;

    console.log(`Claimed run ${run._id} — entering agent loop...`);

    while (true) {
      const nextStep = await b.DetermineNextStep(run.input);

      switch (nextStep.intent) {
        case "done_for_now": {
          await convex.mutation(api.runs.finish, {
            id: run._id,
            output: nextStep.message,
          });
          console.log(`Finished run ${run._id}`);
          return;
        }
      }
    }
  } catch (err) {
    console.error("Worker error:", err);
  } finally {
    processing = false;
  }
});

console.log("Worker subscribed — waiting for pending runs...");
