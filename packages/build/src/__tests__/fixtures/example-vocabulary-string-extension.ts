/**
 * Vocabulary-mode string-backed custom type extension for build-layer tests.
 *
 * Provides a `PostalCode` custom type whose JSON Schema representation is
 * `{ type: "string", format: "postal-code" }`. The extension registers
 * broadenings for `@minLength`, `@maxLength`, and `@pattern` onto
 * vocabulary keywords (`postalMinLength`, `postalMaxLength`, `postalPattern`)
 * so path-targeted broadening tests can assert the literal keyword and a
 * string-typed payload.
 *
 * The type is registered by name (`tsTypeNames: ["PostalCode"]`).
 *
 * @see https://github.com/mike-north/formspec/issues/395
 */

import {
  defineConstraint,
  defineCustomType,
  defineExtension,
  type CustomConstraintRegistration,
  type CustomTypeRegistration,
} from "@formspec/core/internals";

// ---------------------------------------------------------------------------
// Extension ID
// ---------------------------------------------------------------------------

const VOCAB_STRING_EXTENSION_ID = "x-test/vocabulary-string";

// ---------------------------------------------------------------------------
// Payload parsers
// ---------------------------------------------------------------------------

function trimmedString(raw: string): string {
  return raw.trim();
}

// ---------------------------------------------------------------------------
// Vocabulary constraint registrations
// ---------------------------------------------------------------------------

const postalMinLengthConstraint: CustomConstraintRegistration = defineConstraint({
  constraintName: "PostalMinLength",
  compositionRule: "intersect",
  applicableTypes: ["custom"],
  isApplicableToType: (type) => type.kind === "custom",
  emitsVocabularyKeywords: true,
  semanticRole: { family: "postal-length", bound: "lower", inclusive: true },
  toJsonSchema: (payload) => ({ postalMinLength: payload }),
});

const postalMaxLengthConstraint: CustomConstraintRegistration = defineConstraint({
  constraintName: "PostalMaxLength",
  compositionRule: "intersect",
  applicableTypes: ["custom"],
  isApplicableToType: (type) => type.kind === "custom",
  emitsVocabularyKeywords: true,
  semanticRole: { family: "postal-length", bound: "upper", inclusive: true },
  toJsonSchema: (payload) => ({ postalMaxLength: payload }),
});

const postalPatternConstraint: CustomConstraintRegistration = defineConstraint({
  constraintName: "PostalPattern",
  compositionRule: "override",
  applicableTypes: ["custom"],
  isApplicableToType: (type) => type.kind === "custom",
  emitsVocabularyKeywords: true,
  toJsonSchema: (payload) => ({ postalPattern: payload }),
});

// ---------------------------------------------------------------------------
// PostalCode custom type (name-based resolution)
// ---------------------------------------------------------------------------

const postalCodeType: CustomTypeRegistration = defineCustomType({
  typeName: "PostalCode",
  tsTypeNames: ["PostalCode"],
  builtinConstraintBroadenings: [
    { tagName: "minLength", constraintName: "PostalMinLength", parseValue: trimmedString },
    { tagName: "maxLength", constraintName: "PostalMaxLength", parseValue: trimmedString },
    { tagName: "pattern", constraintName: "PostalPattern", parseValue: trimmedString },
  ],
  toJsonSchema: () => ({ type: "string", format: "postal-code" }),
});

export const vocabStringExtension = defineExtension({
  extensionId: VOCAB_STRING_EXTENSION_ID,
  types: [postalCodeType],
  constraints: [postalMinLengthConstraint, postalMaxLengthConstraint, postalPatternConstraint],
});
