/**
 * Type applicability checker for comment tags.
 *
 * Validates that constraint tags are applied to compatible TypeScript types.
 * For example, @minLength should only be used on string fields, and @minimum
 * should only be used on numeric fields.
 */

import * as ts from "typescript";
import type { CommentTagInfo } from "./comment-tag-extractor.js";
import type { ConstraintViolation } from "./constraint-validator.js";
import { stripNullableTypes, isStringLiteralUnion, isNumberLiteralUnion } from "./ts-type-utils.js";

/**
 * Tags that are only valid on numeric types (number, number literals).
 */
const NUMERIC_ONLY_TAGS = new Set([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "maxSigFig",
  "maxDecimalPlaces",
]);

/**
 * Tags that are only valid on string types (string, string literals).
 */
const STRING_ONLY_TAGS = new Set(["minLength", "maxLength", "pattern", "format"]);

/**
 * Tags that are only valid on array types.
 */
const ARRAY_ONLY_TAGS = new Set(["minItems", "maxItems", "uniqueItems"]);

/**
 * Checks whether comment tags are applicable to the given TypeScript type.
 *
 * Returns constraint violations for tags that are incompatible with the field's type.
 *
 * Nullable and optional types (T | null, T | undefined) are unwrapped to their
 * effective type before checking — e.g., `string | null` is treated as `string`.
 *
 * @param fieldName - The name of the field (for error messages)
 * @param fieldType - The resolved TypeScript type of the field
 * @param commentTags - The extracted comment tags to check
 * @param checker - TypeScript type checker
 * @returns Array of constraint violations (empty if all tags are applicable)
 */
export function checkTypeApplicability(
  fieldName: string,
  fieldType: ts.Type,
  commentTags: CommentTagInfo[],
  checker: ts.TypeChecker
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  // Unwrap nullable/optional unions to their effective type.
  // If there's exactly one non-null/undefined member, that's the effective type.
  let effectiveType = fieldType;
  if (fieldType.isUnion()) {
    const nonNullTypes = stripNullableTypes(fieldType.types);
    if (nonNullTypes.length === 1 && nonNullTypes[0]) {
      effectiveType = nonNullTypes[0];
    }
  }

  const isNumeric = !!(effectiveType.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral));
  const isString = !!(effectiveType.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral));
  const isArray = checker.isArrayType(effectiveType);

  // Detect union enums: all non-null members are string or number literals
  let isStringEnum = false;
  let isNumberEnum = false;
  if (effectiveType.isUnion()) {
    const nonNull = stripNullableTypes(effectiveType.types);
    isStringEnum = isStringLiteralUnion(nonNull);
    isNumberEnum = isNumberLiteralUnion(nonNull);
  }

  const typeString = checker.typeToString(fieldType);

  for (const tag of commentTags) {
    if (NUMERIC_ONLY_TAGS.has(tag.tagName) && !isNumeric && !isNumberEnum) {
      violations.push({
        fieldName,
        severity: "error",
        message: `@${tag.tagName} is only applicable to numeric types, but '${fieldName}' is ${typeString}`,
      });
    }

    if (STRING_ONLY_TAGS.has(tag.tagName) && !isString && !isStringEnum) {
      violations.push({
        fieldName,
        severity: "error",
        message: `@${tag.tagName} is only applicable to string types, but '${fieldName}' is ${typeString}`,
      });
    }

    if (ARRAY_ONLY_TAGS.has(tag.tagName) && !isArray) {
      violations.push({
        fieldName,
        severity: "error",
        message: `@${tag.tagName} is only applicable to array types, but '${fieldName}' is ${typeString}`,
      });
    }
  }

  return violations;
}
