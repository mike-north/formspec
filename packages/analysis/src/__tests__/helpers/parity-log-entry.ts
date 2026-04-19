/**
 * Type definition and runtime type-guard for a single parity-harness log entry.
 *
 * Each entry records one constraint-tag application observed by a consumer
 * (build or snapshot), along with the role outcome and optional diagnostic
 * details.  The diffing helper {@link diffParityLogs} compares slices of
 * these entries across the two consumers.
 *
 * @see docs/refactors/synthetic-checker-retirement.md §8.3b, §8.3e
 */

// ---------------------------------------------------------------------------
// Role-outcome literals
// ---------------------------------------------------------------------------

/** All possible values for the `roleOutcome` field of a {@link ParityLogEntry}. */
export type RoleOutcome =
  | "A-pass"
  | "A-reject"
  | "B-pass"
  | "B-reject"
  | "C-pass"
  | "C-reject"
  | "D1"
  | "D2"
  | "bypass";

// ---------------------------------------------------------------------------
// Main entry type
// ---------------------------------------------------------------------------

/**
 * One structured log entry emitted per constraint-tag application.
 *
 * Fields mirror the §8.3b specification:
 *   - `consumer` — which pipeline produced this entry
 *   - `tag` — the TSDoc tag name (without `@`), e.g. `"minimum"`
 *   - `placement` — the placement kind string, e.g. `"class-field"`
 *   - `subjectTypeKind` — the TypeScript type kind of the subject, e.g. `"number"`
 *   - `roleOutcome` — which role accepted/rejected the application
 *   - `elapsedMicros` — elapsed time in microseconds for this application
 *   - `diagnostic` — present when a rejection diagnostic was emitted
 */
export interface ParityLogEntry {
  readonly consumer: "build" | "snapshot";
  readonly tag: string;
  readonly placement: string;
  readonly subjectTypeKind: string;
  readonly roleOutcome: RoleOutcome;
  readonly elapsedMicros: number;
  readonly diagnostic?: {
    readonly code: string;
    readonly message: string;
  };
}

// ---------------------------------------------------------------------------
// Runtime type-guard
// ---------------------------------------------------------------------------

/** Returns true when `value` is a plain string-keyed object with no prototype extras. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.getOwnPropertySymbols(value).length === 0
  );
}

const ROLE_OUTCOMES: ReadonlySet<string> = new Set<RoleOutcome>([
  "A-pass",
  "A-reject",
  "B-pass",
  "B-reject",
  "C-pass",
  "C-reject",
  "D1",
  "D2",
  "bypass",
]);

/**
 * Type-guard: returns true when `value` is a well-formed {@link ParityLogEntry}.
 *
 * Validates all required fields and the optional `diagnostic` sub-object.
 */
export function isParityLogEntry(value: unknown): value is ParityLogEntry {
  if (!isPlainObject(value)) return false;

  const { consumer, tag, placement, subjectTypeKind, roleOutcome, elapsedMicros, diagnostic } =
    value;

  if (consumer !== "build" && consumer !== "snapshot") return false;
  if (typeof tag !== "string") return false;
  if (typeof placement !== "string") return false;
  if (typeof subjectTypeKind !== "string") return false;
  if (typeof roleOutcome !== "string" || !ROLE_OUTCOMES.has(roleOutcome)) return false;
  if (typeof elapsedMicros !== "number") return false;

  if (diagnostic !== undefined) {
    if (!isPlainObject(diagnostic)) return false;
    if (typeof diagnostic["code"] !== "string") return false;
    if (typeof diagnostic["message"] !== "string") return false;
  }

  return true;
}
