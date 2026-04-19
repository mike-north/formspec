/**
 * Pino-backed logger factory for the FormSpec CLI.
 *
 * Reads `process.env.DEBUG` to determine which namespaces are enabled.
 * Enabled namespaces write to `process.stderr` at level `debug`; disabled
 * namespaces return the silent `noopLogger` so there is zero overhead.
 *
 * ## Enable convention
 *
 * `DEBUG=formspec:*` — enable all formspec namespaces
 * `DEBUG=formspec:cli,formspec:build` — enable two specific namespaces
 * `DEBUG=formspec:*,-formspec:cli:noisy` — wildcard with negation
 *
 * @packageDocumentation
 */

import type { LoggerLike } from "@formspec/core";
import { isNamespaceEnabled, noopLogger } from "@formspec/core";
import pino from "pino";

/**
 * Wraps a pino `Logger` so that `.child()` is typed as returning `LoggerLike`
 * rather than pino's own `Logger`. pino's child is structurally compatible —
 * this adapter exists only to satisfy the strict return type.
 */
function wrapLogger(logger: pino.Logger): LoggerLike {
  // pino's Logger overloads use (obj, msg?, ...args) | (msg, ...args).
  // We forward as (obj={}, msg, ...args) so the overload resolution is
  // unambiguous regardless of what LoggerLike callers pass as extra args.
  return {
    trace: (msg, ...args) => { logger.trace({}, msg, ...args); },
    debug: (msg, ...args) => { logger.debug({}, msg, ...args); },
    info:  (msg, ...args) => { logger.info({}, msg, ...args); },
    warn:  (msg, ...args) => { logger.warn({}, msg, ...args); },
    error: (msg, ...args) => { logger.error({}, msg, ...args); },
    child: (bindings) => wrapLogger(logger.child(bindings)),
  };
}

/**
 * Creates a `LoggerLike` for the given namespace.
 *
 * When the namespace is enabled via `process.env.DEBUG`, returns a pino logger
 * writing to `process.stderr` (with pino-pretty when stderr is a TTY).
 * Otherwise returns `noopLogger`.
 */
export function createLogger(namespace: string): LoggerLike {
  const debugEnv = process.env["DEBUG"] ?? "";
  if (!isNamespaceEnabled(debugEnv, namespace)) {
    return noopLogger;
  }

  const isTty = process.stderr.isTTY;

  const destination: pino.DestinationStream = isTty
    ? (pino.transport({
        target: "pino-pretty",
        options: {
          destination: 2, // stderr fd
          colorize: true,
        },
      }) as pino.DestinationStream)
    : process.stderr;

  const baseLogger = pino(
    {
      level: "debug",
      base: { namespace },
    },
    destination,
  );

  return wrapLogger(baseLogger);
}
