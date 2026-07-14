import type { LoggerLike } from "@formspec/core";

/**
 * A single record captured by {@link makeCapturingLogger}.
 */
export interface LogRecord {
  readonly level: "trace" | "debug" | "info" | "warn" | "error";
  readonly msg: string;
  readonly bindings: Record<string, unknown>;
}

/**
 * Builds a `LoggerLike` that records every call instead of writing anywhere,
 * so tests can assert on what was logged without depending on console output.
 */
export function makeCapturingLogger(bindings: Record<string, unknown> = {}): {
  logger: LoggerLike;
  records: LogRecord[];
} {
  const records: LogRecord[] = [];

  function build(currentBindings: Record<string, unknown>): LoggerLike {
    const push =
      (level: LogRecord["level"]) =>
      (msg: string, ..._args: unknown[]) => {
        records.push({ level, msg, bindings: { ...currentBindings } });
      };
    return {
      trace: push("trace"),
      debug: push("debug"),
      info: push("info"),
      warn: push("warn"),
      error: push("error"),
      child(childBindings) {
        return build({ ...currentBindings, ...childBindings });
      },
    };
  }

  return { logger: build(bindings), records };
}
