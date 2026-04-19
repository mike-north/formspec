/**
 * Adapter that bridges `ts.server.Logger` to the `LoggerLike` contract used
 * across FormSpec. All log output flows through tsserver's own log file rather
 * than stdout/stderr, which is the correct place for plugin diagnostics.
 *
 * @packageDocumentation
 */
import * as ts from "typescript";
import type * as tsServer from "typescript/lib/tsserverlibrary.js";
import {
  isNamespaceEnabled as isNamespaceEnabledCore,
  type LoggerLike,
  noopLogger,
} from "@formspec/core";

/**
 * Checks whether a namespace is enabled by the `DEBUG` environment variable.
 *
 * Thin wrapper around `@formspec/core`'s matcher that reads `process.env.DEBUG`
 * for the ts-plugin's gating. Comma-separated patterns, `*` wildcard, and `-`
 * negation are supported; negations always win regardless of order.
 *
 * @internal
 */
export function isNamespaceEnabled(namespace: string): boolean {
  return isNamespaceEnabledCore(process.env["DEBUG"] ?? "", namespace);
}

function formatBindings(bindings: Record<string, unknown>): string {
  return Object.entries(bindings)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
}

function buildPrefix(namespace: string, bindings: Record<string, unknown>): string {
  const hasBindings = Object.keys(bindings).length > 0;
  if (namespace.length === 0 && !hasBindings) {
    return "";
  }
  const bindingStr = hasBindings ? ` ${formatBindings(bindings)}` : "";
  return `[${namespace}${bindingStr}] `;
}

function makeAdapter(
  tsLogger: tsServer.server.Logger,
  namespace: string,
  bindings: Record<string, unknown>
): LoggerLike {
  const prefix = buildPrefix(namespace, bindings);

  function isEnabled(): boolean {
    if (!tsLogger.loggingEnabled()) {
      return false;
    }
    return true;
  }

  // ts.server.Msg has Info and Err string enum members. TS has no native
  // trace/debug/warn variants.
  // Mapping: trace→Info, debug→Info, info→Info, warn→Info (prefixed [WARN]),
  // error→Err.
  return {
    trace(msg: string): void {
      if (!isEnabled()) return;
      tsLogger.msg(`${prefix}${msg}`, ts.server.Msg.Info);
    },
    debug(msg: string): void {
      if (!isEnabled()) return;
      tsLogger.msg(`${prefix}${msg}`, ts.server.Msg.Info);
    },
    info(msg: string): void {
      if (!isEnabled()) return;
      tsLogger.msg(`${prefix}${msg}`, ts.server.Msg.Info);
    },
    warn(msg: string): void {
      if (!isEnabled()) return;
      tsLogger.msg(`${prefix}[WARN] ${msg}`, ts.server.Msg.Info);
    },
    error(msg: string): void {
      if (!isEnabled()) return;
      tsLogger.msg(`${prefix}${msg}`, ts.server.Msg.Err);
    },
    child(childBindings: Record<string, unknown>): LoggerLike {
      return makeAdapter(tsLogger, namespace, { ...bindings, ...childBindings });
    },
  };
}

/**
 * Options for {@link fromTsLogger}.
 *
 * @public
 */
export interface FromTsLoggerOptions {
  /**
   * Namespace prefix added to every log line in the form `[namespace]`.
   * If omitted, no prefix is added.
   */
  readonly namespace?: string;
}

/**
 * Wraps a `ts.server.Logger` in the FormSpec `LoggerLike` interface.
 *
 * When the `DEBUG` environment variable is set and the given namespace is
 * matched, log calls are forwarded through tsserver's log file. Otherwise a
 * no-op logger is returned so that unrelated namespaces stay silent.
 *
 * Level mapping (tsserver has only Info and Err):
 * - `trace` → `ts.server.Msg.Info`
 * - `debug` → `ts.server.Msg.Info`
 * - `info`  → `ts.server.Msg.Info`
 * - `warn`  → `ts.server.Msg.Info` (message prefixed with `[WARN]`)
 * - `error` → `ts.server.Msg.Err`
 *
 * @public
 */
export function fromTsLogger(
  tsLogger: tsServer.server.Logger,
  options?: FromTsLoggerOptions
): LoggerLike {
  const namespace = options?.namespace ?? "";

  // When a namespace is provided, gate on the DEBUG env var.
  if (namespace.length > 0 && !isNamespaceEnabled(namespace)) {
    return noopLogger;
  }

  return makeAdapter(tsLogger, namespace, {});
}
