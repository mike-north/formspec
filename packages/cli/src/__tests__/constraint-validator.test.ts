/**
 * Unit tests for constraint contradiction detection.
 */

import { describe, it, expect } from "vitest";
import { validateConstraints } from "../analyzer/constraint-validator.js";
import type { JsonSchema } from "../analyzer/type-converter.js";

// ============================================================================
// Numeric bounds
// ============================================================================

describe("validateConstraints - numeric bounds", () => {
  it("returns no violations for valid minimum < maximum", () => {
    const schema: JsonSchema = { type: "number", minimum: 0, maximum: 100 };
    expect(validateConstraints("field", schema)).toHaveLength(0);
  });

  it("returns no violations when minimum equals maximum (valid single-value range)", () => {
    const schema: JsonSchema = { type: "number", minimum: 5, maximum: 5 };
    expect(validateConstraints("field", schema)).toHaveLength(0);
  });

  it("returns error for inverted bounds (minimum > maximum)", () => {
    const schema: JsonSchema = { type: "number", minimum: 100, maximum: 0 };
    const violations = validateConstraints("field", schema);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe("error");
    expect(violations[0]?.message).toMatch(/minimum.*100.*maximum.*0/i);
  });

  it("includes fieldName in violations", () => {
    const schema: JsonSchema = { type: "number", minimum: 100, maximum: 0 };
    const violations = validateConstraints("myField", schema);
    expect(violations[0]?.fieldName).toBe("myField");
  });

  it("returns no violations when only minimum is set", () => {
    const schema: JsonSchema = { type: "number", minimum: 0 };
    expect(validateConstraints("field", schema)).toHaveLength(0);
  });

  it("returns no violations when only maximum is set", () => {
    const schema: JsonSchema = { type: "number", maximum: 100 };
    expect(validateConstraints("field", schema)).toHaveLength(0);
  });
});

// ============================================================================
// Exclusive bounds
// ============================================================================

describe("validateConstraints - exclusive bounds", () => {
  it("returns no violations for valid exclusiveMinimum < exclusiveMaximum", () => {
    const schema: JsonSchema = { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 1 };
    expect(validateConstraints("field", schema)).toHaveLength(0);
  });

  it("returns error when exclusiveMinimum equals exclusiveMaximum", () => {
    const schema: JsonSchema = { type: "number", exclusiveMinimum: 5, exclusiveMaximum: 5 };
    const violations = validateConstraints("field", schema);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe("error");
  });

  it("returns error when exclusiveMinimum > exclusiveMaximum", () => {
    const schema: JsonSchema = { type: "number", exclusiveMinimum: 10, exclusiveMaximum: 5 };
    const violations = validateConstraints("field", schema);
    expect(violations).toHaveLength(1);
  });

  it("returns error when minimum >= exclusiveMaximum", () => {
    const schema: JsonSchema = { type: "number", minimum: 5, exclusiveMaximum: 5 };
    const violations = validateConstraints("field", schema);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toMatch(/exclusiveMaximum/i);
  });

  it("returns no violations when minimum < exclusiveMaximum", () => {
    const schema: JsonSchema = { type: "number", minimum: 4, exclusiveMaximum: 5 };
    expect(validateConstraints("field", schema)).toHaveLength(0);
  });

  it("returns error when exclusiveMinimum >= maximum", () => {
    const schema: JsonSchema = { type: "number", exclusiveMinimum: 5, maximum: 5 };
    const violations = validateConstraints("field", schema);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toMatch(/exclusiveMinimum/i);
  });

  it("returns no violations when exclusiveMinimum < maximum", () => {
    const schema: JsonSchema = { type: "number", exclusiveMinimum: 4, maximum: 5 };
    expect(validateConstraints("field", schema)).toHaveLength(0);
  });
});

// ============================================================================
// String length bounds
// ============================================================================

describe("validateConstraints - string length bounds", () => {
  it("returns no violations for valid minLength < maxLength", () => {
    const schema: JsonSchema = { type: "string", minLength: 1, maxLength: 100 };
    expect(validateConstraints("field", schema)).toHaveLength(0);
  });

  it("returns no violations when minLength equals maxLength", () => {
    const schema: JsonSchema = { type: "string", minLength: 10, maxLength: 10 };
    expect(validateConstraints("field", schema)).toHaveLength(0);
  });

  it("returns error for inverted string length (minLength > maxLength)", () => {
    const schema: JsonSchema = { type: "string", minLength: 10, maxLength: 5 };
    const violations = validateConstraints("field", schema);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe("error");
    expect(violations[0]?.message).toMatch(/minLength.*10.*maxLength.*5/i);
  });
});

// ============================================================================
// Array bounds
// ============================================================================

describe("validateConstraints - array bounds", () => {
  it("returns no violations for valid minItems < maxItems", () => {
    const schema: JsonSchema = { type: "array", minItems: 1, maxItems: 10 };
    expect(validateConstraints("field", schema)).toHaveLength(0);
  });

  it("returns error for inverted array bounds (minItems > maxItems)", () => {
    const schema: JsonSchema = { type: "array", minItems: 10, maxItems: 5 };
    const violations = validateConstraints("field", schema);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe("error");
    expect(violations[0]?.message).toMatch(/minItems.*10.*maxItems.*5/i);
  });
});

// ============================================================================
// Empty integer range
// ============================================================================

describe("validateConstraints - empty integer range", () => {
  it("returns error when no integer exists in range (0.5 to 0.9 with multipleOf:1)", () => {
    const schema: JsonSchema = { type: "number", minimum: 0.5, maximum: 0.9, multipleOf: 1 };
    const violations = validateConstraints("field", schema);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe("error");
    expect(violations[0]?.message).toMatch(/empty integer range/i);
  });

  it("returns no violation when at least one integer exists in range", () => {
    // Range [0.5, 1.5] contains integer 1
    const schema: JsonSchema = { type: "number", minimum: 0.5, maximum: 1.5, multipleOf: 1 };
    expect(validateConstraints("field", schema)).toHaveLength(0);
  });

  it("returns no violation when range contains exactly one integer (integer endpoints)", () => {
    const schema: JsonSchema = { type: "number", minimum: 5, maximum: 5, multipleOf: 1 };
    expect(validateConstraints("field", schema)).toHaveLength(0);
  });

  it("does not check integer range when multipleOf is not 1", () => {
    // Even if range is [0.5, 0.9], multipleOf:2 check is not performed
    const schema: JsonSchema = { type: "number", minimum: 0.5, maximum: 0.9, multipleOf: 2 };
    expect(validateConstraints("field", schema)).toHaveLength(0);
  });

  it("does not check integer range when bounds are absent", () => {
    const schema: JsonSchema = { type: "number", multipleOf: 1 };
    expect(validateConstraints("field", schema)).toHaveLength(0);
  });
});

// ============================================================================
// Multiple violations in one schema
// ============================================================================

describe("validateConstraints - multiple violations", () => {
  it("reports both inverted numeric bounds and inverted string length", () => {
    // This is an unusual schema combining number and string constraints
    // (e.g., via manual construction in tests)
    const schema: JsonSchema = {
      minimum: 100,
      maximum: 0,
      minLength: 10,
      maxLength: 5,
    };
    const violations = validateConstraints("field", schema);
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Clean schema — no constraints
// ============================================================================

describe("validateConstraints - no constraints", () => {
  it("returns empty array for schema with no constraint properties", () => {
    const schema: JsonSchema = { type: "string" };
    expect(validateConstraints("field", schema)).toHaveLength(0);
  });

  it("returns empty array for empty schema", () => {
    expect(validateConstraints("field", {})).toHaveLength(0);
  });
});
