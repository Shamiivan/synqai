import { Thread } from "@synqai/human-loop";
import type { WorkerDependencies } from "@synqai/contracts";
import { api } from "../../convex/_generated/api.js";
import { classifyError } from "./errors";

export function createWorker(dependencies: WorkerDependencies) {
  return { start: () => startWorker(dependencies) };
}

function startWorker(deps: WorkerDependencies) {
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
  deps: WorkerDependencies,
) {
  const { convex, route } = deps;
  const runId = String(run._id).slice(-4);
  const log = deps.log.child(`run-${runId}`);

  const thread = Thread.fromJSON(JSON.parse(run.thread));
  log.info("Processing", { currentAgent: run.currentAgent });

  try {
    const result = await route(thread);
    const { intent, message, currentAgent } = result;
    const resultThread: Thread = result.thread;

    if (intent === "request_info") {
      await convex.mutation(api.runs.pause, {
        id: run._id,
        currentAgent: currentAgent ?? run.currentAgent,
        thread: JSON.stringify(resultThread.toJSON()),
        question: message ?? "Need more information",
      });
      log.info("Paused — waiting for human", { question: message });
    } else {
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
