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
// Remaining silent acceptances (Role B — placement/capability, Phase 4 target):
// - @minimum 0 on string / boolean fields (capability check, not argument check)
// - @enumOptions on a plain number field (enum capability check)
// - @pattern with a numeric literal argument (typed parser accepts all non-empty text)
// - @pattern on number / boolean / array fields (capability check)
// - @uniqueItems on string / number fields (capability check)
// - @const with mismatched type (IR-level TYPE_MISMATCH from semantic-targets.ts)
//
// Phase 3 flips (previously .fails, now passing regular assertions):
// - @enumOptions 5 (scalar not array) — typed parser catches at Role C
// - @enumOptions {} (object not array) — typed parser catches at Role C
//
// @see docs/refactors/synthetic-checker-retirement.md S.9.3 #14
// @see docs/refactors/synthetic-checker-retirement.md §4 (Phase 3 scope)
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
  // SILENT ACCEPTANCE today -- pre-existing gap; Phase 2 must address.
  it.fails(
    "emits TYPE_MISMATCH for @minimum 0 on a string field [known silent acceptance, refactor plan S.9.3 #14]",
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
  // SILENT ACCEPTANCE today -- pre-existing gap; Phase 2 must address.
  it.fails(
    "emits TYPE_MISMATCH for @minimum 0 on a boolean field [known silent acceptance, refactor plan S.9.3 #14]",
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
  // SILENT ACCEPTANCE today -- pre-existing gap; Phase 2 must address.
  it.fails(
    "emits a diagnostic for @enumOptions on a number field (no enum capability) [known silent acceptance, refactor plan S.9.3 #14]",
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
  // TODAY: silently accepted as a string-like regex argument.
  // SILENT ACCEPTANCE today -- pre-existing gap; Phase 2 must address.
  // Once typed parser is stricter this should assert INVALID_TAG_ARGUMENT.
  it.fails(
    "emits INVALID_TAG_ARGUMENT for @pattern 42 (numeric literal as regex) [known silent acceptance, refactor plan S.9.3 #14]",
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
  // SILENT ACCEPTANCE today -- pre-existing gap; Phase 2 must address.
  it.fails(
    "emits TYPE_MISMATCH for @pattern on a number field [known silent acceptance, refactor plan S.9.3 #14]",
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
  // SILENT ACCEPTANCE today -- pre-existing gap; Phase 2 must address.
  it.fails(
    "emits TYPE_MISMATCH for @pattern on a boolean field [known silent acceptance, refactor plan S.9.3 #14]",
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
  // SILENT ACCEPTANCE today -- pre-existing gap; Phase 2 must address.
  it.fails(
    "emits TYPE_MISMATCH for @pattern on a string[] (array) field [known silent acceptance, refactor plan S.9.3 #14]",
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
  // SILENT ACCEPTANCE today -- pre-existing gap; Phase 2 must address.
  it.fails(
    "emits TYPE_MISMATCH for @uniqueItems on a string field [known silent acceptance, refactor plan S.9.3 #14]",
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
  // SILENT ACCEPTANCE today -- pre-existing gap; Phase 2 must address.
  it.fails(
    "emits TYPE_MISMATCH for @uniqueItems on a number field [known silent acceptance, refactor plan S.9.3 #14]",
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
  // SILENT ACCEPTANCE today -- pre-existing gap; Phase 2 must address.
  it.fails(
    'emits a diagnostic for @const "USD" on an object field [known silent acceptance, refactor plan S.9.3 #14]',
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
  // SILENT ACCEPTANCE today -- pre-existing gap; Phase 2 must address.
  it.fails(
    'emits TYPE_MISMATCH for @const {"a":1} on a number field [known silent acceptance, refactor plan S.9.3 #14]',
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
  // SILENT ACCEPTANCE today -- pre-existing gap; Phase 2 must address.
  it.fails(
    "emits TYPE_MISMATCH for @const 42 on a string field [known silent acceptance, refactor plan S.9.3 #14]",
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
  // SILENT ACCEPTANCE today -- pre-existing gap; Phase 2 must address.
  it.fails(
    "emits a diagnostic for @const with a nested object literal on a string field [known silent acceptance, refactor plan S.9.3 #14]",
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
