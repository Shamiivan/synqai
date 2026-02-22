import { Thread } from "@synqai/human-loop";
import { api } from "../convex/_generated/api.js";
import { runRouter } from "./agents/router";
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
  run: { _id: any; agent: string; input: string; thread?: string | null },
  deps: WorkerDeps,
) {
  const { convex } = deps;
  const runId = String(run._id).slice(-4);
  const log = deps.log.child(`run-${runId}`);

  log.info("Processing", { agent: run.agent, input: run.input });

  const thread = run.thread
    ? Thread.fromJSON(JSON.parse(run.thread))
    : new Thread([{ type: "user_input", data: run.input }]);

  try {
    const result = await runRouter(thread, { log });

    if (result.intent === "request_info") {
      await convex.mutation(api.runs.pause, {
        id: run._id,
        thread: JSON.stringify(result.thread.toJSON()),
        question: result.message ?? "Need more information",
      });
      log.info("Paused — waiting for human", { question: result.message });
    } else {
      await convex.mutation(api.runs.finish, {
        id: run._id,
        output: result.message ?? "Done.",
      });
      log.info("Finished");
    }
  } catch (err) {
    const runErr = classifyError(err);
    log.error("Agent error", { reason: runErr.reason, status: runErr.status });
    await convex.mutation(api.runs.fail, {
      id: run._id,
      output: `[${runErr.reason}] ${runErr.message}`,
    });
  }
}
