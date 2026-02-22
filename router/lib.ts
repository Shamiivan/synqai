import type { ConvexClient } from "convex/browser";

// --- Logger ---

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
  child(name: string): Logger;
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta) return "";
  return (
    " " +
    Object.entries(meta)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")
  );
}

export function createLogger(subsystem: string): Logger {
  const prefix = `[${subsystem}]`;
  return {
    info: (msg, meta) => console.log(`${prefix} ${msg}${formatMeta(meta)}`),
    warn: (msg, meta) =>
      console.error(`${prefix} WARN ${msg}${formatMeta(meta)}`),
    error: (msg, meta) =>
      console.error(`${prefix} ERROR ${msg}${formatMeta(meta)}`),
    debug: (msg, meta) => {
      if (process.env.DEBUG)
        console.log(`${prefix} DEBUG ${msg}${formatMeta(meta)}`);
    },
    child: (name) => createLogger(`${subsystem}/${name}`),
  };
}

// --- RunError ---

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

export interface WorkerDeps {
  convex: ConvexClient;
  log: Logger;
}
