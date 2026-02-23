import pino from "pino";
import type { Logger } from "@synqai/contracts";

const isProd = process.env.NODE_ENV === "production";

const pinoRoot = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: [
    "token", "secret", "authorization", "password", "refreshToken",
    "*.token", "*.secret", "*.authorization", "*.password", "*.refreshToken",
  ],
  transport: isProd
    ? undefined // JSON to stdout in prod (transports added in slice 2)
    : { target: "pino-pretty", options: { colorize: true } },
});

/** Wrap a pino child to match the shared Logger interface. */
function wrapPino(p: pino.Logger, scope: string): Logger {
  return {
    info: (msg, meta) => (meta ? p.info(meta, msg) : p.info(msg)),
    warn: (msg, meta) => (meta ? p.warn(meta, msg) : p.warn(msg)),
    error: (msg, meta) => (meta ? p.error(meta, msg) : p.error(msg)),
    debug: (msg, meta) => (meta ? p.debug(meta, msg) : p.debug(msg)),
    child: (name) => {
      const childScope = `${scope}/${name}`;
      return wrapPino(p.child({ scope: childScope }), childScope);
    },
  };
}

export function createLogger(subsystem: string): Logger {
  return wrapPino(pinoRoot.child({ scope: subsystem }), subsystem);
}
