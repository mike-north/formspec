/**
 * Diffing helper for cross-consumer parity-harness log comparison.
 *
 * {@link diffParityLogs} normalizes entries by their `tag + placement +
 * subjectTypeKind` composite key and returns structured divergence records
 * distinguishing:
 *
 *   (a) entries present on one side only,
 *   (b) entries with matching keys but different `roleOutcome`, and
 *   (c) entries with matching keys and outcomes but different diagnostic
 *       codes (message text is intentionally excluded from parity checking
 *       because it may vary across consumers without representing semantic
 *       divergence).
 *
 * The result is deterministic: entries are sorted by natural string order of
 * their composite key before diffing.
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

/** Entries that share a key but produced different `roleOutcome` values. */
export interface RoleOutcomeDivergence {
  readonly kind: "role-outcome-divergence";
  readonly key: CompositeKey;
  readonly buildEntry: ParityLogEntry;
  readonly snapshotEntry: ParityLogEntry;
  readonly buildOutcome: ParityLogEntry["roleOutcome"];
  readonly snapshotOutcome: ParityLogEntry["roleOutcome"];
}

/**
 * Entries that share a key and outcome but emitted diagnostics with different
 * `code` values.  Message text is NOT compared — codes are the stable
 * contract; messages may vary.
 */
export interface DiagnosticCodeDivergence {
  readonly kind: "diagnostic-code-divergence";
  readonly key: CompositeKey;
  readonly buildEntry: ParityLogEntry;
  readonly snapshotEntry: ParityLogEntry;
  readonly buildCode: string | undefined;
  readonly snapshotCode: string | undefined;
}

/** Union of all possible parity divergence records. */
export type ParityDivergence =
  | MissingInSnapshot
  | MissingInBuild
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
 *  1. Build a key→entry map for each side (last-write-wins if duplicates exist
 *     within the same side, which is unexpected but handled gracefully).
 *  2. Collect the union of all keys, sorted ascending.
 *  3. For each key: emit a divergence when the entry is absent on one side,
 *     the `roleOutcome` differs, or the diagnostic `code` differs.
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
  // Index by composite key.  Within one slice, if multiple entries share a
  // key the last one wins — the caller is responsible for deduplication if
  // needed, but we must not throw on duplicates.
  const buildMap = new Map<CompositeKey, ParityLogEntry>();
  for (const entry of buildEntries) {
    buildMap.set(toKey(entry), entry);
  }

  const snapshotMap = new Map<CompositeKey, ParityLogEntry>();
  for (const entry of snapshotEntries) {
    snapshotMap.set(toKey(entry), entry);
  }

  // Union of all keys, sorted for determinism.
  const allKeys = Array.from(new Set([...buildMap.keys(), ...snapshotMap.keys()])).sort();

  const divergences: ParityDivergence[] = [];

  for (const key of allKeys) {
    const buildEntry = buildMap.get(key);
    const snapshotEntry = snapshotMap.get(key);

    if (buildEntry === undefined && snapshotEntry !== undefined) {
      divergences.push({ kind: "missing-in-build", key, snapshotEntry });
      continue;
    }

    if (buildEntry !== undefined && snapshotEntry === undefined) {
      divergences.push({ kind: "missing-in-snapshot", key, buildEntry });
      continue;
    }

    // TypeScript narrowing: both are defined here (union of both maps covers
    // the only case where both could be undefined — an empty key — which
    // can't happen since keys come from one of the two maps).
    if (buildEntry === undefined || snapshotEntry === undefined) continue;

    if (buildEntry.roleOutcome !== snapshotEntry.roleOutcome) {
      divergences.push({
        kind: "role-outcome-divergence",
        key,
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
        buildEntry,
        snapshotEntry,
        buildCode,
        snapshotCode,
      });
    }
  }

  return divergences;
}
