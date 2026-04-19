/**
 * Pino-backed logger factory for the FormSpec language server.
 *
 * Reads `process.env.DEBUG` to determine which namespaces are enabled.
 * When enabled, writes each JSON log line to the LSP connection's console
 * methods at the appropriate severity. When disabled, returns `noopLogger`.
 *
 * ## Enable convention
 *
 * `DEBUG=formspec:*` — enable all formspec namespaces
 * `DEBUG=formspec:lsp` — enable only the language server namespace
 * `DEBUG=formspec:*,-formspec:lsp:noisy` — wildcard with negation
 */

import { Writable } from "node:stream";
import type { LoggerLike } from "@formspec/core";
import { isNamespaceEnabled, noopLogger } from "@formspec/core";
import pino from "pino";

/**
 * Minimal shape of the LSP connection console required by `createLogger`.
 *
 * The LSP protocol exposes four severity channels. Pino numeric levels are
 * routed as: `trace/debug` → `log`, `info` → `info`, `warn` → `warn`,
 * `error` → `error`.
 */
export interface LspConsole {
  log(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * Pino numeric log levels.
 * @see https://github.com/pinojs/pino/blob/main/docs/api.md#loggerlevels
 */
const PINO_INFO = 30;
const PINO_WARN = 40;
const PINO_ERROR = 50;

/**
 * Shape of a pino JSON log record (only the fields we need for routing).
 */
interface PinoRecord {
  level: number;
  msg: string;
}

function isPinoRecord(value: unknown): value is PinoRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)["level"] === "number" &&
    typeof (value as Record<string, unknown>)["msg"] === "string"
  );
}

function buildSink(console: LspConsole): Writable {
  // pino writes one JSON object per line, but Node streams may chunk writes
  // across newline boundaries. Buffer partial lines across writes.
  let buffer = "";

  function emit(line: string): void {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return;
    }
    try {
      const record: unknown = JSON.parse(trimmed);
      if (!isPinoRecord(record)) {
        console.log(trimmed);
        return;
      }
      if (record.level >= PINO_ERROR) {
        console.error(trimmed);
      } else if (record.level >= PINO_WARN) {
        console.warn(trimmed);
      } else if (record.level >= PINO_INFO) {
        console.info(trimmed);
      } else {
        console.log(trimmed);
      }
    } catch {
      // Non-JSON line — forward as-is
      console.log(trimmed);
    }
  }

  return new Writable({
    write(chunk: unknown, _encoding, callback) {
      const raw: string =
        chunk instanceof Buffer
          ? chunk.toString("utf8")
          : typeof chunk === "string"
            ? chunk
            : String(chunk);
      buffer += raw;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        emit(line);
        newlineIndex = buffer.indexOf("\n");
      }
      callback();
    },
    final(callback) {
      if (buffer.length > 0) {
        emit(buffer);
        buffer = "";
      }
      callback();
    },
  });
}

function wrapLogger(logger: pino.Logger): LoggerLike {
  return {
    // pino's log methods accept (msg: string) or (obj: object, msg: string).
    // LoggerLike carries ...args: unknown[] for future extensibility but the
    // LSP logger only needs to forward the message string — extra args are
    // not used in practice here.
    trace: (msg) => {
      logger.trace(msg);
    },
    debug: (msg) => {
      logger.debug(msg);
    },
    info: (msg) => {
      logger.info(msg);
    },
    warn: (msg) => {
      logger.warn(msg);
    },
    error: (msg) => {
      logger.error(msg);
    },
    child: (bindings) => wrapLogger(logger.child(bindings)),
  };
}

/**
 * Creates a `LoggerLike` for the given namespace that forwards log records
 * to the LSP connection console.
 *
 * When `process.env.DEBUG` enables the namespace, constructs a pino logger
 * whose output is routed to the LSP connection console at the appropriate
 * severity (trace/debug/info → `console.log`, warn → `console.warn`,
 * error → `console.error`).
 *
 * When the namespace is not enabled, returns `noopLogger` with zero overhead.
 *
 * @param namespace - The debug namespace, e.g. `"formspec:lsp"`
 * @param connection - An object with a `console` property matching `LspConsole`
 */
export function createLogger(
  namespace: string,
  connection: { console: LspConsole },
): LoggerLike {
  const debugEnv = process.env["DEBUG"] ?? "";
  if (!isNamespaceEnabled(debugEnv, namespace)) {
    return noopLogger;
  }

  const sink = buildSink(connection.console);
  const baseLogger = pino(
    {
      level: "trace",
      base: { namespace },
    },
    sink,
  );

  return wrapLogger(baseLogger);
}
