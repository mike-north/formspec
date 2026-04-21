/**
 * Unit tests for `_collectBrandIdentifiers` and `_isIntegerBrandedType`.
 *
 * These helpers underlie the integer-brand bypass used by both the build
 * consumer (`tsdoc-parser.ts`) and the snapshot consumer (`file-snapshots.ts`)
 * to short-circuit numeric constraint checking for integer-branded
 * intersection types (#325).
 *
 * Snapshot-level integration coverage lives in
 * `file-snapshots.integer-bypass.test.ts`; this file covers the primitive
 * type-shape cases directly so future regressions in the narrowing logic are
 * caught without depending on the full snapshot pipeline.
 *
 * @see ../integer-brand.ts
 */

import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { _collectBrandIdentifiers, _isIntegerBrandedType } from "../integer-brand.js";
import { createProgram } from "./helpers.js";

/**
 * Compile the given source (which must declare `type Subject = ...`) and
 * return the resolved `ts.Type` of `Subject`.
 */
function subjectType(source: string): ts.Type {
  const { checker, sourceFile } = createProgram(source, "/virtual/integer-brand-test.ts");
  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement) && statement.name.text === "Subject") {
      return checker.getTypeFromTypeNode(statement.type);
    }
  }
  throw new Error("Expected `type Subject = ...` in fixture");
}

describe("_collectBrandIdentifiers", () => {
  it("returns empty list for non-intersection types", () => {
    expect(_collectBrandIdentifiers(subjectType("type Subject = number;"))).toEqual([]);
  });

  it("returns empty list for intersection without computed-property brands", () => {
    // Plain object-shape intersection, no symbol-keyed brand.
    const type = subjectType("type Subject = number & { tag: string };");
    expect(_collectBrandIdentifiers(type)).toEqual([]);
  });

  it("collects a single brand identifier", () => {
    const source = [
      "declare const __integerBrand: unique symbol;",
      "type Subject = number & { readonly [__integerBrand]: true };",
    ].join("\n");
    expect(_collectBrandIdentifiers(subjectType(source))).toEqual(["__integerBrand"]);
  });

  it("collects multiple brand identifiers", () => {
    const source = [
      "declare const __integerBrand: unique symbol;",
      "declare const __currencyBrand: unique symbol;",
      "type Subject = number & { readonly [__integerBrand]: true } & { readonly [__currencyBrand]: true };",
    ].join("\n");
    const brands = _collectBrandIdentifiers(subjectType(source));
    expect(brands).toContain("__integerBrand");
    expect(brands).toContain("__currencyBrand");
    expect(brands).toHaveLength(2);
  });
});

describe("_isIntegerBrandedType", () => {
  it("returns false for plain `number`", () => {
    expect(_isIntegerBrandedType(subjectType("type Subject = number;"))).toBe(false);
  });

  it("returns false for plain `string`", () => {
    expect(_isIntegerBrandedType(subjectType("type Subject = string;"))).toBe(false);
  });

  it("returns true for `number & { [__integerBrand]: true }`", () => {
    const source = [
      "declare const __integerBrand: unique symbol;",
      "type Subject = number & { readonly [__integerBrand]: true };",
    ].join("\n");
    expect(_isIntegerBrandedType(subjectType(source))).toBe(true);
  });

  it("returns true when `__integerBrand` sits alongside other brands", () => {
    const source = [
      "declare const __integerBrand: unique symbol;",
      "declare const __currencyBrand: unique symbol;",
      "type Subject = number & { readonly [__integerBrand]: true } & { readonly [__currencyBrand]: true };",
    ].join("\n");
    expect(_isIntegerBrandedType(subjectType(source))).toBe(true);
  });

  it("returns false for intersection with a non-integer brand key", () => {
    const source = [
      "declare const __currencyBrand: unique symbol;",
      "type Subject = number & { readonly [__currencyBrand]: true };",
    ].join("\n");
    expect(_isIntegerBrandedType(subjectType(source))).toBe(false);
  });

  it("returns false when the base is `string` rather than `number`", () => {
    const source = [
      "declare const __integerBrand: unique symbol;",
      "type Subject = string & { readonly [__integerBrand]: true };",
    ].join("\n");
    expect(_isIntegerBrandedType(subjectType(source))).toBe(false);
  });

  // Documents the caller contract: `_isIntegerBrandedType` does NOT strip
  // nullish union members — every consumer is expected to call
  // `stripNullishUnion` first. Forgetting to do so was the original #325 bug.
  it("returns false for `IntegerBrand | null` passed directly (nullish must be stripped first)", () => {
    const source = [
      "declare const __integerBrand: unique symbol;",
      "type IntegerBrand = number & { readonly [__integerBrand]: true };",
      "type Subject = IntegerBrand | null;",
    ].join("\n");
    expect(_isIntegerBrandedType(subjectType(source))).toBe(false);
  });
});
