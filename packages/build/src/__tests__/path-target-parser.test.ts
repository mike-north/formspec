/**
 * Unit tests for path-target extraction in TSDoc constraint tags.
 *
 * Covers both the low-level `extractPathTarget` helper and integration
 * via `parseTSDocTags` to confirm that ConstraintNode objects carry the
 * parsed `path` field when a `:identifier` prefix is present.
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { extractPathTarget, parseTSDocTags } from "../analyzer/tsdoc-parser.js";

// =============================================================================
// Test helpers
// =============================================================================

/**
 * Creates an in-memory TypeScript source file and returns the first property
 * declaration found in the first class.
 */
function getPropertyFromSource(source: string): ts.PropertyDeclaration {
  const sourceFile = ts.createSourceFile("test.ts", source, ts.ScriptTarget.Latest, true);

  for (const stmt of sourceFile.statements) {
    if (ts.isClassDeclaration(stmt)) {
      for (const member of stmt.members) {
        if (ts.isPropertyDeclaration(member)) {
          return member;
        }
      }
    }
  }

  throw new Error("No property declaration found in source");
}

// =============================================================================
// extractPathTarget — unit tests
// =============================================================================

describe("extractPathTarget", () => {
  it("extracts a single-segment path target", () => {
    const result = extractPathTarget(":value 0");
    expect(result).toEqual({
      path: { segments: ["value"] },
      remainingText: "0",
    });
  });

  it("extracts a dotted path target", () => {
    const result = extractPathTarget(":value.currency 0");
    expect(result).toEqual({
      path: { segments: ["value", "currency"] },
      remainingText: "0",
    });
  });

  it("returns null when no path target present", () => {
    expect(extractPathTarget("0")).toBeNull();
    expect(extractPathTarget("42.5")).toBeNull();
    expect(extractPathTarget("some text")).toBeNull();
  });

  it("returns null for invalid identifier after colon", () => {
    expect(extractPathTarget(":invalid-name 0")).toBeNull();
    expect(extractPathTarget(": 0")).toBeNull();
    expect(extractPathTarget(":123 0")).toBeNull();
  });

  it("handles underscore-prefixed identifiers", () => {
    const result = extractPathTarget(":_private 10");
    expect(result).toEqual({
      path: { segments: ["_private"] },
      remainingText: "10",
    });
  });

  it("handles identifiers with digits", () => {
    const result = extractPathTarget(":field2 hello");
    expect(result).toEqual({
      path: { segments: ["field2"] },
      remainingText: "hello",
    });
  });

  it("preserves remaining text with spaces", () => {
    const result = extractPathTarget(":value some complex value");
    expect(result).toEqual({
      path: { segments: ["value"] },
      remainingText: "some complex value",
    });
  });

  it("returns an empty remainingText when colon identifier has no trailing text", () => {
    expect(extractPathTarget(":value")).toEqual({
      path: { segments: ["value"] },
      remainingText: "",
    });
  });

  it("handles leading whitespace before the colon", () => {
    const result = extractPathTarget("  :amount 100");
    expect(result).toEqual({
      path: { segments: ["amount"] },
      remainingText: "100",
    });
  });

  it("preserves multi-line remaining text", () => {
    const result = extractPathTarget(":field line1\nline2");
    expect(result).toEqual({
      path: { segments: ["field"] },
      remainingText: "line1\nline2",
    });
  });
});

// =============================================================================
// parseTSDocTags — integration tests for path-targeted constraints
// =============================================================================

describe("parseTSDocTags — path target integration", () => {
  it("produces a ConstraintNode with path for @Minimum :value 0", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum :value 0 */
        x!: number;
      }
    `);

    const { constraints } = parseTSDocTags(prop, "/test.ts");
    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({
      kind: "constraint",
      constraintKind: "minimum",
      value: 0,
      path: { segments: ["value"] },
    });
  });

  it("produces a ConstraintNode with path for @Maximum :amount 1000", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Maximum :amount 1000 */
        x!: number;
      }
    `);

    const { constraints } = parseTSDocTags(prop);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({
      constraintKind: "maximum",
      value: 1000,
      path: { segments: ["amount"] },
    });
  });

  it("produces a ConstraintNode with path for @MinLength :name 2", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @MinLength :name 2 */
        x!: string;
      }
    `);

    const { constraints } = parseTSDocTags(prop);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({
      constraintKind: "minLength",
      value: 2,
      path: { segments: ["name"] },
    });
  });

  it("produces no path on a plain constraint (no :identifier prefix)", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum 5 */
        x!: number;
      }
    `);

    const { constraints } = parseTSDocTags(prop);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({ constraintKind: "minimum", value: 5 });
    expect(constraints[0]).not.toHaveProperty("path");
  });

  it("handles multiple constraints mixing path-targeted and plain", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum :value 0 @Maximum 100 */
        x!: number;
      }
    `);

    const { constraints } = parseTSDocTags(prop);
    expect(constraints).toHaveLength(2);

    const min = constraints.find((c) => c.constraintKind === "minimum");
    const max = constraints.find((c) => c.constraintKind === "maximum");

    expect(min).toMatchObject({
      constraintKind: "minimum",
      value: 0,
      path: { segments: ["value"] },
    });
    expect(max).toMatchObject({ constraintKind: "maximum", value: 100 });
    expect(max).not.toHaveProperty("path");
  });

  it("produces a ConstraintNode with path for @Pattern :fieldName", () => {
    // Pattern uses the raw TS JSDoc API, so path extraction must work there too
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Pattern :code ^[A-Z]+$ */
        x!: string;
      }
    `);

    const { constraints } = parseTSDocTags(prop);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toMatchObject({
      constraintKind: "pattern",
      pattern: "^[A-Z]+$",
      path: { segments: ["code"] },
    });
  });
});
