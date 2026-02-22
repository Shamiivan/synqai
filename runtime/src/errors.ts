export type RunErrorReason = "llm" | "convex" | "discord" | "timeout" | "agent";

export class RunError extends Error {
  reason: RunErrorReason;
  status?: number;

  constructor(reason: RunErrorReason, message: string, status?: number) {
    super(message);
    this.name = "RunError";
    this.reason = reason;
    this.status = status;
  }
}

export function classifyError(err: unknown): RunError {
  if (err instanceof RunError) return err;

  const name = err instanceof Error ? err.constructor.name : "";
  const msg = err instanceof Error ? err.message : String(err);

  if (name.startsWith("Baml")) {
    const status = (err as any).status_code;
    return new RunError(
      "llm",
      msg,
      typeof status === "number" ? status : undefined,
    );
  }
  if (name === "ConvexError" || name.includes("Convex"))
    return new RunError("convex", msg);
  if (name === "DiscordAPIError" || name.includes("Discord"))
    return new RunError("discord", msg);
  if (/timeout|timed?\s*out/i.test(msg)) return new RunError("timeout", msg);

  return new RunError("agent", msg);
}
