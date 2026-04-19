/**
 * Structured logging module for the FormSpec constraint-validation pipeline.
 *
 * Provides namespace scaffolding (§8.3a) and the per-tag-application log-entry
 * schema (§8.3b) for the synthetic-checker retirement refactor (Phase 0-A).
 *
 * Namespaces:
 *   formspec:analysis:constraint-validator          — root
 *   formspec:analysis:constraint-validator:build    — build-path (tsdoc-parser.ts)
 *   formspec:analysis:constraint-validator:snapshot — snapshot-path (file-snapshots.ts)
 *   formspec:analysis:constraint-validator:typed-parser — future typed-argument parser
 *   formspec:analysis:constraint-validator:synthetic — synthetic-program invocations
 *   formspec:analysis:constraint-validator:broadening — broadening bypass decisions
 *
 * Log level convention:
 *   debug — one entry per tag application (§8.3b)
 *   trace — argument-lowering detail
 *
 * @packageDocumentation
 */

import * as ts from "typescript";
import { noopLogger } from "@formspec/core";
import type { LoggerLike } from "@formspec/core";

// =============================================================================
// §8.3b — Per-tag-application structured log-entry schema
// =============================================================================

/**
 * Which pipeline consumer emitted this log entry.
 *
 * @public
 */
export type ConstraintValidatorConsumer = "build" | "snapshot";

/**
 * The outcome of a single role in the constraint-validation pipeline.
 *
 * Roles A–D mirror the architectural roles described in the refactor plan:
 *   A — placement check (is the tag allowed on this declaration kind?)
 *   B — path/target validation (is the `:path` target syntactically valid and resolvable?)
 *   C — argument type check (is the argument value type-compatible? — currently via synthetic program)
 *   D1 — direct-field custom-constraint dispatch (no synthetic involvement)
 *   D2 — path-target built-in broadening dispatch
 *   bypass — broadening registry short-circuit (tag accepted without role-C check)
 *
 * @public
 */
export type ConstraintValidatorRoleOutcome =
  | "A-pass"
  | "A-reject"
  | "B-pass"
  | "B-reject"
  | "C-pass"
  | "C-reject"
  | "D1"
  | "D2"
  | "bypass";

/**
 * Structured log entry emitted once per constraint-tag application.
 *
 * Enabling `DEBUG=formspec:analysis:constraint-validator:*` at `debug` level
 * produces one of these for every tag evaluation. Enabling `trace` level adds
 * argument-lowering detail records with the same shape but `elapsedMicros`
 * reflecting only the lowering step.
 *
 * @public
 */
export interface ConstraintTagApplicationLogEntry {
  /** Which pipeline consumer produced this entry. */
  readonly consumer: ConstraintValidatorConsumer;
  /** Normalized tag name, e.g. "minimum". */
  readonly tag: string;
  /** Declaration placement, e.g. "class-field". */
  readonly placement: string;
  /**
   * A human-readable description of the subject type kind, e.g.
   * "primitive/string", "primitive/number", "custom/Decimal", "unknown".
   */
  readonly subjectTypeKind: string;
  /** The final role outcome for this tag application. */
  readonly roleOutcome: ConstraintValidatorRoleOutcome;
  /**
   * Elapsed time in microseconds for this tag's full validation path.
   * Measured with `performance.now()` when available, otherwise `Date.now()`.
   */
  readonly elapsedMicros: number;
}

// =============================================================================
// §8.3c — Setup-diagnostic log-entry schema
// =============================================================================

/**
 * Structured log entry emitted when setup diagnostics are generated during
 * extension-registry construction or synthetic-program batch setup.
 *
 * @public
 */
export interface SetupDiagnosticLogEntry {
  /** Number of setup diagnostics emitted in this construction/setup call. */
  readonly diagnosticCount: number;
  /** Diagnostic codes present in this batch, e.g. ["UNSUPPORTED_CUSTOM_TYPE_OVERRIDE"]. */
  readonly codes: readonly string[];
}

// =============================================================================
// §8.3d — resolvePayload invocation log-entry schema
// =============================================================================

/**
 * Structured log entry emitted when `resolvePayload` is invoked on a custom
 * type registration (PR #300).
 *
 * @public
 */
export interface ResolvePayloadLogEntry {
  /** The fully-qualified extension ID (e.g., "x-stripe/monetary"). */
  readonly extensionId: string;
  /** The custom type name as registered (e.g., "Decimal"). */
  readonly customTypeName: string;
  /**
   * Whether the callback received (or accessed) `ts.Type` / `ts.TypeChecker`
   * APIs. `true` means the host program's type graph was potentially traversed,
   * which is the OOM risk the Stripe stress test (§8.4) guards against.
   *
   * @remarks
   * Phase 0 logs `true` unconditionally whenever `resolvePayload` is defined,
   * because PR #300 has not yet landed and access-proxy instrumentation is
   * out of scope. A future phase can refine this to a real access flag.
   */
  readonly tsApisTouched: boolean;
}

// =============================================================================
// Type-kind description helper (shared by build and snapshot consumers)
// =============================================================================

/**
 * Returns a human-readable type-kind string for §8.3b log entries.
 *
 * Examples: "primitive/string", "primitive/number", "object/Decimal",
 * "array", "union", "unknown".
 *
 * @public
 */
export function describeTypeKind(type: ts.Type, checker: ts.TypeChecker): string {
  if (type.flags & ts.TypeFlags.String || type.flags & ts.TypeFlags.StringLiteral) {
    return "primitive/string";
  }
  if (type.flags & ts.TypeFlags.Number || type.flags & ts.TypeFlags.NumberLiteral) {
    return "primitive/number";
  }
  if (type.flags & ts.TypeFlags.Boolean || type.flags & ts.TypeFlags.BooleanLiteral) {
    return "primitive/boolean";
  }
  if (type.flags & (ts.TypeFlags.BigInt | ts.TypeFlags.BigIntLiteral)) {
    return "primitive/bigint";
  }
  if (type.flags & ts.TypeFlags.Null) {
    return "primitive/null";
  }
  if (type.flags & ts.TypeFlags.Undefined) {
    return "primitive/undefined";
  }
  if (type.flags & ts.TypeFlags.Unknown) {
    return "unknown";
  }
  if (type.flags & ts.TypeFlags.Any) {
    return "any";
  }
  if (type.isUnion()) {
    return "union";
  }
  if (type.isIntersection()) {
    return "intersection";
  }
  if (checker.isArrayType(type)) {
    return "array";
  }
  if (type.flags & ts.TypeFlags.Object) {
    const symbol = type.getSymbol();
    if (symbol !== undefined) {
      return `object/${symbol.name}`;
    }
    return "object";
  }
  return "unknown";
}

// =============================================================================
// Logger namespace constants (§8.3a)
// =============================================================================

/**
 * Root namespace for constraint-validator structured logging.
 *
 * Activate with `DEBUG=formspec:analysis:constraint-validator:*`.
 *
 * @public
 */
export const CONSTRAINT_VALIDATOR_NS = "formspec:analysis:constraint-validator";

/** Sub-namespace for the build consumer (tsdoc-parser.ts). */
export const CONSTRAINT_VALIDATOR_BUILD_NS = `${CONSTRAINT_VALIDATOR_NS}:build`;

/** Sub-namespace for the snapshot consumer (file-snapshots.ts). */
export const CONSTRAINT_VALIDATOR_SNAPSHOT_NS = `${CONSTRAINT_VALIDATOR_NS}:snapshot`;

/** Sub-namespace for the future typed-argument parser (Phase 1). */
export const CONSTRAINT_VALIDATOR_TYPED_PARSER_NS = `${CONSTRAINT_VALIDATOR_NS}:typed-parser`;

/** Sub-namespace for synthetic-program invocations. */
export const CONSTRAINT_VALIDATOR_SYNTHETIC_NS = `${CONSTRAINT_VALIDATOR_NS}:synthetic`;

/** Sub-namespace for broadening bypass decisions. */
export const CONSTRAINT_VALIDATOR_BROADENING_NS = `${CONSTRAINT_VALIDATOR_NS}:broadening`;

// =============================================================================
// Logger instances (module-level, checked once per process)
// =============================================================================

// These are lazy-initialised on first access so module load cost stays near
// zero when logging is disabled. Each namespace is checked independently so
// callers can narrow with e.g. DEBUG=formspec:analysis:constraint-validator:build.

const _loggerCache = new Map<string, LoggerLike>();

/**
 * Returns a module-level logger for the given namespace, building it once on
 * first access.
 *
 * When `process.env.DEBUG` enables the namespace, returns a pino-based logger
 * (loaded lazily). Otherwise returns `noopLogger` at near-zero cost.
 */
function getOrCreateLogger(namespace: string): LoggerLike {
  const cached = _loggerCache.get(namespace);
  if (cached !== undefined) {
    return cached;
  }
  const logger = buildNamespaceLogger(namespace);
  _loggerCache.set(namespace, logger);
  return logger;
}

/**
 * Builds a logger for the given namespace, loading pino lazily when enabled.
 *
 * This mirrors the pattern from `packages/build/src/cli/logger.ts` (PR #298)
 * but lives in `@formspec/analysis` to serve the snapshot consumer.
 */
function buildNamespaceLogger(namespace: string): LoggerLike {
  const debugEnv = (typeof process !== "undefined" ? process.env["DEBUG"] : undefined) ?? "";
  if (debugEnv.trim().length === 0) {
    return noopLogger;
  }

  // Check if namespace is enabled using a simple glob match.
  if (!isNamespaceActive(debugEnv, namespace)) {
    return noopLogger;
  }

  // Attempt to load pino lazily. If unavailable (e.g. during unit tests that
  // don't have pino installed), fall back to noopLogger without throwing.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pinoModule = require("pino") as
      | { default: typeof import("pino") }
      | typeof import("pino");
    const pino = typeof pinoModule === "function" ? pinoModule : pinoModule.default;

    const isTTY =
      typeof process !== "undefined" && process.stderr.isTTY;

    if (isTTY) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pinoPretty = require("pino-pretty") as { default: unknown };
        const prettyTransport = (pinoPretty.default ?? pinoPretty) as (
          opts: Record<string, unknown>
        ) => NodeJS.WritableStream;
        const stream = prettyTransport({ destination: 2, colorize: true, sync: true });
        return pino({ name: namespace, level: "trace" }, stream) as unknown as LoggerLike;
      } catch {
        // pino-pretty not available — fall through to plain pino
      }
    }

    return pino(
      { name: namespace, level: "trace" },
      pino.destination({ dest: 2, sync: true })
    ) as unknown as LoggerLike;
  } catch {
    // pino not available — silent fallback
    return noopLogger;
  }
}

/**
 * Checks whether `namespace` is enabled by `pattern`, using the same
 * comma-separated glob convention as the `debug` npm package.
 *
 * Duplicates a subset of `isNamespaceEnabled` from `@formspec/core` so this
 * module does not depend on it at runtime (avoids circular-dep risk).
 */
function isNamespaceActive(pattern: string, namespace: string): boolean {
  const parts = pattern
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  for (const p of parts) {
    if (p.startsWith("-") && globMatch(p.slice(1), namespace)) {
      return false;
    }
  }
  for (const p of parts) {
    if (!p.startsWith("-") && globMatch(p, namespace)) {
      return true;
    }
  }
  return false;
}

function globMatch(glob: string, value: string): boolean {
  if (glob.length === 0) return false;
  const regexSrc = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  try {
    return new RegExp(`^${regexSrc}$`).test(value);
  } catch {
    return false;
  }
}

// =============================================================================
// Public accessor functions
// =============================================================================

/** Returns the module-level logger for the build consumer namespace. */
export function getBuildLogger(): LoggerLike {
  return getOrCreateLogger(CONSTRAINT_VALIDATOR_BUILD_NS);
}

/** Returns the module-level logger for the snapshot consumer namespace. */
export function getSnapshotLogger(): LoggerLike {
  return getOrCreateLogger(CONSTRAINT_VALIDATOR_SNAPSHOT_NS);
}

/** Returns the module-level logger for the synthetic-program namespace. */
export function getSyntheticLogger(): LoggerLike {
  return getOrCreateLogger(CONSTRAINT_VALIDATOR_SYNTHETIC_NS);
}

/** Returns the module-level logger for the broadening-bypass namespace. */
export function getBroadeningLogger(): LoggerLike {
  return getOrCreateLogger(CONSTRAINT_VALIDATOR_BROADENING_NS);
}

// =============================================================================
// High-resolution timing helpers
// =============================================================================

/**
 * Returns a microsecond timestamp using `performance.now()` when available,
 * falling back to `Date.now() * 1000`.
 */
export function nowMicros(): number {
  if (typeof performance !== "undefined") {
    return performance.now() * 1000;
  }
  return Date.now() * 1000;
}

/**
 * Computes elapsed microseconds since `startMicros`.
 */
export function elapsedMicros(startMicros: number): number {
  return nowMicros() - startMicros;
}

// =============================================================================
// Log-entry emitters
// =============================================================================

/**
 * Emits a single per-tag-application structured log entry (§8.3b).
 *
 * The logger argument is the module-level logger for the appropriate consumer
 * namespace (build or snapshot). Call at the end of each tag's validation path
 * regardless of outcome.
 */
export function logTagApplication(
  logger: LoggerLike,
  entry: ConstraintTagApplicationLogEntry
): void {
  logger.debug("constraint-tag application", entry);
}

/**
 * Emits a setup-diagnostic count record (§8.3c).
 *
 * Call whenever setup diagnostics are generated during extension-registry
 * construction or synthetic-program prelude setup.
 */
export function logSetupDiagnostics(
  logger: LoggerLike,
  entry: SetupDiagnosticLogEntry
): void {
  if (entry.diagnosticCount > 0) {
    logger.debug("setup diagnostics emitted", entry);
  }
}

/**
 * Emits a resolvePayload invocation record (§8.3d).
 *
 * Call at the point where `resolvePayload` is invoked on a custom type
 * registration. See `ResolvePayloadLogEntry.tsApisTouched` for the access-flag
 * semantics in Phase 0.
 */
export function logResolvePayload(
  logger: LoggerLike,
  entry: ResolvePayloadLogEntry
): void {
  logger.debug("resolvePayload invoked", entry);
}
