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
//   DOES have supportsConstraintCapability() check (in buildCompilerBackedConstraintDiagnostics,
//   at the `supportsConstraintCapability(capability, fieldType, checker, { ... })` call site)
//   and produces TYPE_MISMATCH for these cases. The synthetic prelude's direct-field
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
//   Both synthetic checkers accept the raw @const tag call (before IR validation)
//   because the prelude declares JsonValue = unknown (any JSON value is assignable).
//   The build path later catches the mismatch in validateIR, but the snapshot
//   consumer never reaches that layer. Phase 5 (synthetic retirement) or a
//   separate IR-validation pass for the snapshot consumer is needed.
//
// Category 3 — Intentional (not a gap): cases where the canary asserts an error
//   but the retirement plan intentionally accepts the input. Tracked here as
//   `.fails` purely as a regression guard — if a future change starts rejecting
//   one of these, this test will flip and force a review of the design decision.
//   - @pattern with non-string argument (e.g., 42): plan §3 — opaque pass-through.
//   - @pattern on string[]: both paths treat string[] as string-like for @pattern
//     (supportsConstraintCapability's "string-like" branch performs array-element
//     unwrap — returns true when the array element type is itself string-like).
//
// Phase 3 flips (previously .fails, now passing regular assertions):
// - @enumOptions 5 (scalar not array) — typed parser catches at Role C
// - @enumOptions {} (object not array) — typed parser catches at Role C
//
// Phase 5A flips (2026-04-21):
// - 8 Category-1 canaries: snapshot consumer now runs _supportsConstraintCapability
//   Role-B guard in buildTagDiagnostics, matching the build path's check.
//   Closes the 8 Role-B silent-acceptance gaps tracked in #326.
// - @const "USD" on object (bonus flip): the TypeScript `object` primitive type
//   has TypeFlags.NonPrimitive and is NOT json-like, so the capability check
//   emits TYPE_MISMATCH directly. This is correct behavior.
//
// Phase 5B flips (2026-04-21):
// - 3 Category-2 @const canaries: snapshot consumer now runs @const IR
//   validation (_checkConstValueAgainstType) in buildTagDiagnostics after
//   Role-C accepts the parsed JSON value. Closes the IR-validation gap for
//   primitive value-type mismatches (@const {"a":1} on number, @const 42 on
//   string, @const {"a":{"b":1}} on string).
//
// @see docs/refactors/synthetic-checker-retirement.md S.9.3 #14
// @see docs/refactors/synthetic-checker-retirement.md §4 (Phase 3 scope)
// @see docs/refactors/synthetic-checker-retirement.md §4 Phase 5A
// @see docs/refactors/synthetic-checker-retirement.md §4 Phase 5B
// @see packages/analysis/src/constraint-applicability.ts _supportsConstraintCapability (Role B — shared)
// @see packages/analysis/src/constraint-applicability.ts _checkConstValueAgainstType (@const IR — snapshot)
import { describe, expect, it } from "vitest";
import { buildFormSpecAnalysisFileSnapshot } from "../src/internal.js";
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
    expect(diagnostic?.range.start).toBeGreaterThanOrEqual(0);
    expect(diagnostic?.range.end).toBeGreaterThanOrEqual(0);
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
  // Phase 5A FLIP: snapshot consumer now runs the Role-B capability guard
  // (_supportsConstraintCapability) in buildTagDiagnostics, matching the build
  // path's supportsConstraintCapability() check in tsdoc-parser.ts.
  it("emits TYPE_MISMATCH for @minimum 0 on a string field (snapshot Role-B capability check)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @minimum 0 */
        value!: string;
      }
      `,
      "minimum-on-string"
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("TYPE_MISMATCH");
    expect(diagnostics[0]?.range).toBeDefined();
    expect(diagnostics[0]?.range.start).toBeGreaterThanOrEqual(0);
    expect(diagnostics[0]?.range.end).toBeGreaterThanOrEqual(0);
  });

  // @minimum 0 on a boolean field -- boolean has no numeric-comparable capability.
  //
  // Phase 5A FLIP: same mechanism as @minimum on string above.
  it("emits TYPE_MISMATCH for @minimum 0 on a boolean field (snapshot Role-B capability check)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @minimum 0 */
        value!: boolean;
      }
      `,
      "minimum-on-boolean"
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("TYPE_MISMATCH");
    expect(diagnostics[0]?.range).toBeDefined();
    expect(diagnostics[0]?.range.start).toBeGreaterThanOrEqual(0);
    expect(diagnostics[0]?.range.end).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// @enumOptions canaries
// ---------------------------------------------------------------------------

describe("@enumOptions silent-acceptance canaries", () => {
  // @enumOptions with no argument omits the required JSON array.
  // Phase 3: typed parser (Role C) emits MISSING_TAG_ARGUMENT for the empty argument.
  // (Previously: the synthetic checker emitted INVALID_TAG_ARGUMENT.)
  //
  // Note: field type is "a" | "b" (string literal union) so Role B passes
  // (enum-member-addressable capability) and Role C runs.
  it("emits MISSING_TAG_ARGUMENT for @enumOptions with no argument", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @enumOptions */
        value!: "a" | "b";
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
  //
  // Note: field type is "a" | "b" (string literal union) so Role B passes
  // (enum-member-addressable capability) and Role C runs.
  it("emits INVALID_TAG_ARGUMENT for @enumOptions [1, (malformed JSON)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @enumOptions [1, */
        value!: "a" | "b";
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
  //
  // Note: field type is "a" | "b" (string literal union) so Role B passes
  // (enum-member-addressable capability) and Role C runs.
  it("emits INVALID_TAG_ARGUMENT for @enumOptions 5 (scalar, not array)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @enumOptions 5 */
        value!: "a" | "b";
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
  //
  // Note: field type is "a" | "b" (string literal union) so Role B passes
  // (enum-member-addressable capability) and Role C runs.
  it("emits INVALID_TAG_ARGUMENT for @enumOptions {} (object, not array)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @enumOptions {} */
        value!: "a" | "b";
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
  // Phase 5A FLIP: snapshot consumer now runs the Role-B capability guard,
  // matching the build path's supportsConstraintCapability() check which returns
  // false for number with "enum-member-addressable".
  it("emits TYPE_MISMATCH for @enumOptions on a number field (no enum-member-addressable capability)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @enumOptions ["a","b"] */
        value!: number;
      }
      `,
      "enumOptions-on-number"
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("TYPE_MISMATCH");
    expect(diagnostics[0]?.range).toBeDefined();
    expect(diagnostics[0]?.range.start).toBeGreaterThanOrEqual(0);
    expect(diagnostics[0]?.range.end).toBeGreaterThanOrEqual(0);
  });
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
  // Phase 5A FLIP: snapshot consumer now runs the Role-B capability guard.
  it("emits TYPE_MISMATCH for @pattern on a number field (snapshot Role-B capability check)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @pattern ^[a-z]+$ */
        value!: number;
      }
      `,
      "pattern-on-number"
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("TYPE_MISMATCH");
    expect(diagnostics[0]?.range).toBeDefined();
    expect(diagnostics[0]?.range.start).toBeGreaterThanOrEqual(0);
    expect(diagnostics[0]?.range.end).toBeGreaterThanOrEqual(0);
  });

  // @pattern on a boolean field -- booleans are not string-like.
  //
  // Phase 5A FLIP: snapshot consumer now runs the Role-B capability guard.
  it("emits TYPE_MISMATCH for @pattern on a boolean field (snapshot Role-B capability check)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @pattern ^yes$ */
        value!: boolean;
      }
      `,
      "pattern-on-boolean"
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("TYPE_MISMATCH");
    expect(diagnostics[0]?.range).toBeDefined();
    expect(diagnostics[0]?.range.start).toBeGreaterThanOrEqual(0);
    expect(diagnostics[0]?.range.end).toBeGreaterThanOrEqual(0);
  });

  // @pattern on a string[] (array) field -- arrays are not string-like...or are they?
  //
  // [intentional: string[] is string-like for @pattern]
  //
  // Phase 4D audit: this canary asserts TYPE_MISMATCH, but NEITHER consumer emits one.
  // Root cause: supportsConstraintCapability()'s "string-like" branch (array-element unwrap)
  // in the build path treats string[] as satisfying "string-like" when the array element
  // type is itself string-like — so string[] passes the Role-B capability check in the
  // build path. The snapshot path's synthetic prelude has no capability constraint either,
  // so it also accepts without error. Both consumers agree: @pattern on string[] is valid.
  // The TYPE_MISMATCH assertion in this test is a bug in the original canary spec.
  // Phase 5 will NOT flip this canary; this test is kept as a regression guard only —
  // if a future change causes either path to start rejecting @pattern on string[],
  // this test will flip and force a review of the design decision.
  //
  // Contrast with the number[] canary below: unlike string[] (which satisfies string-like
  // via element unwrap), number[] is NOT string-like — both paths should reject @pattern
  // on number[], but currently don't (genuine Phase 5 gap).
  it.fails(
    "emits TYPE_MISMATCH for @pattern on a string[] (array) field [intentional: string[] is string-like for @pattern; supportsConstraintCapability's string-like branch (array-element unwrap)]",
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

  // @pattern ^yes$ on a number[] (array) field -- number[] is NOT string-like.
  //
  // Unlike string[] (which satisfies "string-like" via _supportsConstraintCapability's
  // array-element unwrap branch), number[] is NOT string-like — the element type
  // (number) is not string-like, and neither is the array itself.
  //
  // Phase 5A FLIP: snapshot consumer now runs the Role-B capability guard.
  // _supportsConstraintCapability unwraps the array element to `number`, which
  // is not string-like, so the capability check fails and TYPE_MISMATCH is emitted.
  it("emits TYPE_MISMATCH for @pattern ^yes$ on a number[] field (snapshot Role-B capability check)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @pattern ^yes$ */
        value!: number[];
      }
      `,
      "pattern-on-number-array"
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("TYPE_MISMATCH");
    expect(diagnostics[0]?.range).toBeDefined();
    expect(diagnostics[0]?.range.start).toBeGreaterThanOrEqual(0);
    expect(diagnostics[0]?.range.end).toBeGreaterThanOrEqual(0);
  });
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
  // Phase 5A FLIP: snapshot consumer now runs the Role-B capability guard.
  it("emits TYPE_MISMATCH for @uniqueItems on a string field (snapshot Role-B capability check)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @uniqueItems */
        value!: string;
      }
      `,
      "uniqueItems-on-string"
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("TYPE_MISMATCH");
    expect(diagnostics[0]?.range).toBeDefined();
    expect(diagnostics[0]?.range.start).toBeGreaterThanOrEqual(0);
    expect(diagnostics[0]?.range.end).toBeGreaterThanOrEqual(0);
  });

  // @uniqueItems on a number field -- numbers are not arrays.
  //
  // Phase 5A FLIP: same mechanism as @uniqueItems on string above.
  it("emits TYPE_MISMATCH for @uniqueItems on a number field (snapshot Role-B capability check)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @uniqueItems */
        value!: number;
      }
      `,
      "uniqueItems-on-number"
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("TYPE_MISMATCH");
    expect(diagnostics[0]?.range).toBeDefined();
    expect(diagnostics[0]?.range.start).toBeGreaterThanOrEqual(0);
    expect(diagnostics[0]?.range.end).toBeGreaterThanOrEqual(0);
  });
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
  // Phase 5A FLIP (bonus): the TypeScript `object` primitive type has
  // TypeFlags.NonPrimitive and is NOT json-like (isJsonLike returns false).
  // The Role-B capability guard (_supportsConstraintCapability) catches this
  // at capability check time: @const requires "json-like", but the TypeScript
  // `object` keyword does not satisfy that capability.
  //
  // Note: this is different from struct/record object types (e.g. `{ code: string }`)
  // which ARE json-like. The TypeScript `object` primitive is a catch-all for
  // non-primitive values and is specifically not json-like.
  it('emits TYPE_MISMATCH for @const "USD" on an object field (Role-B capability check)', () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @const "USD" */
        value!: object;
      }
      `,
      "const-on-object"
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("TYPE_MISMATCH");
    expect(diagnostics[0]?.range).toBeDefined();
    expect(diagnostics[0]?.range.start).toBeGreaterThanOrEqual(0);
    expect(diagnostics[0]?.range.end).toBeGreaterThanOrEqual(0);
  });

  // @const {"a":1} on a number field -- a JSON object constant is not
  // compatible with a number field.
  //
  // Phase 5B FLIP: snapshot consumer now runs the @const IR validation in
  // buildTagDiagnostics after Role-C accepts the parsed JSON value. The
  // value's typeof ("object") does not match the number field's primitive
  // kind, so TYPE_MISMATCH is emitted — matching the build consumer's
  // semantic-targets.ts case "const" (~line 1283).
  it('emits TYPE_MISMATCH for @const {"a":1} on a number field (snapshot @const IR validation)', () => {
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
  });

  // @const 42 on a string field -- numeric constant mismatches the string
  // field type.
  //
  // Phase 5B FLIP: snapshot consumer now runs the @const IR validation in
  // buildTagDiagnostics after Role-C accepts the parsed JSON value. The
  // value's typeof ("number") does not match the string field's primitive
  // kind, so TYPE_MISMATCH is emitted — matching the build consumer's
  // semantic-targets.ts case "const" (~line 1283).
  it("emits TYPE_MISMATCH for @const 42 on a string field (snapshot @const IR validation)", () => {
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
  });

  // @const {"a":{"b":1}} (deeply nested JSON object) on a string field.
  // Also probes that nested JSON values do not cause a parse crash.
  //
  // Phase 5B FLIP: snapshot consumer now runs the @const IR validation in
  // buildTagDiagnostics after Role-C accepts the parsed JSON value. The
  // value's typeof ("object") does not match the string field's primitive
  // kind, so TYPE_MISMATCH is emitted — matching the build consumer's
  // semantic-targets.ts case "const" (~line 1283). This also confirms that
  // deeply nested JSON values do not cause a parse crash during validation.
  it("emits a diagnostic for @const with a nested object literal on a string field (snapshot @const IR validation)", () => {
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
  });
});
