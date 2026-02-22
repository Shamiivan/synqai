import { Thread } from "@synqai/human-loop";
import { api } from "../convex/_generated/api.js";
import { runRouter } from "./agents/router";
import { agentLoop, getLastIntent, getLastMessage } from "@synqai/gworkspace-calendar/src/agent";
import { classifyError, type Logger, type WorkerDeps } from "./lib";

export function startWorker(deps: WorkerDeps) {
  const { convex, log } = deps;

  convex.onUpdate(api.runs.listPending, {}, async (pending) => {
    for (const _ of pending) {
      const run = await convex.mutation(api.runs.claim, {});
      if (!run) break;
      processRun(run, deps).catch((err) =>
        log.error(`Uncaught error on run ${run._id}`, { error: String(err) })
      );
    }
  });
  log.info("Listening for pending runs");
}

async function processRun(
  run: { _id: any; currentAgent: "router" | "calendar"; thread: string },
  deps: WorkerDeps,
) {
  const { convex } = deps;
  const runId = String(run._id).slice(-4);
  const log = deps.log.child(`run-${runId}`);

  const thread = Thread.fromJSON(JSON.parse(run.thread));
  log.info("Processing", { currentAgent: run.currentAgent });

  try {
    let intent: string;
    let message: string | undefined;
    let resultThread: Thread;
    let currentAgent: "router" | "calendar" = run.currentAgent;

    if (run.currentAgent === "calendar") {
      log.info("Resuming calendar agent");
      resultThread = await agentLoop(thread, { log: log.child("calendar") });
      intent = getLastIntent(resultThread);
      message = getLastMessage(resultThread);
    } else {
      const result = await runRouter(thread, { log });
      resultThread = result.thread;
      intent = result.intent;
      message = result.message;
      if (result.currentAgent) currentAgent = result.currentAgent;
    }

    if (intent === "request_info") {
      await convex.mutation(api.runs.pause, {
        id: run._id,
        currentAgent,
        thread: JSON.stringify(resultThread.toJSON()),
        question: message ?? "Need more information",
      });
      log.info("Paused — waiting for human", { question: message });
    } else {
      // Ensure the final message is in the thread for downstream consumers
      const events = resultThread.toJSON() as any[];
      const hasOutput = events.some((e: any) => e.type === "agent_output");
      if (message && !hasOutput) {
        events.push({ type: "agent_output", data: message });
      }
      await convex.mutation(api.runs.finish, {
        id: run._id,
        thread: JSON.stringify(events),
      });
      log.info("Finished", { message });
    }
  } catch (err) {
    const runErr = classifyError(err);
    log.error("Agent error", { reason: runErr.reason, status: runErr.status });
    await convex.mutation(api.runs.fail, {
      id: run._id,
      thread: JSON.stringify(thread.toJSON()),
    });
  }
}
