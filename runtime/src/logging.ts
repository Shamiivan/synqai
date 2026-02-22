import type { Logger } from "@synqai/contracts";

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
