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
  run: { _id: any; thread: string },
  deps: WorkerDependencies,
) {
  const { convex, agent, log: rootLog } = deps;
  const runId = String(run._id).slice(-4);
  const log = rootLog.child(`run-${runId}`);

  const thread = Thread.fromJSON(JSON.parse(run.thread));
  log.info("Processing");

  try {
    const result = await agent.run(thread, log);

    if (result.intent === "request_info") {
      await convex.mutation(api.runs.pause, {
        id: run._id,
        thread: JSON.stringify(result.thread.toJSON()),
        question: result.message ?? "Need more information",
      });
      log.info("Paused — waiting for human", { question: result.message });
    } else {
      const events = result.thread.toJSON() as any[];
      const hasOutput = events.some((e: any) => e.type === "agent_output");
      if (result.message && !hasOutput) {
        events.push({ type: "agent_output", data: result.message });
      }
      await convex.mutation(api.runs.finish, {
        id: run._id,
        thread: JSON.stringify(events),
      });
      log.info("Finished", { message: result.message });
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
