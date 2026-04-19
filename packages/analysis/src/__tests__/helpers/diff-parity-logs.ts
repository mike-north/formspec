/**
 * Diffing helper for cross-consumer parity-harness log comparison.
 *
 * {@link diffParityLogs} normalizes entries by their `tag + placement +
 * subjectTypeKind` composite key and returns structured divergence records
 * distinguishing:
 *
 *   (a) entries present on one side only,
 *   (b) keys where the two sides produced a different number of entries,
 *   (c) entries with matching keys (and same positional index) but different
 *       `roleOutcome`, and
 *   (d) entries with matching keys, same positional index, and same outcome
 *       but different diagnostic codes (message text is intentionally excluded
 *       from parity checking because it may vary across consumers without
 *       representing semantic divergence).
 *
 * The result is deterministic: entries are sorted by lexicographic /
 * Unicode code unit order of their composite key before diffing.
 *
 * @see docs/refactors/synthetic-checker-retirement.md §8.3e, §9.1 #1
 */

import type { ParityLogEntry } from "./parity-log-entry.js";

// ---------------------------------------------------------------------------
// Composite key
// ---------------------------------------------------------------------------

/** Stable, human-readable key used to correlate entries across consumers. */
type CompositeKey = `${string}::${string}::${string}`;

function toKey(entry: ParityLogEntry): CompositeKey {
  return `${entry.tag}::${entry.placement}::${entry.subjectTypeKind}`;
}

// ---------------------------------------------------------------------------
// Divergence kinds
// ---------------------------------------------------------------------------

/** An entry present in the build consumer log but absent from the snapshot log. */
export interface MissingInSnapshot {
  readonly kind: "missing-in-snapshot";
  readonly key: CompositeKey;
  readonly buildEntry: ParityLogEntry;
}

/** An entry present in the snapshot consumer log but absent from the build log. */
export interface MissingInBuild {
  readonly kind: "missing-in-build";
  readonly key: CompositeKey;
  readonly snapshotEntry: ParityLogEntry;
}

/**
 * The same composite key produced a different number of entries on each side.
 * When counts differ the positional comparison is skipped entirely for that key.
 */
export interface ArrayLengthDivergence {
  readonly kind: "array-length-divergence";
  readonly key: CompositeKey;
  readonly buildEntries: readonly ParityLogEntry[];
  readonly snapshotEntries: readonly ParityLogEntry[];
  readonly buildCount: number;
  readonly snapshotCount: number;
}

/** Entries that share a key and positional index but produced different `roleOutcome` values. */
export interface RoleOutcomeDivergence {
  readonly kind: "role-outcome-divergence";
  readonly key: CompositeKey;
  /** Zero-based index within the per-key entry array. */
  readonly index: number;
  readonly buildEntry: ParityLogEntry;
  readonly snapshotEntry: ParityLogEntry;
  readonly buildOutcome: ParityLogEntry["roleOutcome"];
  readonly snapshotOutcome: ParityLogEntry["roleOutcome"];
}

/**
 * Entries that share a key, positional index, and outcome but emitted
 * diagnostics with different `code` values.  Message text is NOT compared —
 * codes are the stable contract; messages may vary.
 */
export interface DiagnosticCodeDivergence {
  readonly kind: "diagnostic-code-divergence";
  readonly key: CompositeKey;
  /** Zero-based index within the per-key entry array. */
  readonly index: number;
  readonly buildEntry: ParityLogEntry;
  readonly snapshotEntry: ParityLogEntry;
  readonly buildCode: string | undefined;
  readonly snapshotCode: string | undefined;
}

/** Union of all possible parity divergence records. */
export type ParityDivergence =
  | MissingInSnapshot
  | MissingInBuild
  | ArrayLengthDivergence
  | RoleOutcomeDivergence
  | DiagnosticCodeDivergence;

// ---------------------------------------------------------------------------
// diffParityLogs
// ---------------------------------------------------------------------------

/**
 * Compare build-consumer entries against snapshot-consumer entries and return
 * an ordered list of divergences.
 *
 * The algorithm:
 *  1. Build a key→entries[] map for each side, preserving all entries per key.
 *  2. Collect the union of all keys, sorted ascending (lexicographic order).
 *  3. For each key:
 *     a. If the key is absent on one side, emit a missing-in-{snapshot,build}
 *        divergence for each entry on the present side.
 *     b. If both sides have the key but different entry counts, emit a single
 *        array-length-divergence and skip positional comparison for that key.
 *     c. If counts match, compare entries positionally (build[i] vs
 *        snapshot[i]):  emit role-outcome-divergence or
 *        diagnostic-code-divergence for each mismatching pair.
 *
 * Entries that are fully equivalent (same key, same outcome, same diagnostic
 * code or both undefined) produce no output.
 *
 * @param buildEntries   - Entries collected from the build consumer.
 * @param snapshotEntries - Entries collected from the snapshot consumer.
 * @returns Deterministically ordered divergence records (sorted by key).
 */
export function diffParityLogs(
  buildEntries: readonly ParityLogEntry[],
  snapshotEntries: readonly ParityLogEntry[],
): ParityDivergence[] {
  // Index by composite key — all entries per key are preserved in order.
  const buildMap = new Map<CompositeKey, ParityLogEntry[]>();
  for (const entry of buildEntries) {
    const key = toKey(entry);
    const existing = buildMap.get(key);
    if (existing !== undefined) {
      existing.push(entry);
    } else {
      buildMap.set(key, [entry]);
    }
  }

  const snapshotMap = new Map<CompositeKey, ParityLogEntry[]>();
  for (const entry of snapshotEntries) {
    const key = toKey(entry);
    const existing = snapshotMap.get(key);
    if (existing !== undefined) {
      existing.push(entry);
    } else {
      snapshotMap.set(key, [entry]);
    }
  }

  // Union of all keys, sorted for determinism.
  const allKeys = Array.from(new Set([...buildMap.keys(), ...snapshotMap.keys()])).sort();

  const divergences: ParityDivergence[] = [];

  for (const key of allKeys) {
    const buildArr = buildMap.get(key);
    const snapshotArr = snapshotMap.get(key);

    if (buildArr === undefined && snapshotArr !== undefined) {
      // Key entirely absent from build side — one missing-in-build per entry.
      for (const snapshotEntry of snapshotArr) {
        divergences.push({ kind: "missing-in-build", key, snapshotEntry });
      }
      continue;
    }

    if (buildArr !== undefined && snapshotArr === undefined) {
      // Key entirely absent from snapshot side — one missing-in-snapshot per entry.
      for (const buildEntry of buildArr) {
        divergences.push({ kind: "missing-in-snapshot", key, buildEntry });
      }
      continue;
    }

    // TypeScript narrowing: both are defined here (keys come from one of the
    // two maps, so the only way both could be undefined is an empty key, which
    // can't happen).
    if (buildArr === undefined || snapshotArr === undefined) continue;

    // Both sides have entries for this key — check array lengths first.
    if (buildArr.length !== snapshotArr.length) {
      divergences.push({
        kind: "array-length-divergence",
        key,
        buildEntries: buildArr,
        snapshotEntries: snapshotArr,
        buildCount: buildArr.length,
        snapshotCount: snapshotArr.length,
      });
      continue;
    }

    // Same length — compare positionally.
    for (const [i, buildEntry] of buildArr.entries()) {
      // snapshotArr has the same length (verified above), so snapshotArr[i] is
      // always defined.  The type-only cast is safe here; validated by the
      // length check above.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length equality verified above
      const snapshotEntry = snapshotArr[i]!;

      if (buildEntry.roleOutcome !== snapshotEntry.roleOutcome) {
        divergences.push({
          kind: "role-outcome-divergence",
          key,
          index: i,
          buildEntry,
          snapshotEntry,
          buildOutcome: buildEntry.roleOutcome,
          snapshotOutcome: snapshotEntry.roleOutcome,
        });
        continue;
      }

      // Same outcome — check diagnostic codes (messages are not compared).
      const buildCode = buildEntry.diagnostic?.code;
      const snapshotCode = snapshotEntry.diagnostic?.code;

      if (buildCode !== snapshotCode) {
        divergences.push({
          kind: "diagnostic-code-divergence",
          key,
          index: i,
          buildEntry,
          snapshotEntry,
          buildCode,
          snapshotCode,
        });
      }
    }
  }

  return divergences;
}
