import pino from "pino";
import type { Logger } from "@synqai/contracts";

const isProd = process.env.NODE_ENV === "production";

function buildTransport(): pino.TransportSingleOptions | pino.TransportMultiOptions {
  // Dev: pretty-print to stdout
  if (!isProd) {
    return { target: "pino-pretty", options: { colorize: true } };
  }

  // Prod: always stdout (JSON for PM2), optionally Axiom
  const targets: pino.TransportTargetOptions[] = [
    { target: "pino/file", level: "info", options: { destination: 1 } },
  ];

  if (process.env.AXIOM_TOKEN) {
    targets.push({
      target: "@axiomhq/pino",
      level: "info",
      options: { dataset: process.env.AXIOM_DATASET || "synqai", token: process.env.AXIOM_TOKEN },
    });
  }

  return { targets };
}

const pinoRoot = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: [
    "token", "secret", "authorization", "password", "refreshToken",
    "*.token", "*.secret", "*.authorization", "*.password", "*.refreshToken",
  ],
  transport: buildTransport(),
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
