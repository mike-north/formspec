// Silent-acceptance canary tests (Phase 0.5j, refactor plan S.9.3 #14).
//
// These are negative-only tests whose sole purpose is to catch a regression in
// which the typed parser silently accepts invalid tag arguments instead of
// emitting a diagnostic. Each test exercises one invalid usage of a constraint
// tag and asserts that a diagnostic IS produced with the expected code.
//
// Phase 3 update (2026-04-20):
// The snapshot consumer now routes builtin constraint tags through
// parseTagArgument before the synthetic batch (Role C validation wired in
// packages/analysis/src/file-snapshots.ts, §4 Phase 3). This shifts several
// diagnostic codes:
//
//   - Missing required arguments: INVALID_TAG_ARGUMENT → MISSING_TAG_ARGUMENT
//     (typed parser distinguishes missing vs. wrong-type at Role C)
//   - Wrong-type arguments on numeric tags: TYPE_MISMATCH → INVALID_TAG_ARGUMENT
//     (typed parser catches "hello" / true before the synthetic checker does)
//   - @uniqueItems false/yes/maybe: TYPE_MISMATCH → INVALID_TAG_ARGUMENT
//     (typed parser rejects non-empty non-"true" arguments for the marker family)
//
// Phase 4 Slice D audit (2026-04-21):
// No additional canaries flipped in Phase 4 A/B/C. Investigation shows that
// the 13 remaining .fails cases fall into two structural categories that
// require Phase 5 work to resolve:
//
// Category 1 — Role B (capability check) still goes through synthetic path:
//   The snapshot consumer (buildFormSpecAnalysisFileSnapshot) does NOT have a
//   host-checker Role-B capability guard. The build consumer (tsdoc-parser.ts)
//   DOES have supportsConstraintCapability() check at ~line 872 and produces
//   TYPE_MISMATCH for these cases. The synthetic prelude's direct-field
//   tag_minimum / tag_pattern / tag_uniqueItems / tag_enumOptions functions
//   are declared as `<Host, Subject>` with NO capability constraint on Subject
//   for the direct-field overload — so the synthetic TypeScript checker does
//   not reject @minimum 0 on a string field.
//   Target: Phase 5 adds host-checker Role B to the snapshot consumer, or
//   Phase 5 retirement of the synthetic checker forces these onto the build
//   path's supportsConstraintCapability() guard.
//
// Category 2 — IR-level TYPE_MISMATCH in semantic-targets.ts:
//   @const mismatches are caught at IR validation (validateIR / semantic-targets.ts)
//   in the build path, but the snapshot consumer does not run IR validation.
//   Both the build AND snapshot synthetic checkers accept @const "USD" for any
//   field type because the synthetic prelude declares JsonValue = unknown (any
//   JSON value is assignable). The IR validator catches the mismatch, but the
//   snapshot consumer doesn't surface it. Phase 5 (synthetic retirement) or a
//   separate IR-validation pass for the snapshot consumer is needed.
//
// Phase 3 flips (previously .fails, now passing regular assertions):
// - @enumOptions 5 (scalar not array) — typed parser catches at Role C
// - @enumOptions {} (object not array) — typed parser catches at Role C
//
// @see docs/refactors/synthetic-checker-retirement.md S.9.3 #14
// @see docs/refactors/synthetic-checker-retirement.md §4 (Phase 3 scope)
// @see packages/build/src/analyzer/tsdoc-parser.ts supportsConstraintCapability (Role B — build path only)
import { describe, expect, it } from "vitest";
import { buildFormSpecAnalysisFileSnapshot } from "../internal.js";
import { createProgram } from "./helpers.js";

// Build a snapshot and return its diagnostics.
// The source must use multi-line format -- inline single-line comments are
// not currently picked up by the analysis pipeline.
function diagnosticsFor(source: string, label: string) {
  const { checker, sourceFile } = createProgram(source, `/virtual/canary-${label}.ts`);
  const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
  return snapshot.diagnostics;
}

// ---------------------------------------------------------------------------
// @minimum canaries
// ---------------------------------------------------------------------------

describe("@minimum silent-acceptance canaries", () => {
  // @minimum "hello" -- a quoted string is not a valid numeric argument.
  // Phase 3: typed parser (Role C) catches the string argument and emits
  // INVALID_TAG_ARGUMENT before the synthetic checker runs.
  // (Previously: the synthetic checker emitted TYPE_MISMATCH.)
  it('emits INVALID_TAG_ARGUMENT for @minimum "hello" (string-literal argument on a number field)', () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @minimum "hello" */
        value!: number;
      }
      `,
      "minimum-string-arg"
    );

    const diagnostic = diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(diagnostic, "Expected an INVALID_TAG_ARGUMENT diagnostic").toBeDefined();
    // range is always present; verify it points somewhere in the source
    expect(diagnostic?.range).toBeDefined();
    expect(typeof diagnostic?.range.start).toBe("number");
    expect(typeof diagnostic?.range.end).toBe("number");
  });

  // @minimum true -- boolean is not a valid numeric argument.
  // Phase 3: typed parser (Role C) catches the boolean and emits INVALID_TAG_ARGUMENT.
  // (Previously: the synthetic checker emitted TYPE_MISMATCH.)
  it("emits INVALID_TAG_ARGUMENT for @minimum true (boolean argument on a number field)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @minimum true */
        value!: number;
      }
      `,
      "minimum-true-arg"
    );

    const diagnostic = diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(diagnostic, "Expected an INVALID_TAG_ARGUMENT diagnostic").toBeDefined();
    expect(diagnostic?.range).toBeDefined();
  });

  // @minimum with no argument omits the required numeric value.
  // Phase 3: typed parser (Role C) emits MISSING_TAG_ARGUMENT for the empty argument.
  // (Previously: the synthetic checker emitted INVALID_TAG_ARGUMENT.)
  it("emits MISSING_TAG_ARGUMENT for @minimum with no argument", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @minimum */
        value!: number;
      }
      `,
      "minimum-empty-arg"
    );

    const diagnostic = diagnostics.find((d) => d.code === "MISSING_TAG_ARGUMENT");
    expect(diagnostic, "Expected a MISSING_TAG_ARGUMENT diagnostic").toBeDefined();
    expect(diagnostic?.range).toBeDefined();
  });

  // @minimum 0 on a string field -- string has no numeric-comparable capability.
  //
  // Phase 4D audit: SNAPSHOT PATH ONLY — still silently accepted.
  // Root cause: the synthetic prelude's direct-field tag_minimum overload has no
  // capability constraint on Subject. The build path (tsdoc-parser.ts) catches
  // this via supportsConstraintCapability() at Role B, but the snapshot consumer
  // (buildFormSpecAnalysisFileSnapshot) does not have an equivalent Role-B guard.
  // Phase 5 target: add host-checker Role-B capability check to snapshot consumer,
  // or retire the synthetic prelude in favour of the build path's guard.
  it.fails(
    "emits TYPE_MISMATCH for @minimum 0 on a string field [Phase 5 target: snapshot Role-B capability check]",
    () => {
      const diagnostics = diagnosticsFor(
        `
        class F {
          /** @minimum 0 */
          value!: string;
        }
        `,
        "minimum-on-string"
      );
      expect(diagnostics.some((d) => d.code === "TYPE_MISMATCH")).toBe(true);
    }
  );

  // @minimum 0 on a boolean field -- boolean has no numeric-comparable capability.
  //
  // Phase 4D audit: same root cause as @minimum on string above.
  // Phase 5 target: snapshot Role-B capability check.
  it.fails(
    "emits TYPE_MISMATCH for @minimum 0 on a boolean field [Phase 5 target: snapshot Role-B capability check]",
    () => {
      const diagnostics = diagnosticsFor(
        `
        class F {
          /** @minimum 0 */
          value!: boolean;
        }
        `,
        "minimum-on-boolean"
      );
      expect(diagnostics.some((d) => d.code === "TYPE_MISMATCH")).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// @enumOptions canaries
// ---------------------------------------------------------------------------

describe("@enumOptions silent-acceptance canaries", () => {
  // @enumOptions with no argument omits the required JSON array.
  // Phase 3: typed parser (Role C) emits MISSING_TAG_ARGUMENT for the empty argument.
  // (Previously: the synthetic checker emitted INVALID_TAG_ARGUMENT.)
  it("emits MISSING_TAG_ARGUMENT for @enumOptions with no argument", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @enumOptions */
        value!: string;
      }
      `,
      "enumOptions-empty"
    );

    const diagnostic = diagnostics.find((d) => d.code === "MISSING_TAG_ARGUMENT");
    expect(diagnostic, "Expected a MISSING_TAG_ARGUMENT diagnostic").toBeDefined();
    expect(diagnostic?.range).toBeDefined();
  });

  // @enumOptions [1, -- truncated / malformed JSON.
  // The synthetic checker emits INVALID_TAG_ARGUMENT.
  it("emits INVALID_TAG_ARGUMENT for @enumOptions [1, (malformed JSON)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @enumOptions [1, */
        value!: string;
      }
      `,
      "enumOptions-malformed"
    );

    const diagnostic = diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(diagnostic, "Expected an INVALID_TAG_ARGUMENT diagnostic").toBeDefined();
    expect(diagnostic?.range).toBeDefined();
  });

  // @enumOptions 5 -- scalar number, not a JSON array.
  // Phase 3 FLIP: typed parser (Role C) now rejects this with INVALID_TAG_ARGUMENT.
  // (Previously: silent acceptance — no diagnostic emitted.)
  it("emits INVALID_TAG_ARGUMENT for @enumOptions 5 (scalar, not array)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @enumOptions 5 */
        value!: string;
      }
      `,
      "enumOptions-scalar"
    );
    const diagnostic = diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(diagnostic, "Expected an INVALID_TAG_ARGUMENT diagnostic").toBeDefined();
    expect(diagnostic?.range).toBeDefined();
  });

  // @enumOptions {} -- plain object, not a JSON array.
  // Phase 3 FLIP: typed parser (Role C) now rejects this with INVALID_TAG_ARGUMENT.
  // (Previously: silent acceptance — no diagnostic emitted.)
  it("emits INVALID_TAG_ARGUMENT for @enumOptions {} (object, not array)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @enumOptions {} */
        value!: string;
      }
      `,
      "enumOptions-object"
    );
    const diagnostic = diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(diagnostic, "Expected an INVALID_TAG_ARGUMENT diagnostic").toBeDefined();
    expect(diagnostic?.range).toBeDefined();
  });

  // @enumOptions on a number field -- no enum-member-addressable capability.
  //
  // Phase 4D audit: same root cause as @minimum on string — synthetic prelude
  // direct-field tag_enumOptions has no capability constraint on Subject.
  // The build path does emit TYPE_MISMATCH (supportsConstraintCapability returns
  // false for number with "enum-member-addressable"). Phase 5 target.
  it.fails(
    "emits a diagnostic for @enumOptions on a number field (no enum capability) [Phase 5 target: snapshot Role-B capability check]",
    () => {
      const diagnostics = diagnosticsFor(
        `
        class F {
          /** @enumOptions ["a","b"] */
          value!: number;
        }
        `,
        "enumOptions-on-number"
      );
      expect(diagnostics.length).toBeGreaterThan(0);
    }
  );
});

// ---------------------------------------------------------------------------
// @pattern canaries
// ---------------------------------------------------------------------------

describe("@pattern silent-acceptance canaries", () => {
  // @pattern with no argument omits the required regex string.
  // Phase 3: typed parser (Role C) emits MISSING_TAG_ARGUMENT for the empty argument.
  // (Previously: the synthetic checker emitted INVALID_TAG_ARGUMENT.)
  it("emits MISSING_TAG_ARGUMENT for @pattern with no argument", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @pattern */
        value!: string;
      }
      `,
      "pattern-empty"
    );

    const diagnostic = diagnostics.find((d) => d.code === "MISSING_TAG_ARGUMENT");
    expect(diagnostic, "Expected a MISSING_TAG_ARGUMENT diagnostic").toBeDefined();
    expect(diagnostic?.range).toBeDefined();
  });

  // @pattern 42 -- a numeric literal is not a valid regex string.
  //
  // Phase 4D audit: INTENTIONAL non-strict acceptance in the typed parser.
  // The typed parser (tag-argument-parser.ts) accepts all non-empty text as
  // @pattern argument (raw string passthrough per §3 table: "Do not run
  // new RegExp(text) in Phase 2/3"). Numeric literal "42" is accepted as an
  // opaque string. This is a deliberate semantics choice per the retirement plan
  // (docs/refactors/synthetic-checker-retirement.md §3: "Do not run
  // new RegExp(text) — that is a new rejection. Defer regex validation.").
  // Changing this requires a separate opt-in improvement PR, not Phase 5.
  it.fails(
    "emits INVALID_TAG_ARGUMENT for @pattern 42 (numeric literal as regex) [intentional: typed parser accepts all non-empty text for @pattern; regex validation deferred]",
    () => {
      const diagnostics = diagnosticsFor(
        `
        class F {
          /** @pattern 42 */
          value!: string;
        }
        `,
        "pattern-numeric-literal"
      );
      expect(diagnostics.some((d) => d.code === "INVALID_TAG_ARGUMENT")).toBe(true);
    }
  );

  // @pattern on a number field -- numbers are not string-like.
  //
  // Phase 4D audit: same root cause as @minimum on string — synthetic prelude
  // direct-field tag_pattern has no capability constraint on Subject.
  // Phase 5 target: snapshot Role-B capability check.
  it.fails(
    "emits TYPE_MISMATCH for @pattern on a number field [Phase 5 target: snapshot Role-B capability check]",
    () => {
      const diagnostics = diagnosticsFor(
        `
        class F {
          /** @pattern ^[a-z]+$ */
          value!: number;
        }
        `,
        "pattern-on-number"
      );
      expect(diagnostics.some((d) => d.code === "TYPE_MISMATCH")).toBe(true);
    }
  );

  // @pattern on a boolean field -- booleans are not string-like.
  //
  // Phase 4D audit: same root cause as @pattern on number. Phase 5 target.
  it.fails(
    "emits TYPE_MISMATCH for @pattern on a boolean field [Phase 5 target: snapshot Role-B capability check]",
    () => {
      const diagnostics = diagnosticsFor(
        `
        class F {
          /** @pattern ^yes$ */
          value!: boolean;
        }
        `,
        "pattern-on-boolean"
      );
      expect(diagnostics.some((d) => d.code === "TYPE_MISMATCH")).toBe(true);
    }
  );

  // @pattern on a string[] (array) field -- arrays are not string-like.
  //
  // Phase 4D audit: same root cause as @pattern on number. Phase 5 target.
  // Note: supportsConstraintCapability for "string-like" includes arrays whose
  // item type is string-like (see tsdoc-parser.ts supportsConstraintCapability).
  // string[] element type IS string-like so the build path may also accept this.
  it.fails(
    "emits TYPE_MISMATCH for @pattern on a string[] (array) field [Phase 5 target: snapshot Role-B capability check]",
    () => {
      const diagnostics = diagnosticsFor(
        `
        class F {
          /** @pattern ^yes$ */
          value!: string[];
        }
        `,
        "pattern-on-array"
      );
      expect(diagnostics.some((d) => d.code === "TYPE_MISMATCH")).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// @uniqueItems canaries
// ---------------------------------------------------------------------------

describe("@uniqueItems silent-acceptance canaries", () => {
  // @uniqueItems false -- the boolean-marker family rejects anything that is
  // not empty or "true". Phase 3: typed parser (Role C) emits INVALID_TAG_ARGUMENT.
  // (Previously: the synthetic checker treated "false" as an identifier target
  // and emitted TYPE_MISMATCH.)
  it("emits INVALID_TAG_ARGUMENT for @uniqueItems false (invalid argument for marker family)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @uniqueItems false */
        value!: string[];
      }
      `,
      "uniqueItems-false"
    );

    const diagnostic = diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(diagnostic, "Expected an INVALID_TAG_ARGUMENT diagnostic").toBeDefined();
    expect(diagnostic?.range).toBeDefined();
  });

  // @uniqueItems yes -- the boolean-marker family rejects anything that is not
  // empty or "true". Phase 3: typed parser (Role C) emits INVALID_TAG_ARGUMENT.
  // (Previously: the synthetic checker emitted TYPE_MISMATCH.)
  it("emits INVALID_TAG_ARGUMENT for @uniqueItems yes (invalid argument for marker family)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @uniqueItems yes */
        value!: string[];
      }
      `,
      "uniqueItems-yes"
    );

    const diagnostic = diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(diagnostic, "Expected an INVALID_TAG_ARGUMENT diagnostic").toBeDefined();
    expect(diagnostic?.range).toBeDefined();
  });

  // @uniqueItems maybe -- the boolean-marker family rejects anything that is not
  // empty or "true". Phase 3: typed parser (Role C) emits INVALID_TAG_ARGUMENT.
  // (Previously: the synthetic checker emitted TYPE_MISMATCH.)
  it("emits INVALID_TAG_ARGUMENT for @uniqueItems maybe (invalid argument for marker family)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @uniqueItems maybe */
        value!: string[];
      }
      `,
      "uniqueItems-maybe"
    );

    const diagnostic = diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(diagnostic, "Expected an INVALID_TAG_ARGUMENT diagnostic").toBeDefined();
    expect(diagnostic?.range).toBeDefined();
  });

  // @uniqueItems on a string field -- strings are not arrays.
  //
  // Phase 4D audit: same root cause as @minimum on string — synthetic prelude
  // direct-field tag_uniqueItems has no capability constraint on Subject.
  // Phase 5 target: snapshot Role-B capability check.
  it.fails(
    "emits TYPE_MISMATCH for @uniqueItems on a string field [Phase 5 target: snapshot Role-B capability check]",
    () => {
      const diagnostics = diagnosticsFor(
        `
        class F {
          /** @uniqueItems */
          value!: string;
        }
        `,
        "uniqueItems-on-string"
      );
      expect(diagnostics.some((d) => d.code === "TYPE_MISMATCH")).toBe(true);
    }
  );

  // @uniqueItems on a number field -- numbers are not arrays.
  //
  // Phase 4D audit: same root cause as @uniqueItems on string. Phase 5 target.
  it.fails(
    "emits TYPE_MISMATCH for @uniqueItems on a number field [Phase 5 target: snapshot Role-B capability check]",
    () => {
      const diagnostics = diagnosticsFor(
        `
        class F {
          /** @uniqueItems */
          value!: number;
        }
        `,
        "uniqueItems-on-number"
      );
      expect(diagnostics.some((d) => d.code === "TYPE_MISMATCH")).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// @const canaries
// ---------------------------------------------------------------------------

describe("@const silent-acceptance canaries", () => {
  // @const with no argument omits the required JSON literal.
  // Phase 3: typed parser (Role C) emits MISSING_TAG_ARGUMENT for the empty argument.
  // (Previously: the synthetic checker emitted INVALID_TAG_ARGUMENT.)
  it("emits MISSING_TAG_ARGUMENT for @const with no argument", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @const */
        value!: string;
      }
      `,
      "const-empty"
    );

    const diagnostic = diagnostics.find((d) => d.code === "MISSING_TAG_ARGUMENT");
    expect(diagnostic, "Expected a MISSING_TAG_ARGUMENT diagnostic").toBeDefined();
    expect(diagnostic?.range).toBeDefined();
  });

  // @const "USD" on an object field -- a string literal constant is not
  // compatible with an object field.
  //
  // Phase 4D audit: IR-level mismatch — not surfaced by snapshot consumer.
  // Root cause: the synthetic prelude declares `type JsonValue = unknown`, so
  // any JSON value (including "USD") is assignable to the Subject type parameter
  // of tag_const. Both the build-path synthetic checker AND the snapshot-path
  // synthetic checker accept the call. The mismatch IS caught in the build path
  // by the IR validator (validateIR / semantic-targets.ts) after schema generation,
  // but the snapshot consumer (buildFormSpecAnalysisFileSnapshot) does not run
  // IR validation. Phase 5 target: retire the synthetic checker and/or add
  // IR-validation pass to the snapshot consumer.
  it.fails(
    'emits a diagnostic for @const "USD" on an object field [Phase 5 target: IR-validation pass in snapshot consumer]',
    () => {
      const diagnostics = diagnosticsFor(
        `
        class F {
          /** @const "USD" */
          value!: object;
        }
        `,
        "const-on-object"
      );
      expect(diagnostics.length).toBeGreaterThan(0);
    }
  );

  // @const {"a":1} on a number field -- a JSON object constant is not
  // compatible with a number field.
  //
  // Phase 4D audit: same root cause as @const "USD" on object — the synthetic
  // prelude's `JsonValue = unknown` means the synthetic checker accepts any JSON
  // value for any field type. IR validator in build path catches this, but
  // snapshot consumer does not run IR validation. Phase 5 target.
  it.fails(
    'emits TYPE_MISMATCH for @const {"a":1} on a number field [Phase 5 target: IR-validation pass in snapshot consumer]',
    () => {
      const diagnostics = diagnosticsFor(
        `
        class F {
          /** @const {"a":1} */
          value!: number;
        }
        `,
        "const-json-obj-on-number"
      );
      expect(diagnostics.some((d) => d.code === "TYPE_MISMATCH")).toBe(true);
    }
  );

  // @const 42 on a string field -- numeric constant mismatches the string
  // field type.
  //
  // Phase 4D audit: same root cause as @const "USD" on object. Phase 5 target.
  it.fails(
    "emits TYPE_MISMATCH for @const 42 on a string field [Phase 5 target: IR-validation pass in snapshot consumer]",
    () => {
      const diagnostics = diagnosticsFor(
        `
        class F {
          /** @const 42 */
          value!: string;
        }
        `,
        "const-42-on-string"
      );
      expect(diagnostics.some((d) => d.code === "TYPE_MISMATCH")).toBe(true);
    }
  );

  // @const {"a":{"b":1}} (deeply nested JSON object) on a string field.
  // Also probes that nested JSON values do not cause a parse crash.
  //
  // Phase 4D audit: same root cause as @const "USD" on object — JsonValue = unknown
  // in synthetic prelude. Phase 5 target: IR-validation pass in snapshot consumer.
  it.fails(
    "emits a diagnostic for @const with a nested object literal on a string field [Phase 5 target: IR-validation pass in snapshot consumer]",
    () => {
      const diagnostics = diagnosticsFor(
        `
        class F {
          /** @const {"a":{"b":1}} */
          value!: string;
        }
        `,
        "const-nested-obj-on-string"
      );
      expect(diagnostics.length).toBeGreaterThan(0);
    }
  );
});
