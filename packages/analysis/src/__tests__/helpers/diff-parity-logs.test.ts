/**
 * Unit tests for the parity-harness log diffing helper.
 *
 * @see docs/refactors/synthetic-checker-retirement.md §8.3e, §9.1 #1
 */

import { describe, expect, it } from "vitest";
import { diffParityLogs } from "./diff-parity-logs.js";
import { isParityLogEntry } from "./parity-log-entry.js";
import type { ParityLogEntry } from "./parity-log-entry.js";

// ---------------------------------------------------------------------------
// Test-data factories
// ---------------------------------------------------------------------------

function makeEntry(
  overrides: Partial<ParityLogEntry> & {
    consumer: "build" | "snapshot";
    tag: string;
    placement: string;
    subjectTypeKind: string;
    roleOutcome: ParityLogEntry["roleOutcome"];
  },
): ParityLogEntry {
  return {
    elapsedMicros: 10,
    ...overrides,
  };
}

function buildEntry(
  tag: string,
  placement: string,
  subjectTypeKind: string,
  roleOutcome: ParityLogEntry["roleOutcome"],
  extra?: Partial<ParityLogEntry>,
): ParityLogEntry {
  return makeEntry({ consumer: "build", tag, placement, subjectTypeKind, roleOutcome, ...extra });
}

function snapshotEntry(
  tag: string,
  placement: string,
  subjectTypeKind: string,
  roleOutcome: ParityLogEntry["roleOutcome"],
  extra?: Partial<ParityLogEntry>,
): ParityLogEntry {
  return makeEntry({
    consumer: "snapshot",
    tag,
    placement,
    subjectTypeKind,
    roleOutcome,
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// isParityLogEntry — runtime type-guard
// ---------------------------------------------------------------------------

describe("isParityLogEntry", () => {
  it("accepts a fully valid build entry", () => {
    expect(
      isParityLogEntry({
        consumer: "build",
        tag: "minimum",
        placement: "class-field",
        subjectTypeKind: "number",
        roleOutcome: "C-pass",
        elapsedMicros: 42,
      }),
    ).toBe(true);
  });

  it("accepts a valid entry with an optional diagnostic", () => {
    expect(
      isParityLogEntry({
        consumer: "snapshot",
        tag: "pattern",
        placement: "class-field",
        subjectTypeKind: "string",
        roleOutcome: "A-reject",
        elapsedMicros: 5,
        diagnostic: { code: "INVALID_TAG_PLACEMENT", message: "tag not valid here" },
      }),
    ).toBe(true);
  });

  it("accepts every valid roleOutcome value", () => {
    const outcomes: ParityLogEntry["roleOutcome"][] = [
      "A-pass",
      "A-reject",
      "B-pass",
      "B-reject",
      "C-pass",
      "C-reject",
      "D1",
      "D2",
      "bypass",
    ];

    for (const roleOutcome of outcomes) {
      expect(
        isParityLogEntry({
          consumer: "build",
          tag: "minimum",
          placement: "class-field",
          subjectTypeKind: "number",
          roleOutcome,
          elapsedMicros: 1,
        }),
        `expected isParityLogEntry to return true for roleOutcome="${roleOutcome}"`,
      ).toBe(true);
    }
  });

  it("accepts elapsedMicros of 0 (boundary)", () => {
    expect(
      isParityLogEntry({
        consumer: "build",
        tag: "minimum",
        placement: "class-field",
        subjectTypeKind: "number",
        roleOutcome: "C-pass",
        elapsedMicros: 0,
      }),
    ).toBe(true);
  });

  it("accepts a positive finite elapsedMicros", () => {
    expect(
      isParityLogEntry({
        consumer: "build",
        tag: "minimum",
        placement: "class-field",
        subjectTypeKind: "number",
        roleOutcome: "C-pass",
        elapsedMicros: 12345.67,
      }),
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(isParityLogEntry(null)).toBe(false);
  });

  it("rejects a primitive", () => {
    expect(isParityLogEntry("not-an-object")).toBe(false);
    expect(isParityLogEntry(42)).toBe(false);
  });

  it("rejects an array", () => {
    expect(isParityLogEntry([])).toBe(false);
  });

  it("rejects an invalid consumer value", () => {
    expect(
      isParityLogEntry({
        consumer: "unknown",
        tag: "minimum",
        placement: "class-field",
        subjectTypeKind: "number",
        roleOutcome: "C-pass",
        elapsedMicros: 1,
      }),
    ).toBe(false);
  });

  it("rejects an invalid roleOutcome value", () => {
    expect(
      isParityLogEntry({
        consumer: "build",
        tag: "minimum",
        placement: "class-field",
        subjectTypeKind: "number",
        roleOutcome: "E-pass",
        elapsedMicros: 1,
      }),
    ).toBe(false);
  });

  it("rejects when elapsedMicros is missing", () => {
    expect(
      isParityLogEntry({
        consumer: "build",
        tag: "minimum",
        placement: "class-field",
        subjectTypeKind: "number",
        roleOutcome: "C-pass",
      }),
    ).toBe(false);
  });

  it("rejects elapsedMicros of NaN", () => {
    expect(
      isParityLogEntry({
        consumer: "build",
        tag: "minimum",
        placement: "class-field",
        subjectTypeKind: "number",
        roleOutcome: "C-pass",
        elapsedMicros: NaN,
      }),
    ).toBe(false);
  });

  it("rejects elapsedMicros of Infinity", () => {
    expect(
      isParityLogEntry({
        consumer: "build",
        tag: "minimum",
        placement: "class-field",
        subjectTypeKind: "number",
        roleOutcome: "C-pass",
        elapsedMicros: Infinity,
      }),
    ).toBe(false);
  });

  it("rejects negative elapsedMicros", () => {
    expect(
      isParityLogEntry({
        consumer: "build",
        tag: "minimum",
        placement: "class-field",
        subjectTypeKind: "number",
        roleOutcome: "C-pass",
        elapsedMicros: -1,
      }),
    ).toBe(false);
  });

  it("rejects when diagnostic is present but malformed (missing code)", () => {
    expect(
      isParityLogEntry({
        consumer: "build",
        tag: "minimum",
        placement: "class-field",
        subjectTypeKind: "number",
        roleOutcome: "C-pass",
        elapsedMicros: 1,
        diagnostic: { message: "missing code field" },
      }),
    ).toBe(false);
  });

  it("rejects when diagnostic is an array instead of an object", () => {
    expect(
      isParityLogEntry({
        consumer: "build",
        tag: "minimum",
        placement: "class-field",
        subjectTypeKind: "number",
        roleOutcome: "C-pass",
        elapsedMicros: 1,
        diagnostic: [],
      }),
    ).toBe(false);
  });

  it("rejects a class instance (not a plain object)", () => {
    class Fake {
      consumer = "build";
      tag = "minimum";
      placement = "class-field";
      subjectTypeKind = "number";
      roleOutcome = "C-pass";
      elapsedMicros = 1;
    }
    expect(isParityLogEntry(new Fake())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// diffParityLogs
// ---------------------------------------------------------------------------

describe("diffParityLogs", () => {
  describe("empty inputs", () => {
    it("returns no divergences when both sides are empty", () => {
      expect(diffParityLogs([], [])).toEqual([]);
    });

    it("returns missing-in-snapshot divergences when build side is non-empty and snapshot is empty", () => {
      const entries = [buildEntry("minimum", "class-field", "number", "C-pass")];
      const result = diffParityLogs(entries, []);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: "missing-in-snapshot",
        key: "minimum::class-field::number",
      });
    });

    it("returns missing-in-build divergences when snapshot side is non-empty and build is empty", () => {
      const entries = [snapshotEntry("minimum", "class-field", "number", "C-pass")];
      const result = diffParityLogs([], entries);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: "missing-in-build",
        key: "minimum::class-field::number",
      });
    });
  });

  describe("happy-path equality", () => {
    it("returns no divergences when build and snapshot entries match exactly", () => {
      const b = [
        buildEntry("minimum", "class-field", "number", "C-pass"),
        buildEntry("maxLength", "class-field", "string", "A-pass"),
      ];
      const s = [
        snapshotEntry("minimum", "class-field", "number", "C-pass"),
        snapshotEntry("maxLength", "class-field", "string", "A-pass"),
      ];

      expect(diffParityLogs(b, s)).toEqual([]);
    });

    it("ignores differences in elapsedMicros when outcomes and codes match", () => {
      const b = [buildEntry("minimum", "class-field", "number", "C-pass")];
      const s = [
        snapshotEntry("minimum", "class-field", "number", "C-pass", { elapsedMicros: 9999 }),
      ];

      expect(diffParityLogs(b, s)).toEqual([]);
    });

    it("ignores differences in diagnostic message text when codes match", () => {
      const b = [
        buildEntry("minimum", "class-field", "number", "C-reject", {
          diagnostic: { code: "TYPE_MISMATCH", message: "build message" },
        }),
      ];
      const s = [
        snapshotEntry("minimum", "class-field", "number", "C-reject", {
          diagnostic: { code: "TYPE_MISMATCH", message: "snapshot message differs" },
        }),
      ];

      // Messages differ but codes match — no divergence expected
      expect(diffParityLogs(b, s)).toEqual([]);
    });
  });

  describe("one-sided missing entries", () => {
    it("emits missing-in-snapshot for an entry present only in build", () => {
      const b = [buildEntry("pattern", "class-field", "string", "C-pass")];
      const result = diffParityLogs(b, []);

      expect(result).toHaveLength(1);
      const div = result[0];
      expect(div.kind).toBe("missing-in-snapshot");
      if (div.kind === "missing-in-snapshot") {
        expect(div.key).toBe("pattern::class-field::string");
        expect(div.buildEntry).toBe(b[0]);
      }
    });

    it("emits missing-in-build for an entry present only in snapshot", () => {
      const s = [snapshotEntry("pattern", "class-field", "string", "C-pass")];
      const result = diffParityLogs([], s);

      expect(result).toHaveLength(1);
      const div = result[0];
      expect(div.kind).toBe("missing-in-build");
      if (div.kind === "missing-in-build") {
        expect(div.key).toBe("pattern::class-field::string");
        expect(div.snapshotEntry).toBe(s[0]);
      }
    });

    it("handles multiple one-sided misses and returns them sorted by key", () => {
      const b = [
        buildEntry("zzz", "class-field", "string", "C-pass"),
        buildEntry("aaa", "class-field", "number", "C-pass"),
      ];
      const result = diffParityLogs(b, []);

      expect(result).toHaveLength(2);
      // Sorted ascending by key: aaa < zzz
      expect(result[0]).toMatchObject({ kind: "missing-in-snapshot", key: "aaa::class-field::number" });
      expect(result[1]).toMatchObject({ kind: "missing-in-snapshot", key: "zzz::class-field::string" });
    });
  });

  describe("role-outcome divergence", () => {
    it("emits role-outcome-divergence when build and snapshot have different roleOutcome for the same key", () => {
      const b = [buildEntry("minimum", "class-field", "number", "C-pass")];
      const s = [snapshotEntry("minimum", "class-field", "number", "C-reject")];

      const result = diffParityLogs(b, s);

      expect(result).toHaveLength(1);
      const div = result[0];
      expect(div.kind).toBe("role-outcome-divergence");
      if (div.kind === "role-outcome-divergence") {
        expect(div.index).toBe(0);
        expect(div.buildOutcome).toBe("C-pass");
        expect(div.snapshotOutcome).toBe("C-reject");
        expect(div.buildEntry).toBe(b[0]);
        expect(div.snapshotEntry).toBe(s[0]);
      }
    });
  });

  describe("diagnostic-code divergence", () => {
    it("emits diagnostic-code-divergence when outcomes match but diagnostic codes differ", () => {
      const b = [
        buildEntry("minimum", "class-field", "number", "C-reject", {
          diagnostic: { code: "TYPE_MISMATCH", message: "..." },
        }),
      ];
      const s = [
        snapshotEntry("minimum", "class-field", "number", "C-reject", {
          diagnostic: { code: "INVALID_TAG_ARGUMENT", message: "..." },
        }),
      ];

      const result = diffParityLogs(b, s);

      expect(result).toHaveLength(1);
      const div = result[0];
      expect(div.kind).toBe("diagnostic-code-divergence");
      if (div.kind === "diagnostic-code-divergence") {
        expect(div.index).toBe(0);
        expect(div.buildCode).toBe("TYPE_MISMATCH");
        expect(div.snapshotCode).toBe("INVALID_TAG_ARGUMENT");
      }
    });

    it("emits diagnostic-code-divergence when one side has a diagnostic and the other does not", () => {
      const b = [
        buildEntry("minimum", "class-field", "number", "C-reject", {
          diagnostic: { code: "TYPE_MISMATCH", message: "type mismatch" },
        }),
      ];
      const s = [snapshotEntry("minimum", "class-field", "number", "C-reject")];

      const result = diffParityLogs(b, s);

      expect(result).toHaveLength(1);
      const div = result[0];
      expect(div.kind).toBe("diagnostic-code-divergence");
      if (div.kind === "diagnostic-code-divergence") {
        expect(div.index).toBe(0);
        expect(div.buildCode).toBe("TYPE_MISMATCH");
        expect(div.snapshotCode).toBeUndefined();
      }
    });
  });

  describe("determinism and ordering", () => {
    it("returns results sorted ascending by composite key regardless of input order", () => {
      const b = [
        buildEntry("zzz-tag", "class-field", "string", "C-pass"),
        buildEntry("aaa-tag", "class-field", "number", "C-pass"),
        buildEntry("mmm-tag", "class-field", "boolean", "C-pass"),
      ];

      const result = diffParityLogs(b, []);

      expect(result.map((d) => d.kind === "missing-in-snapshot" ? d.key : "")).toEqual([
        "aaa-tag::class-field::number",
        "mmm-tag::class-field::boolean",
        "zzz-tag::class-field::string",
      ]);
    });

    it("produces the same result when called twice with the same inputs", () => {
      const b = [
        buildEntry("minimum", "class-field", "number", "C-reject", {
          diagnostic: { code: "TYPE_MISMATCH", message: "..." },
        }),
        buildEntry("maxLength", "class-field", "string", "C-pass"),
      ];
      const s = [
        snapshotEntry("minimum", "class-field", "number", "C-pass"),
        snapshotEntry("maxLength", "class-field", "string", "C-pass"),
      ];

      expect(diffParityLogs(b, s)).toEqual(diffParityLogs(b, s));
    });
  });

  // -------------------------------------------------------------------------
  // Duplicate-key handling
  // -------------------------------------------------------------------------

  describe("duplicate-key entries (multiple fixtures / fields sharing a tag+placement+type)", () => {
    it("produces no divergences when both sides have the same count and matching entries for a duplicate key", () => {
      // Two fixtures both produce a "minimum::class-field::number" entry; both pass.
      const b = [
        buildEntry("minimum", "class-field", "number", "C-pass"),
        buildEntry("minimum", "class-field", "number", "C-pass"),
      ];
      const s = [
        snapshotEntry("minimum", "class-field", "number", "C-pass"),
        snapshotEntry("minimum", "class-field", "number", "C-pass"),
      ];

      expect(diffParityLogs(b, s)).toEqual([]);
    });

    it("emits array-length-divergence when build has more entries for a key than snapshot", () => {
      // Build produced 2 entries for the key; snapshot only produced 1.
      const b = [
        buildEntry("minimum", "class-field", "number", "C-pass"),
        buildEntry("minimum", "class-field", "number", "C-pass"),
      ];
      const s = [snapshotEntry("minimum", "class-field", "number", "C-pass")];

      const result = diffParityLogs(b, s);

      expect(result).toHaveLength(1);
      const div = result[0];
      expect(div.kind).toBe("array-length-divergence");
      if (div.kind === "array-length-divergence") {
        expect(div.key).toBe("minimum::class-field::number");
        expect(div.buildCount).toBe(2);
        expect(div.snapshotCount).toBe(1);
        expect(div.buildEntries).toHaveLength(2);
        expect(div.snapshotEntries).toHaveLength(1);
      }
    });

    it("emits array-length-divergence when snapshot has more entries for a key than build", () => {
      const b = [buildEntry("minimum", "class-field", "number", "C-pass")];
      const s = [
        snapshotEntry("minimum", "class-field", "number", "C-pass"),
        snapshotEntry("minimum", "class-field", "number", "C-pass"),
      ];

      const result = diffParityLogs(b, s);

      expect(result).toHaveLength(1);
      const div = result[0];
      expect(div.kind).toBe("array-length-divergence");
      if (div.kind === "array-length-divergence") {
        expect(div.buildCount).toBe(1);
        expect(div.snapshotCount).toBe(2);
      }
    });

    it("skips positional comparison entirely when array lengths differ for a key", () => {
      // The first entries would match perfectly, but the length divergence should
      // prevent any role-outcome or diagnostic-code divergence from being emitted.
      const b = [
        buildEntry("minimum", "class-field", "number", "C-pass"),
        buildEntry("minimum", "class-field", "number", "C-reject", {
          diagnostic: { code: "TYPE_MISMATCH", message: "..." },
        }),
      ];
      const s = [
        // Only one snapshot entry — lengths differ.
        snapshotEntry("minimum", "class-field", "number", "C-pass"),
      ];

      const result = diffParityLogs(b, s);

      // Exactly one divergence: the array-length-divergence; no positional divergences.
      expect(result).toHaveLength(1);
      const onlyDiv = result[0];
      expect(onlyDiv?.kind).toBe("array-length-divergence");
    });

    it("emits role-outcome-divergence at the correct index when the mismatch is at position 1", () => {
      // Position 0 matches; position 1 diverges.
      const b = [
        buildEntry("minimum", "class-field", "number", "C-pass"),
        buildEntry("minimum", "class-field", "number", "C-pass"),
      ];
      const s = [
        snapshotEntry("minimum", "class-field", "number", "C-pass"),
        snapshotEntry("minimum", "class-field", "number", "C-reject"), // mismatch at index 1
      ];

      const result = diffParityLogs(b, s);

      expect(result).toHaveLength(1);
      const div = result[0];
      expect(div.kind).toBe("role-outcome-divergence");
      if (div.kind === "role-outcome-divergence") {
        expect(div.index).toBe(1);
        expect(div.buildOutcome).toBe("C-pass");
        expect(div.snapshotOutcome).toBe("C-reject");
      }
    });

    it("emits missing-in-snapshot for each entry when the key is entirely absent from snapshot (multiple entries)", () => {
      // Key appears twice on the build side but not at all on the snapshot side.
      const b = [
        buildEntry("minimum", "class-field", "number", "C-pass"),
        buildEntry("minimum", "class-field", "number", "C-pass"),
      ];

      const result = diffParityLogs(b, []);

      expect(result).toHaveLength(2);
      for (const div of result) {
        expect(div.kind).toBe("missing-in-snapshot");
        if (div.kind === "missing-in-snapshot") {
          expect(div.key).toBe("minimum::class-field::number");
        }
      }
    });

    it("emits missing-in-build for each entry when the key is entirely absent from build (multiple entries)", () => {
      const s = [
        snapshotEntry("minimum", "class-field", "number", "C-pass"),
        snapshotEntry("minimum", "class-field", "number", "C-pass"),
      ];

      const result = diffParityLogs([], s);

      expect(result).toHaveLength(2);
      for (const div of result) {
        expect(div.kind).toBe("missing-in-build");
        if (div.kind === "missing-in-build") {
          expect(div.key).toBe("minimum::class-field::number");
        }
      }
    });
  });
});
