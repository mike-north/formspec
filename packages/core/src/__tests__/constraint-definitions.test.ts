/**
 * Runtime tests for constraint definition utilities.
 */
import { describe, it, expect } from "vitest";
import {
  _normalizeConstraintTagName as normalizeConstraintTagName,
  _isBuiltinConstraintName as isBuiltinConstraintName,
  _BUILTIN_CONSTRAINT_DEFINITIONS as BUILTIN_CONSTRAINT_DEFINITIONS,
} from "../types/constraint-definitions.js";

describe("normalizeConstraintTagName", () => {
  it("lowercases a PascalCase tag name", () => {
    expect(normalizeConstraintTagName("Minimum")).toBe("minimum");
  });

  it("preserves an already-camelCase tag name (idempotent)", () => {
    expect(normalizeConstraintTagName("minimum")).toBe("minimum");
  });

  it("handles multi-word PascalCase", () => {
    expect(normalizeConstraintTagName("MinLength")).toBe("minLength");
  });

  it("preserves multi-word camelCase", () => {
    expect(normalizeConstraintTagName("minLength")).toBe("minLength");
  });

  it("handles single character", () => {
    expect(normalizeConstraintTagName("X")).toBe("x");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeConstraintTagName("")).toBe("");
  });

  it("does not fully lowercase all-caps input (only first char)", () => {
    // Intentional: handles PascalCase→camelCase only, not arbitrary casing
    expect(normalizeConstraintTagName("MINIMUM")).toBe("mINIMUM");
  });
});

describe("isBuiltinConstraintName", () => {
  it("returns true for a known camelCase constraint name", () => {
    expect(isBuiltinConstraintName("minimum")).toBe(true);
  });

  it("returns true for all defined constraint names", () => {
    for (const key of Object.keys(BUILTIN_CONSTRAINT_DEFINITIONS)) {
      expect(isBuiltinConstraintName(key)).toBe(true);
    }
  });

  it("returns false for PascalCase input (callers must normalize first)", () => {
    expect(isBuiltinConstraintName("Minimum")).toBe(false);
  });

  it("returns false for an unknown name", () => {
    expect(isBuiltinConstraintName("notAConstraint")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isBuiltinConstraintName("")).toBe(false);
  });

  it("returns false for all-caps input", () => {
    expect(isBuiltinConstraintName("MINIMUM")).toBe(false);
  });

  it("returns false for 'toString' (prototype property — regression: in operator bug)", () => {
    // The `in` operator matches inherited properties via the prototype chain.
    // Object.hasOwn() prevents these false positives.
    expect(isBuiltinConstraintName("toString")).toBe(false);
  });

  it("returns false for 'constructor' (prototype property — regression: in operator bug)", () => {
    expect(isBuiltinConstraintName("constructor")).toBe(false);
  });

  it("returns false for 'hasOwnProperty' (prototype property)", () => {
    expect(isBuiltinConstraintName("hasOwnProperty")).toBe(false);
  });

  it("returns false for '__proto__' (prototype property)", () => {
    expect(isBuiltinConstraintName("__proto__")).toBe(false);
  });
});
