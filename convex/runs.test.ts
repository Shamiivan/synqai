import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Helper: create a run and return its id
async function createRun(t: ReturnType<typeof convexTest>) {
  return await t.mutation(api.runs.create, {
    input: "test input",
    discordChannelId: "ch-1",
    discordMessageId: "msg-" + Math.random().toString(36).slice(2),
  });
}

// Helper: create a run already in a given status
async function createRunInStatus(
  t: ReturnType<typeof convexTest>,
  status: "pending" | "running" | "waiting_human" | "done" | "failed",
) {
  const id = await createRun(t);
  if (status === "pending") return id;

  // pending → running
  await t.run(async (ctx) => {
    await ctx.db.patch(id, { status: "running" });
  });
  if (status === "running") return id;

  if (status === "waiting_human") {
    await t.mutation(api.runs.pause, {
      id,
      thread: JSON.stringify([{ type: "user_input", data: "test" }]),
      question: "What time?",
    });
    return id;
  }

  if (status === "done") {
    await t.mutation(api.runs.finish, {
      id,
      thread: JSON.stringify([{ type: "user_input", data: "test" }]),
    });
    return id;
  }

  if (status === "failed") {
    await t.mutation(api.runs.fail, { id });
    return id;
  }

  return id;
}

describe("Core mutations", () => {
  test("create inserts a pending run and linked conversation", async () => {
    const t = convexTest(schema, modules);

    const runId = await t.mutation(api.runs.create, {
      input: "Book a meeting",
      discordChannelId: "ch-1",
      discordMessageId: "msg-1",
    });

    const run = await t.query(api.runs.get, { id: runId });
    expect(run).not.toBeNull();
    expect(run!.status).toBe("pending");
    expect(JSON.parse(run!.thread)).toEqual([
      { type: "user_input", data: "Book a meeting" },
    ]);

    const conv = await t.query(api.runs.getConversationByRun, { runId });
    expect(conv).not.toBeNull();
    expect(conv!.discordChannelId).toBe("ch-1");
    expect(conv!.discordMessageId).toBe("msg-1");
  });

  test("create is idempotent — same messageId returns existing runId", async () => {
    const t = convexTest(schema, modules);

    const id1 = await t.mutation(api.runs.create, {
      input: "First",
      discordChannelId: "ch-1",
      discordMessageId: "msg-dup",
    });
    const id2 = await t.mutation(api.runs.create, {
      input: "Second",
      discordChannelId: "ch-1",
      discordMessageId: "msg-dup",
    });

    expect(id1).toEqual(id2);
  });

  test("claim picks first pending run and marks it running", async () => {
    const t = convexTest(schema, modules);
    const runId = await createRun(t);

    const claimed = await t.mutation(api.runs.claim, {});
    expect(claimed).not.toBeNull();
    expect(claimed!._id).toEqual(runId);
    expect(claimed!.status).toBe("running");

    const run = await t.query(api.runs.get, { id: runId });
    expect(run!.status).toBe("running");
  });

  test("claim contention — second claim returns null", async () => {
    const t = convexTest(schema, modules);
    await createRun(t);

    const first = await t.mutation(api.runs.claim, {});
    expect(first).not.toBeNull();

    const second = await t.mutation(api.runs.claim, {});
    expect(second).toBeNull();
  });

  test("pause + resume — running → waiting_human → pending with human_response appended", async () => {
    const t = convexTest(schema, modules);
    const runId = await createRunInStatus(t, "running");
    const thread = JSON.stringify([{ type: "user_input", data: "test" }]);

    // Pause
    await t.mutation(api.runs.pause, {
      id: runId,
      thread,
      question: "What time?",
    });
    const paused = await t.query(api.runs.get, { id: runId });
    expect(paused!.status).toBe("waiting_human");
    expect(paused!.question).toBe("What time?");

    // Resume
    await t.mutation(api.runs.resume, { id: runId, answer: "3pm" });
    const resumed = await t.query(api.runs.get, { id: runId });
    expect(resumed!.status).toBe("pending");
    expect(resumed!.question).toBeUndefined();

    const events = JSON.parse(resumed!.thread);
    const lastEvent = events[events.length - 1];
    expect(lastEvent).toEqual({ type: "human_response", data: "3pm" });
  });

  test("createFollowUp seeds from previous thread, filters agent_output and done tool_calls", async () => {
    const t = convexTest(schema, modules);

    // Create and finish a first run with mixed event types
    const prevThread = JSON.stringify([
      { type: "user_input", data: "book meeting" },
      { type: "tool_call", data: { intent: "list_events", args: {} } },
      { type: "agent_output", data: "Here are your events" },
      { type: "tool_call", data: { intent: "done", args: {} } },
    ]);
    const firstId = await createRunInStatus(t, "running");
    await t.mutation(api.runs.finish, { id: firstId, thread: prevThread });

    // Create follow-up
    const followUpId = await t.mutation(api.runs.createFollowUp, {
      previousRunId: firstId,
      input: "actually make it tomorrow",
      discordChannelId: "ch-1",
      discordMessageId: "msg-follow",
    });

    const followUp = await t.query(api.runs.get, { id: followUpId });
    const events = JSON.parse(followUp!.thread);

    // Should keep user_input and non-done tool_call, filter agent_output and done tool_call
    expect(events).toEqual([
      { type: "user_input", data: "book meeting" },
      { type: "tool_call", data: { intent: "list_events", args: {} } },
      { type: "user_input", data: "actually make it tomorrow" },
    ]);
    expect(followUp!.status).toBe("pending");
  });
});

describe("Policy", () => {
  test("cancelStale cancels running + stale pending, preserves waiting_human and fresh pending", async () => {
    const t = convexTest(schema, modules);

    // Create runs in various states
    const runningId = await createRunInStatus(t, "running");
    const waitingId = await createRunInStatus(t, "waiting_human");

    // Create a "stale" pending (created before cutoff)
    const stalePendingId = await createRun(t);

    // Use a cutoff far in the future to make the stale pending old enough
    const cutoff = Date.now() + 60_000;

    // Create a "fresh" pending (created after cutoff — simulate by using cutoff in the past)
    // Actually: we'll create all runs first, then use cutoff = now + small delta
    // The stale pending was created before cutoff, fresh pending after
    const freshPendingId = await createRun(t);

    // Get the fresh pending's creation time so we can set cutoff between stale and fresh
    const freshRun = await t.query(api.runs.get, { id: freshPendingId });
    // Use fresh run's creation time as cutoff — stale was created before, fresh at this time
    const count = await t.mutation(api.runs.cancelStale, {
      cutoff: freshRun!._creationTime,
    });

    // running should be cancelled
    const running = await t.query(api.runs.get, { id: runningId });
    expect(running!.status).toBe("failed");

    // stale pending should be cancelled (created before cutoff)
    const stalePending = await t.query(api.runs.get, { id: stalePendingId });
    expect(stalePending!.status).toBe("failed");

    // waiting_human should be preserved
    const waiting = await t.query(api.runs.get, { id: waitingId });
    expect(waiting!.status).toBe("waiting_human");

    // fresh pending should be preserved (created at/after cutoff)
    const fresh = await t.query(api.runs.get, { id: freshPendingId });
    expect(fresh!.status).toBe("pending");
  });

  test("full lifecycle: create → claim → pause → resume → claim → finish", async () => {
    const t = convexTest(schema, modules);

    // Create
    const runId = await t.mutation(api.runs.create, {
      input: "Book meeting",
      discordChannelId: "ch-1",
      discordMessageId: "msg-lifecycle",
    });
    let run = await t.query(api.runs.get, { id: runId });
    expect(run!.status).toBe("pending");

    // Claim
    const claimed = await t.mutation(api.runs.claim, {});
    expect(claimed!._id).toEqual(runId);
    expect(claimed!.status).toBe("running");

    // Pause
    await t.mutation(api.runs.pause, {
      id: runId,
      thread: JSON.stringify([{ type: "user_input", data: "Book meeting" }]),
      question: "What time?",
    });
    run = await t.query(api.runs.get, { id: runId });
    expect(run!.status).toBe("waiting_human");

    // Resume
    await t.mutation(api.runs.resume, { id: runId, answer: "3pm" });
    run = await t.query(api.runs.get, { id: runId });
    expect(run!.status).toBe("pending");

    // Re-claim
    const reclaimed = await t.mutation(api.runs.claim, {});
    expect(reclaimed!._id).toEqual(runId);
    expect(reclaimed!.status).toBe("running");

    // Finish
    await t.mutation(api.runs.finish, {
      id: runId,
      thread: JSON.stringify([
        { type: "user_input", data: "Book meeting" },
        { type: "human_response", data: "3pm" },
        { type: "agent_output", data: "Done!" },
      ]),
    });
    run = await t.query(api.runs.get, { id: runId });
    expect(run!.status).toBe("done");
  });
});

describe("Guard contracts", () => {
  test("terminal states (done, failed) are immutable — all transitions throw", async () => {
    const terminalStatuses = ["done", "failed"] as const;
    const mutations = [
      {
        name: "finish",
        fn: (t: ReturnType<typeof convexTest>, id: any) =>
          t.mutation(api.runs.finish, { id, thread: "[]" }),
      },
      {
        name: "pause",
        fn: (t: ReturnType<typeof convexTest>, id: any) =>
          t.mutation(api.runs.pause, {
            id,
                  thread: "[]",
            question: "q",
          }),
      },
      {
        name: "fail",
        fn: (t: ReturnType<typeof convexTest>, id: any) =>
          t.mutation(api.runs.fail, { id }),
      },
      {
        name: "resume",
        fn: (t: ReturnType<typeof convexTest>, id: any) =>
          t.mutation(api.runs.resume, { id, answer: "a" }),
      },
    ];

    for (const status of terminalStatuses) {
      for (const { name, fn } of mutations) {
        const t = convexTest(schema, modules);
        const id = await createRunInStatus(t, status);
        await expect(fn(t, id)).rejects.toThrow(
          `Cannot ${name}: status is ${status}`,
        );
      }
    }
  });

  test("invalid non-terminal transitions throw", async () => {
    const cases = [
      { status: "pending" as const, mutation: "finish", action: "finish" },
      { status: "pending" as const, mutation: "pause", action: "pause" },
      {
        status: "waiting_human" as const,
        mutation: "finish",
        action: "finish",
      },
      { status: "waiting_human" as const, mutation: "pause", action: "pause" },
      { status: "running" as const, mutation: "resume", action: "resume" },
    ];

    for (const { status, mutation, action } of cases) {
      const t = convexTest(schema, modules);
      const id = await createRunInStatus(t, status);

      const call =
        mutation === "finish"
          ? t.mutation(api.runs.finish, { id, thread: "[]" })
          : mutation === "pause"
            ? t.mutation(api.runs.pause, {
                id,
                          thread: "[]",
                question: "q",
              })
            : t.mutation(api.runs.resume, { id, answer: "a" });

      await expect(call).rejects.toThrow(
        `Cannot ${action}: status is ${status}`,
      );
    }
  });
});
