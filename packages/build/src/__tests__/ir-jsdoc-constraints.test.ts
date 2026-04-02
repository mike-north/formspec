/**
 * Tests for JSDoc constraint and annotation extraction to IR nodes.
 *
 * Verifies that {@link extractJSDocConstraintNodes} produces
 * {@link ConstraintNode} and {@link extractJSDocAnnotationNodes} produces
 * {@link AnnotationNode} directly.
 *
 * @see packages/core/src/types/ir.ts for IR type definitions
 * @see packages/core/src/types/constraint-definitions.ts for BUILTIN_CONSTRAINT_DEFINITIONS
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import {
  extractJSDocConstraintNodes,
  extractJSDocAnnotationNodes,
} from "../analyzer/jsdoc-constraints.js";
import { extractDisplayNameMetadata } from "../analyzer/tsdoc-parser.js";
import {
  createDateExtensionRegistry,
  DATE_TIME_TYPE_ID,
} from "./fixtures/example-date-extension.js";
import {
  createNumericExtensionRegistry,
  BIGINT_TYPE_ID,
  DECIMAL_TYPE_ID,
} from "./fixtures/example-numeric-extension.js";

/**
 * Helper: creates an in-memory TypeScript source file and returns the
 * first property declaration found in the first class.
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

/**
 * Helper: creates an in-memory TypeScript source file and returns the
 * first property signature found in the first interface.
 */
function getInterfacePropertyFromSource(source: string): ts.PropertySignature {
  const sourceFile = ts.createSourceFile("test.ts", source, ts.ScriptTarget.Latest, true);

  for (const stmt of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(stmt)) {
      for (const member of stmt.members) {
        if (ts.isPropertySignature(member)) {
          return member;
        }
      }
    }
  }

  throw new Error("No property signature found in source");
}

// =============================================================================
// extractJSDocConstraintNodes
// =============================================================================

describe("extractJSDocConstraintNodes", () => {
  it("produces NumericConstraintNode for @Minimum", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum 34 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop, "/test.ts");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "constraint",
      constraintKind: "minimum",
      value: 34,
    });
  });

  it("produces NumericConstraintNode for @Maximum", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Maximum 100 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "constraint",
      constraintKind: "maximum",
      value: 100,
    });
  });

  it("produces PatternConstraintNode for @Pattern", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Pattern ^[a-z]+$ */
        x!: string;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "constraint",
      constraintKind: "pattern",
      pattern: "^[a-z]+$",
    });
  });

  it("preserves @ characters inside @Pattern payloads", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Pattern ^[^@]+@[^@]+$ */
        x!: string;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "constraint",
      constraintKind: "pattern",
      pattern: "^[^@]+@[^@]+$",
    });
  });

  it("handles negative numbers", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum -10 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      constraintKind: "minimum",
      value: -10,
    });
  });

  it("handles decimal numbers", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Maximum 3.14 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      constraintKind: "maximum",
      value: 3.14,
    });
  });

  it("handles zero as a valid numeric value", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum 0 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ constraintKind: "minimum", value: 0 });
  });

  it("produces LengthConstraintNode for @MinLength and @MaxLength", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @MinLength 2 @MaxLength 8 */
        x!: string;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ constraintKind: "minLength", value: 2 });
    expect(result[1]).toMatchObject({ constraintKind: "maxLength", value: 8 });
  });

  it("produces NumericConstraintNode for @ExclusiveMinimum and @ExclusiveMaximum", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @ExclusiveMinimum 0 @ExclusiveMaximum 11 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ constraintKind: "exclusiveMinimum", value: 0 });
    expect(result[1]).toMatchObject({ constraintKind: "exclusiveMaximum", value: 11 });
  });

  it("produces allowedMembers ConstraintNode for @EnumOptions", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions ["a","b","c"] */
        x!: string;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "constraint",
      constraintKind: "allowedMembers",
      members: ["a", "b", "c"],
    });
  });

  it("extracts id values from labeled EnumOptions objects", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions [{"id":"low","label":"Low"},{"id":"high","label":"High"}] */
        x!: string;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      constraintKind: "allowedMembers",
      members: ["low", "high"],
    });
  });

  it("produces ArrayCardinalityConstraintNode for @uniqueItems", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @uniqueItems */
        x!: string[];
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "constraint",
      constraintKind: "uniqueItems",
      value: true,
    });
  });

  it("produces ConstConstraintNode for @const", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @const "USD" */
        x!: string;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "constraint",
      constraintKind: "const",
      value: "USD",
    });
  });

  it("preserves falsy JSON values for @const", () => {
    const zeroProp = getPropertyFromSource(`
      class Foo {
        /** @const 0 */
        x!: number;
      }
    `);
    const falseProp = getPropertyFromSource(`
      class Foo {
        /** @const false */
        x!: boolean;
      }
    `);
    const nullProp = getPropertyFromSource(`
      class Foo {
        /** @const null */
        x!: string | null;
      }
    `);

    expect(extractJSDocConstraintNodes(zeroProp)[0]).toMatchObject({
      constraintKind: "const",
      value: 0,
    });
    expect(extractJSDocConstraintNodes(falseProp)[0]).toMatchObject({
      constraintKind: "const",
      value: false,
    });
    expect(extractJSDocConstraintNodes(nullProp)[0]).toMatchObject({
      constraintKind: "const",
      value: null,
    });
  });

  it("produces FormatAnnotationNode for @format", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @format email */
        x!: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      annotationKind: "format",
      value: "email",
    });
  });

  it("ignores non-constraint tags", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @deprecated Use something else @param foo */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("skips tags with malformed numeric values", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum abc */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("skips tags with empty values", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("accepts lowercase (camelCase) constraint tags", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @minimum 5 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ constraintKind: "minimum", value: 5 });
  });

  it("returns empty array for node with no JSDoc", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("includes provenance with tag name", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum 5 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop, "/test.ts");
    expect(result).toHaveLength(1);
    expect(result[0]?.provenance.tagName).toBe("@minimum");
    expect(result[0]?.provenance.file).toBe("/test.ts");
    expect(result[0]?.provenance.surface).toBe("tsdoc");
    expect(result[0]?.provenance.line).toBeGreaterThan(0);
  });

  it("skips malformed JSON for @EnumOptions", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions ["unclosed */
        x!: string;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("skips non-array JSON for @EnumOptions", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions {"a":"b"} */
        x!: string;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// extractJSDocAnnotationNodes
// =============================================================================

describe("extractJSDocAnnotationNodes", () => {
  it("produces DisplayNameAnnotationNode for @displayName", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @displayName Full Name */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop, "/test.ts");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "annotation",
      annotationKind: "displayName",
      value: "Full Name",
    });
  });

  it("extracts summary text as description annotation (spec 002 §2.3)", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** Help text for this field */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "annotation",
      annotationKind: "description",
      value: "Help text for this field",
    });
  });

  it("preserves multi-line summary text as description", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /**
         * Help text for this field
         * that continues on the next line.
         */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      annotationKind: "description",
      value: "Help text for this field that continues on the next line.",
    });
  });

  it("preserves inline markdown code spans in summary text descriptions", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** Use \`customer.email\` when composing the follow-up message. */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      annotationKind: "description",
      value: "Use `customer.email` when composing the follow-up message.",
    });
  });

  it("extracts @remarks as a separate remarks annotation (spec 002 §2.3)", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @remarks Supplementary documentation */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      annotationKind: "remarks",
      value: "Supplementary documentation",
    });
  });

  it("@remarks alone does NOT produce a description annotation (spec 002 §2.3)", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @remarks Only remarks, no summary */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    const descriptions = result.filter((n) => n.annotationKind === "description");
    expect(descriptions).toHaveLength(0);
  });

  it("summary + @remarks produces both description and remarks annotations (spec 002 §2.3)", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /**
         * Summary becomes the description.
         * @remarks Remarks become a separate annotation.
         */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    const description = result.find((n) => n.annotationKind === "description");
    const remarks = result.find((n) => n.annotationKind === "remarks");

    expect(description).toMatchObject({
      annotationKind: "description",
      value: "Summary becomes the description.",
    });
    expect(remarks).toMatchObject({
      annotationKind: "remarks",
      value: "Remarks become a separate annotation.",
    });
  });

  it("no comment produces no description or remarks annotations", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    const descriptions = result.filter((n) => n.annotationKind === "description");
    const remarks = result.filter((n) => n.annotationKind === "remarks");
    expect(descriptions).toHaveLength(0);
    expect(remarks).toHaveLength(0);
  });

  it("produces both displayName and description from summary", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /**
         * The user's legal name
         * @displayName Full Name
         */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(2);
    expect(result.find((n) => n.annotationKind === "displayName")).toMatchObject({
      annotationKind: "displayName",
      value: "Full Name",
    });
    expect(result.find((n) => n.annotationKind === "description")).toMatchObject({
      annotationKind: "description",
      value: "The user's legal name",
    });
  });

  it("parses multiple displayName tags for enum member labels via display-name metadata", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /**
         * @displayName :active Active Account
         * @displayName :suspended Suspended
         * @displayName :closed Permanently Closed
         */
        status: "active" | "suspended" | "closed";
      }
    `);

    const result = extractDisplayNameMetadata(prop);
    expect(result.displayName).toBeUndefined();
    expect([...result.memberDisplayNames.entries()]).toEqual([
      ["active", "Active Account"],
      ["suspended", "Suspended"],
      ["closed", "Permanently Closed"],
    ]);
  });

  it("produces DeprecatedAnnotationNode for @deprecated", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @deprecated Use fullName instead */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    const deprecated = result.find((a) => a.annotationKind === "deprecated");
    expect(deprecated).toBeDefined();
    expect(deprecated).toMatchObject({
      kind: "annotation",
      annotationKind: "deprecated",
    });
  });

  it("returns empty array when no metadata tags present", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @Minimum 0 */
        x: number;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when no JSDoc comment exists", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("skips tags with empty values", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @displayName */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("includes provenance with tag name", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @displayName Full Name */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop, "/test.ts");
    expect(result).toHaveLength(1);
    expect(result[0]?.provenance.tagName).toBe("@displayName");
    expect(result[0]?.provenance.file).toBe("/test.ts");
    expect(result[0]?.provenance.surface).toBe("tsdoc");
  });

  it("preserves multi-line @defaultValue payloads", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /**
         * @defaultValue {
         *   "enabled": true,
         *   "mode": "email"
         * }
         */
        settings?: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toContainEqual(
      expect.objectContaining({
        annotationKind: "defaultValue",
        value: { enabled: true, mode: "email" },
      })
    );
  });

  it("works on class properties too", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @displayName Class Field */
        x!: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      annotationKind: "displayName",
      value: "Class Field",
    });
  });
});

describe("extension-aware JSDoc constraint extraction", () => {
  const registry = createNumericExtensionRegistry();

  it("recognizes extension-defined constraint tags when a registry is provided", () => {
    const prop = getPropertyFromSource(`
      class Quote {
        /** @maxSigFig 5 @maxDecimalPlaces 2 */
        amount!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop, "/test.ts", {
      extensionRegistry: registry,
      fieldType: { kind: "primitive", primitiveKind: "number" },
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      constraintKind: "custom",
      constraintId: "x-formspec/example-numeric/MaxSigFig",
      payload: 5,
    });
    expect(result[1]).toMatchObject({
      constraintKind: "custom",
      constraintId: "x-formspec/example-numeric/MaxDecimalPlaces",
      payload: 2,
    });
  });

  it("broadens built-in numeric tags onto Decimal through the extension registry", () => {
    const prop = getPropertyFromSource(`
      class Quote {
        /** @minimum 10 @exclusiveMaximum 99.95 */
        amount!: Decimal;
      }
      type Decimal = string;
    `);

    const result = extractJSDocConstraintNodes(prop, "/test.ts", {
      extensionRegistry: registry,
      fieldType: {
        kind: "custom",
        typeId: DECIMAL_TYPE_ID,
        payload: null,
      },
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      constraintKind: "custom",
      constraintId: "x-formspec/example-numeric/DecimalMinimum",
      payload: "10.0",
    });
    expect(result[1]).toMatchObject({
      constraintKind: "custom",
      constraintId: "x-formspec/example-numeric/DecimalExclusiveMaximum",
      payload: "99.95",
    });
  });

  it("allows @maxSigFig on bigint-backed custom numeric types", () => {
    const prop = getPropertyFromSource(`
      class Quote {
        /** @maxSigFig 8 */
        count!: bigint;
      }
    `);

    const result = extractJSDocConstraintNodes(prop, "/test.ts", {
      extensionRegistry: registry,
      fieldType: {
        kind: "custom",
        typeId: BIGINT_TYPE_ID,
        payload: null,
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      constraintKind: "custom",
      constraintId: "x-formspec/example-numeric/MaxSigFig",
      payload: 8,
    });
  });

  it("recognizes extension-defined date constraint tags and canonicalizes them", () => {
    const registry = createDateExtensionRegistry();
    const prop = getPropertyFromSource(`
      class BookingWindow {
        /** @after 2026-03-01T08:00:00.000-08:00 @before 2026-03-31T08:00:00.000-07:00 */
        opensAt!: DateTime;
      }
      type DateTime = string;
    `);

    const result = extractJSDocConstraintNodes(prop, "/test.ts", {
      extensionRegistry: registry,
      fieldType: {
        kind: "custom",
        typeId: DATE_TIME_TYPE_ID,
        payload: null,
      },
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      constraintKind: "custom",
      constraintId: "x-formspec/example-date/After",
      payload: "2026-03-01T16:00:00.000Z",
    });
    expect(result[1]).toMatchObject({
      constraintKind: "custom",
      constraintId: "x-formspec/example-date/Before",
      payload: "2026-03-31T15:00:00.000Z",
    });
  });
});
