/**
 * Minimal structured-logger contract used across FormSpec.
 *
 * Libraries accept a `LoggerLike` so callers can route diagnostics through
 * their own logger (e.g. pino in apps, the tsserver logger inside a TypeScript
 * language service plugin) without pulling a specific logger implementation
 * into published packages.
 *
 * The shape is a subset of pino's `Logger` and is trivially satisfiable by
 * most structured loggers.
 *
 * @public
 */
export interface LoggerLike {
  /** Writes a record at the finest-grained verbosity. */
  trace(msg: string, ...args: unknown[]): void;
  /** Writes a diagnostic record used when investigating behaviour. */
  debug(msg: string, ...args: unknown[]): void;
  /** Writes an informational record about normal operation. */
  info(msg: string, ...args: unknown[]): void;
  /** Writes a record about a recoverable or unexpected condition. */
  warn(msg: string, ...args: unknown[]): void;
  /** Writes a record about a failure that prevented the requested work. */
  error(msg: string, ...args: unknown[]): void;
  /**
   * Returns a child logger that tags every subsequent record with the given
   * bindings (e.g. `{ stage: "ir" }`).
   */
  child(bindings: Record<string, unknown>): LoggerLike;
}

/**
 * Silent logger used as the default when no logger is injected. All methods
 * are no-ops and `child` returns the same instance.
 *
 * @public
 */
function noop(): void {
  // Intentionally empty — noopLogger discards all records.
}

/**
 * A silent logger used as the default when no logger is injected.
 *
 * @remarks
 * All methods are no-ops, but **arguments are still evaluated** by the caller
 * before being passed in. Gate expensive argument construction yourself
 * (e.g. `if (log !== noopLogger) log.debug(expensiveFormat(x))`) when the
 * work would be significant.
 *
 * @public
 */
export const noopLogger: LoggerLike = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  child: () => noopLogger,
};

/**
 * Tests whether a namespace should be enabled given a `DEBUG` pattern string.
 *
 * @remarks
 * Supports the same convention as the `debug` npm package:
 *
 * - Comma-separated list of patterns (whitespace around each pattern is
 *   ignored).
 * - `*` matches any sequence of characters (glob-style, not regex). All
 *   other characters match literally.
 * - A pattern prefixed with `-` is a **negation**. Any matching negation
 *   disables the namespace regardless of ordering — negations always win
 *   over positives.
 *
 * Empty or whitespace-only `pattern` returns `false`.
 *
 * @example
 * isNamespaceEnabled("formspec:*", "formspec:cli"); // true
 * isNamespaceEnabled("formspec:*,-formspec:cli", "formspec:cli"); // false
 * isNamespaceEnabled("-formspec:cli,formspec:*", "formspec:cli"); // false
 * isNamespaceEnabled("", "formspec:cli"); // false
 *
 * @public
 */
export function isNamespaceEnabled(pattern: string, namespace: string): boolean {
  if (pattern.trim().length === 0) {
    return false;
  }

  const patterns = pattern
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Negations always win regardless of order.
  for (const p of patterns) {
    if (p.startsWith("-") && matchesGlob(p.slice(1), namespace)) {
      return false;
    }
  }

  for (const p of patterns) {
    if (!p.startsWith("-") && matchesGlob(p, namespace)) {
      return true;
    }
  }

  return false;
}

function matchesGlob(glob: string, namespace: string): boolean {
  if (glob.length === 0) {
    return false;
  }
  const regexSource = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  try {
    return new RegExp(`^${regexSource}$`).test(namespace);
  } catch {
    return false;
  }
}
