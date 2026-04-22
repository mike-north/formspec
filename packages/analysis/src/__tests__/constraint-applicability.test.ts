/**
 * Tests for the `_supportsConstraintCapability` helper and its integration
 * with the snapshot consumer's Role-B capability guard.
 *
 * This module re-asserts the narrow-applicability invariants that were
 * previously only tested via the synthetic-checker path in
 * `compiler-signatures.test.ts:751-873`. Those tests verify the synthetic
 * call produces diagnostics for mismatched types; these tests verify that:
 *
 * 1. `_supportsConstraintCapability` correctly models capability gating.
 * 2. The snapshot consumer (`buildFormSpecAnalysisFileSnapshot`) emits
 *    `TYPE_MISMATCH` for the same inputs via Role B (not via the synthetic
 *    checker), and `INVALID_TAG_PLACEMENT` for structural misplacement.
 *
 * @see packages/analysis/src/constraint-applicability.ts
 * @see packages/analysis/src/file-snapshots.ts buildTagDiagnostics (§5 Phase 5A)
 * @see packages/build/src/analyzer/tsdoc-parser.ts supportsConstraintCapability
 * @see docs/refactors/synthetic-checker-retirement.md §4 Phase 5A
 */

import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  _checkConstValueAgainstType,
  _supportsConstraintCapability,
} from "../constraint-applicability.js";
import { buildFormSpecAnalysisFileSnapshot } from "../internal.js";
import { createProgram } from "./helpers.js";

// ---------------------------------------------------------------------------
// Unit tests for _supportsConstraintCapability
// ---------------------------------------------------------------------------

describe("_supportsConstraintCapability", () => {
  function makeProgram(fieldType: string) {
    const source = `class F { field!: ${fieldType}; }`;
    const { checker, sourceFile } = createProgram(source);
    // Locate the 'field' property and extract its type
    let fieldNode: ts.PropertyDeclaration | undefined;
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "field"
      ) {
        fieldNode = node;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (fieldNode === undefined) throw new Error("field not found");
    const type = checker.getTypeAtLocation(fieldNode.name);
    return { type, checker };
  }

  // Invariant 1: valid number target for @minimum → capability check passes
  it("returns true for number type with numeric-comparable capability", () => {
    const { type, checker } = makeProgram("number");
    expect(_supportsConstraintCapability("numeric-comparable", type, checker)).toBe(true);
  });

  // Invariant 2: string target for @minimum → capability check fails
  it("returns false for string type with numeric-comparable capability", () => {
    const { type, checker } = makeProgram("string");
    expect(_supportsConstraintCapability("numeric-comparable", type, checker)).toBe(false);
  });

  // Invariant 3: boolean target for @minimum → capability check fails
  it("returns false for boolean type with numeric-comparable capability", () => {
    const { type, checker } = makeProgram("boolean");
    expect(_supportsConstraintCapability("numeric-comparable", type, checker)).toBe(false);
  });

  // Invariant 4: string target for @pattern → string-like capability passes
  it("returns true for string type with string-like capability", () => {
    const { type, checker } = makeProgram("string");
    expect(_supportsConstraintCapability("string-like", type, checker)).toBe(true);
  });

  // Invariant 5: number target for @pattern → string-like capability fails
  it("returns false for number type with string-like capability", () => {
    const { type, checker } = makeProgram("number");
    expect(_supportsConstraintCapability("string-like", type, checker)).toBe(false);
  });

  // Invariant 6: boolean target for @pattern → string-like capability fails
  it("returns false for boolean type with string-like capability", () => {
    const { type, checker } = makeProgram("boolean");
    expect(_supportsConstraintCapability("string-like", type, checker)).toBe(false);
  });

  // string-like array-element unwrap: string[] satisfies string-like
  it("returns true for string[] type with string-like capability (array-element unwrap)", () => {
    const { type, checker } = makeProgram("string[]");
    expect(_supportsConstraintCapability("string-like", type, checker)).toBe(true);
  });

  // number[] does NOT satisfy string-like — element type is number, not string-like
  it("returns false for number[] type with string-like capability", () => {
    const { type, checker } = makeProgram("number[]");
    expect(_supportsConstraintCapability("string-like", type, checker)).toBe(false);
  });

  // Regression: nullable string array (string[] | null) must satisfy string-like.
  // Before the fix, getArrayElementType called checker.isArrayType on the raw
  // union, which returned false, silently failing the Role-B capability check.
  it("returns true for string[] | null type with string-like capability (nullable-array regression)", () => {
    const { type, checker } = makeProgram("string[] | null");
    expect(_supportsConstraintCapability("string-like", type, checker)).toBe(true);
  });

  // Regression companion: nullable number array (number[] | null) must NOT satisfy string-like.
  it("returns false for number[] | null type with string-like capability", () => {
    const { type, checker } = makeProgram("number[] | null");
    expect(_supportsConstraintCapability("string-like", type, checker)).toBe(false);
  });

  // string[] satisfies array-like for @uniqueItems
  it("returns true for string[] type with array-like capability", () => {
    const { type, checker } = makeProgram("string[]");
    expect(_supportsConstraintCapability("array-like", type, checker)).toBe(true);
  });

  // string (plain, non-array) does NOT satisfy array-like for @uniqueItems
  it("returns false for string type with array-like capability", () => {
    const { type, checker } = makeProgram("string");
    expect(_supportsConstraintCapability("array-like", type, checker)).toBe(false);
  });

  // number does NOT satisfy array-like for @uniqueItems
  it("returns false for number type with array-like capability", () => {
    const { type, checker } = makeProgram("number");
    expect(_supportsConstraintCapability("array-like", type, checker)).toBe(false);
  });

  // string literal union satisfies enum-member-addressable for @enumOptions
  it("returns true for string literal union type with enum-member-addressable capability", () => {
    const { type, checker } = makeProgram('"a" | "b"');
    expect(_supportsConstraintCapability("enum-member-addressable", type, checker)).toBe(true);
  });

  // plain string does NOT satisfy enum-member-addressable for @enumOptions
  it("returns false for string type with enum-member-addressable capability", () => {
    const { type, checker } = makeProgram("string");
    expect(_supportsConstraintCapability("enum-member-addressable", type, checker)).toBe(false);
  });

  // number does NOT satisfy enum-member-addressable for @enumOptions
  it("returns false for number type with enum-member-addressable capability", () => {
    const { type, checker } = makeProgram("number");
    expect(_supportsConstraintCapability("enum-member-addressable", type, checker)).toBe(false);
  });

  // undefined capability → always passes (no constraint)
  it("returns true when capability is undefined (no capability required)", () => {
    const { type, checker } = makeProgram("string");
    expect(_supportsConstraintCapability(undefined, type, checker)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: snapshot consumer emits TYPE_MISMATCH via Role B
// ---------------------------------------------------------------------------

describe("snapshot consumer Role-B integration", () => {
  function diagnosticsFor(source: string, label: string) {
    const { checker, sourceFile } = createProgram(source, `/virtual/applicability-${label}.ts`);
    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
    return snapshot.diagnostics;
  }

  // Invariant 7 (multi-field): multiple fields in one class — valid number
  // fields pass Role B, invalid string fields emit TYPE_MISMATCH each
  it("emits TYPE_MISMATCH only for mismatched fields in a multi-field class", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @minimum 0 */
        valid!: number;
        /** @minimum 0 */
        invalid!: string;
      }
      `,
      "multi-field-minimum"
    );
    // Only the string field should get TYPE_MISMATCH; the number field should pass
    const typeMismatch = diagnostics.filter((d) => d.code === "TYPE_MISMATCH");
    expect(typeMismatch).toHaveLength(1);
    expect(typeMismatch[0]?.range).toBeDefined();
    expect(typeMismatch[0]?.range.start).toBeGreaterThanOrEqual(0);
    expect(typeMismatch[0]?.range.end).toBeGreaterThanOrEqual(0);
  });

  // Invariant 8: pattern on multiple field types — strings pass, numbers fail
  it("emits TYPE_MISMATCH for @pattern on non-string fields in a multi-field class", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @pattern ^[a-z]+$ */
        validStr!: string;
        /** @pattern ^[a-z]+$ */
        invalidNum!: number;
        /** @pattern ^[a-z]+$ */
        invalidBool!: boolean;
      }
      `,
      "multi-field-pattern"
    );
    const typeMismatches = diagnostics.filter((d) => d.code === "TYPE_MISMATCH");
    expect(typeMismatches).toHaveLength(2);
    for (const diag of typeMismatches) {
      expect(diag.range).toBeDefined();
    }
  });

  // Note: argument-type tests (e.g. @minimum "hello" → INVALID_TAG_ARGUMENT) are
  // covered by constraint-canaries.test.ts and tag-argument-parser.test.ts.
  // Those exercise Role C (typed parser), not Role B (capability check).
});

// ---------------------------------------------------------------------------
// Integration test: snapshot consumer emits INVALID_TAG_PLACEMENT via
// explicit getMatchingTagSignatures pre-check (§5 Phase 5A)
// ---------------------------------------------------------------------------

describe("snapshot consumer placement pre-check integration", () => {
  function diagnosticsFor(source: string, label: string) {
    const { checker, sourceFile } = createProgram(source, `/virtual/placement-${label}.ts`);
    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
    return snapshot.diagnostics;
  }

  // A @minimum tag on a `type-alias` placement (e.g. `type Foo = number`) has
  // no valid signature for "type-alias" placement. The type itself (number) DOES
  // satisfy the "numeric-comparable" capability, so Role B passes and the
  // placement pre-check (getMatchingTagSignatures → []) is the first to reject.
  //
  // This is distinct from a field placement where the tag is structurally valid.
  it("emits INVALID_TAG_PLACEMENT for @minimum on a type alias (placement: type-alias)", () => {
    const diagnostics = diagnosticsFor(
      `
      /** @minimum 0 */
      type NumberAlias = number;
      `,
      "minimum-on-type-alias"
    );
    const placementDiag = diagnostics.find((d) => d.code === "INVALID_TAG_PLACEMENT");
    expect(placementDiag, "Expected an INVALID_TAG_PLACEMENT diagnostic").toBeDefined();
    expect(placementDiag?.range).toBeDefined();
    expect(placementDiag?.range.start).toBeGreaterThanOrEqual(0);
    expect(placementDiag?.range.end).toBeGreaterThanOrEqual(0);
  });

  // A @minimum tag on a valid class field should NOT produce INVALID_TAG_PLACEMENT
  it("does NOT emit INVALID_TAG_PLACEMENT for @minimum on a class field (valid placement)", () => {
    const diagnostics = diagnosticsFor(
      `
      class F {
        /** @minimum 0 */
        value!: number;
      }
      `,
      "minimum-on-field"
    );
    const placementDiag = diagnostics.find((d) => d.code === "INVALID_TAG_PLACEMENT");
    expect(placementDiag).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unit tests for _checkConstValueAgainstType (§5 Phase 5B)
//
// Mirrors the three sub-checks ported from semantic-targets.ts case "const":
//   1. Placement: field type must be primitive or enum
//   2. Primitive value-type match: value typeof must match primitive kind
//   3. Enum membership: value must deep-equal one enum member
// ---------------------------------------------------------------------------

describe("_checkConstValueAgainstType", () => {
  function makeProgram(fieldType: string) {
    const source = `class F { field!: ${fieldType}; }`;
    const { checker, sourceFile } = createProgram(source);
    let fieldNode: ts.PropertyDeclaration | undefined;
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "field"
      ) {
        fieldNode = node;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (fieldNode === undefined) throw new Error("field not found");
    const type = checker.getTypeAtLocation(fieldNode.name);
    return { type, checker };
  }

  // -----------------------------------------------------------------------
  // Positive (happy-path) cases — should return null
  // -----------------------------------------------------------------------

  it("returns null for a string value on a string field", () => {
    const { type, checker } = makeProgram("string");
    expect(_checkConstValueAgainstType("USD", type, checker)).toBeNull();
  });

  it("returns null for a number value on a number field", () => {
    const { type, checker } = makeProgram("number");
    expect(_checkConstValueAgainstType(42, type, checker)).toBeNull();
  });

  it("returns null for a boolean value on a boolean field", () => {
    const { type, checker } = makeProgram("boolean");
    expect(_checkConstValueAgainstType(true, type, checker)).toBeNull();
  });

  it("returns null for null value on a null field", () => {
    const { type, checker } = makeProgram("null");
    expect(_checkConstValueAgainstType(null, type, checker)).toBeNull();
  });

  it("returns null for a string value on a nullable string field (strips null)", () => {
    const { type, checker } = makeProgram("string | null");
    expect(_checkConstValueAgainstType("USD", type, checker)).toBeNull();
  });

  it("returns null for a number value on a nullable number field (strips null)", () => {
    const { type, checker } = makeProgram("number | null");
    expect(_checkConstValueAgainstType(0, type, checker)).toBeNull();
  });

  it("returns null for a matching enum member value on a string literal union", () => {
    const { type, checker } = makeProgram('"draft" | "sent" | "archived"');
    expect(_checkConstValueAgainstType("sent", type, checker)).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Sub-check 1: placement (field type must be primitive or enum)
  // -----------------------------------------------------------------------

  it("emits TYPE_MISMATCH with placement message for @const on a struct field ({ code: string })", () => {
    const { type, checker } = makeProgram("{ code: string }");
    const result = _checkConstValueAgainstType("USD", type, checker);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("TYPE_MISMATCH");
    expect(result?.message).toMatch(
      /constraint "const" is only valid on primitive or enum fields, but field type is/
    );
  });

  it("emits TYPE_MISMATCH with placement message for @const on an array field (string[])", () => {
    const { type, checker } = makeProgram("string[]");
    const result = _checkConstValueAgainstType("USD", type, checker);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("TYPE_MISMATCH");
    expect(result?.message).toContain("is only valid on primitive or enum fields");
  });

  it("emits TYPE_MISMATCH with placement message for @const on a mixed-type union (string | number)", () => {
    // Mixed primitive union is NOT a string-literal enum; classifyConstTargetType
    // returns "other" and the placement check fires.
    const { type, checker } = makeProgram("string | number");
    const result = _checkConstValueAgainstType("USD", type, checker);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("TYPE_MISMATCH");
    expect(result?.message).toContain("is only valid on primitive or enum fields");
  });

  // -----------------------------------------------------------------------
  // Sub-check 2: primitive value-type match
  // -----------------------------------------------------------------------

  it("emits TYPE_MISMATCH with value-type message for a number value on a string field", () => {
    const { type, checker } = makeProgram("string");
    const result = _checkConstValueAgainstType(42, type, checker);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("TYPE_MISMATCH");
    expect(result?.message).toBe(
      '@const value type "number" is incompatible with field type "string"'
    );
  });

  it("emits TYPE_MISMATCH with value-type message for a string value on a number field", () => {
    const { type, checker } = makeProgram("number");
    const result = _checkConstValueAgainstType("oops", type, checker);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("TYPE_MISMATCH");
    expect(result?.message).toBe(
      '@const value type "string" is incompatible with field type "number"'
    );
  });

  it("emits TYPE_MISMATCH with value-type message for an object value on a number field", () => {
    const { type, checker } = makeProgram("number");
    const result = _checkConstValueAgainstType({ a: 1 }, type, checker);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("TYPE_MISMATCH");
    // typeof {a:1} === "object" — mirrors build path's constValueTypeLabel
    expect(result?.message).toBe(
      '@const value type "object" is incompatible with field type "number"'
    );
  });

  it("emits TYPE_MISMATCH with value-type message for an array value on a number field", () => {
    const { type, checker } = makeProgram("number");
    const result = _checkConstValueAgainstType([1, 2, 3], type, checker);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("TYPE_MISMATCH");
    // Array values are labelled "array" (not "object") — mirrors build path.
    expect(result?.message).toBe(
      '@const value type "array" is incompatible with field type "number"'
    );
  });

  it("emits TYPE_MISMATCH with value-type message for a null value on a number field", () => {
    const { type, checker } = makeProgram("number");
    const result = _checkConstValueAgainstType(null, type, checker);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("TYPE_MISMATCH");
    expect(result?.message).toBe(
      '@const value type "null" is incompatible with field type "number"'
    );
  });

  it("emits TYPE_MISMATCH with value-type message for a boolean value on a number field", () => {
    const { type, checker } = makeProgram("number");
    const result = _checkConstValueAgainstType(true, type, checker);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("TYPE_MISMATCH");
    expect(result?.message).toBe(
      '@const value type "boolean" is incompatible with field type "number"'
    );
  });

  // -----------------------------------------------------------------------
  // Sub-check 3: enum membership
  // -----------------------------------------------------------------------

  it("emits TYPE_MISMATCH for a non-matching value on a string-literal union", () => {
    const { type, checker } = makeProgram('"draft" | "sent"');
    const result = _checkConstValueAgainstType("archived", type, checker);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("TYPE_MISMATCH");
    expect(result?.message).toBe('@const value "archived" is not one of the enum members');
  });

  it("emits TYPE_MISMATCH for a numeric value on a string-literal enum", () => {
    // The enum only accepts string members by construction (string-literal union).
    // Passing a number value falls through to the enum-membership deep-equal
    // check and no member matches — so the enum-membership error fires, not
    // the primitive value-type error.
    const { type, checker } = makeProgram('"draft" | "sent"');
    const result = _checkConstValueAgainstType(42, type, checker);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("TYPE_MISMATCH");
    expect(result?.message).toBe("@const value 42 is not one of the enum members");
  });

  // -----------------------------------------------------------------------
  // Parity: matches build path's semantic-targets.ts messages verbatim
  // (minus the "Field \"<name>\": " prefix the build path adds at emission)
  // -----------------------------------------------------------------------

  it("returns messages that match the build path's TYPE_MISMATCH text (minus field-name prefix)", () => {
    // The build consumer's semantic-targets.ts case "const" produces:
    //   `Field "${fieldName}": @const value type "${valueType}" is incompatible with field type "${primitiveKind}"`
    // The snapshot consumer emits the message without the `Field "<name>":`
    // prefix because buildTagDiagnostics anchors the diagnostic at the tag span,
    // not the field declaration.
    const { type, checker } = makeProgram("string");
    const result = _checkConstValueAgainstType(42, type, checker);
    expect(result?.message).toBe(
      '@const value type "number" is incompatible with field type "string"'
    );
  });
});
