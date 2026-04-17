/**
 * Regression tests: annotation, structure, and ecosystem tags must not
 * constrain the field type they decorate.
 *
 * Before the fix to `buildExtraTagDefinition`, non-constraint tags inherited
 * a `capabilities` array derived from their value-kind (e.g. `@displayName`
 * has a string argument, so it was tagged `capabilities: ["string-like"]`).
 * Consumers of that array then treated the capability as a *field-type*
 * requirement, rejecting the tag on any non-matching field — even though
 * the value-kind describes the tag's argument, not the field.
 *
 * Capabilities should only be populated for `constraint`-category tags
 * (the built-ins in `BUILTIN_TAG_DEFINITIONS`). The ESLint rule
 * `tag-type-check` and the narrow synthetic applicability check both read
 * `definition.capabilities` to derive a field-type requirement, so both
 * paths regressed for non-constraint tags with a typed value.
 *
 * @see packages/analysis/src/tag-registry.ts — buildExtraTagDefinition
 * @see packages/analysis/src/compiler-signatures.ts — getTargetCapabilityForSignature
 * @see packages/eslint-plugin/src/rules/type-compatibility/tag-type-check.ts — getExpectedTypesForTag
 */
import { describe, expect, it } from "vitest";
import { checkNarrowSyntheticTagApplicability } from "../compiler-signatures.js";

interface TagCase {
  readonly tagName: string;
  readonly category: "annotation" | "structure" | "ecosystem";
  readonly valueKindLabel: string;
  readonly argumentExpression: string;
}

interface FieldTypeCase {
  readonly name: string;
  // Inlined TypeScript type expression. The narrow synthetic check doesn't
  // take supporting declarations, so the whole type must be self-contained.
  readonly typeExpression: string;
}

// Every `EXTRA_TAG_SPECS` entry whose value-kind previously produced a
// non-empty `capabilities` array. All of these inherited a stray field-type
// capability before the fix. `showWhen`/`hideWhen`/`enableWhen`/`disableWhen`
// had `["condition-like"]` too, but `condition-like` maps to an empty list
// of expected field types downstream, so they never triggered rejections —
// still, the fix clears their capability array alongside the others for
// consistency. We focus the matrix on the tags that actually regressed.
const NON_CONSTRAINT_TAGS: readonly TagCase[] = [
  // annotation category
  {
    tagName: "displayName",
    category: "annotation",
    valueKindLabel: "string",
    argumentExpression: '"Maximum Credit Amount"',
  },
  {
    tagName: "description",
    category: "annotation",
    valueKindLabel: "string",
    argumentExpression: '"descriptive text"',
  },
  {
    tagName: "format",
    category: "annotation",
    valueKindLabel: "string",
    argumentExpression: '"currency"',
  },
  {
    tagName: "placeholder",
    category: "annotation",
    valueKindLabel: "string",
    argumentExpression: '"placeholder"',
  },
  {
    tagName: "order",
    category: "annotation",
    valueKindLabel: "signedInteger",
    argumentExpression: "5",
  },
  {
    tagName: "apiName",
    category: "annotation",
    valueKindLabel: "string",
    argumentExpression: '"legacy_field"',
  },
  // structure category
  {
    tagName: "group",
    category: "structure",
    valueKindLabel: "string",
    argumentExpression: '"Advanced"',
  },
  // ecosystem category
  {
    tagName: "example",
    category: "ecosystem",
    valueKindLabel: "string",
    argumentExpression: '"Acme Corp"',
  },
  {
    tagName: "remarks",
    category: "ecosystem",
    valueKindLabel: "string",
    argumentExpression: '"implementation notes"',
  },
  {
    tagName: "see",
    category: "ecosystem",
    valueKindLabel: "string",
    argumentExpression: '"https://docs.example.com"',
  },
];

// A matrix of field types a tag can land on. The bug manifested for types
// that don't satisfy the value-kind-derived capability (e.g. a
// `MonetaryAmount` object is not "string-like", so `@displayName` was
// rejected even though `displayName` is a pure label).
const FIELD_TYPES: readonly FieldTypeCase[] = [
  { name: "number", typeExpression: "number" },
  { name: "boolean", typeExpression: "boolean" },
  {
    name: "object with numeric field",
    typeExpression: "{ amount: number; currency: string }",
  },
  {
    name: "branded Integer (number & symbol brand)",
    typeExpression: "number & { readonly __integerBrand: unique symbol }",
  },
  { name: "string[]", typeExpression: "string[]" },
  {
    name: 'literal union "draft" | "sent"',
    typeExpression: '"draft" | "sent"',
  },
];

describe("non-constraint tags do not impose a field-type capability", () => {
  for (const tagCase of NON_CONSTRAINT_TAGS) {
    describe(`@${tagCase.tagName} (${tagCase.category}, value-kind ${tagCase.valueKindLabel})`, () => {
      for (const fieldType of FIELD_TYPES) {
        it(`is accepted on ${fieldType.name}`, () => {
          const result = checkNarrowSyntheticTagApplicability({
            tagName: tagCase.tagName,
            placement: "class-field",
            resolvedTargetType: fieldType.typeExpression,
            argumentExpression: tagCase.argumentExpression,
          });

          expect(
            result.diagnostics,
            `@${tagCase.tagName} should not be rejected on ${fieldType.name} — ` +
              `it's a ${tagCase.category} tag that decorates the field, not a constraint`
          ).toEqual([]);
        });
      }
    });
  }
});

// Sanity: built-in *constraint* tags must STILL enforce field-type
// capabilities. The fix must not weaken constraint semantics — only the
// incorrectly-inherited capabilities on non-constraint tags go away.
describe("built-in constraint tags still enforce field-type capabilities", () => {
  it("@minLength is rejected on a number field", () => {
    const result = checkNarrowSyntheticTagApplicability({
      tagName: "minLength",
      placement: "class-field",
      resolvedTargetType: "number",
      argumentExpression: "1",
    });

    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("@minimum is rejected on a string field", () => {
    const result = checkNarrowSyntheticTagApplicability({
      tagName: "minimum",
      placement: "class-field",
      resolvedTargetType: "string",
      argumentExpression: "0",
    });

    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("@minimum is accepted on a branded Integer field", () => {
    const result = checkNarrowSyntheticTagApplicability({
      tagName: "minimum",
      placement: "class-field",
      resolvedTargetType: "number & { readonly __integerBrand: unique symbol }",
      argumentExpression: "0",
    });

    expect(result.diagnostics).toEqual([]);
  });
});
