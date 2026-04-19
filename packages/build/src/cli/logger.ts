/**
 * Pino-based logger factory for the @formspec/build CLI.
 *
 * Reads `process.env.DEBUG` to determine which namespaces are enabled using
 * the shared matcher in `@formspec/core` — same semantics as the `debug` npm
 * package (comma-separated patterns, `*` wildcard, `-` prefix for negation,
 * negations always win).
 */

import { isNamespaceEnabled, noopLogger } from "@formspec/core";
import type { LoggerLike } from "@formspec/core";

/**
 * Creates a logger for the given namespace.
 *
 * When the namespace is enabled by `DEBUG`, writes structured JSON to stderr
 * (with pino-pretty formatting when stderr is a TTY). Otherwise returns the
 * silent `noopLogger` from `@formspec/core`.
 *
 * pino and pino-pretty are loaded lazily via `require()` so that the CLI
 * pays no load-time cost when logging is disabled, and so the dependencies
 * can be declared as `optionalDependencies` of `@formspec/build`.
 */
export function createLogger(namespace: string): LoggerLike {
  const debugEnv = process.env["DEBUG"] ?? "";
  if (!isNamespaceEnabled(debugEnv, namespace)) {
    return noopLogger;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pinoModule = require("pino") as { default: typeof import("pino") } | typeof import("pino");
  const pino = typeof pinoModule === "function" ? pinoModule : pinoModule.default;

  const isTTY = process.stderr.isTTY;

  if (isTTY) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pinoPretty = require("pino-pretty") as { default: unknown };
    const prettyTransport = (pinoPretty.default ?? pinoPretty) as (
      opts: Record<string, unknown>,
    ) => NodeJS.WritableStream;
    const stream = prettyTransport({ destination: 2, colorize: true, sync: true });
    return pino({ name: namespace, level: "debug" }, stream) as unknown as LoggerLike;
  }

  return pino(
    { name: namespace, level: "debug" },
    pino.destination({ dest: 2, sync: true }),
  ) as unknown as LoggerLike;
}
