/**
 * Vocabulary-mode Decimal extension for build-layer tests.
 *
 * Unlike the `example-numeric-extension` fixture (which uses vendor-prefixed
 * keywords like `x-formspec-decimal-minimum`), this extension registers
 * constraints with `emitsVocabularyKeywords: true` so each constraint emits a
 * camelCase vocabulary keyword directly (e.g. `decimalMinimum`, `decimalMaximum`).
 *
 * This makes path-targeted broadening assertions straightforward: tests can
 * assert the literal camelCase keyword name and a string-typed payload rather
 * than having to account for vendor-prefix construction.
 *
 * Two variants are exported:
 *
 * - **Name-based** (`vocabDecimalByNameExtension`): the custom type is
 *   registered via `tsTypeNames: ["VocabDecimal", "Decimal"]` so the build
 *   resolves it by either source-level type alias name.
 *
 * - **Brand-based** (`vocabDecimalByBrandExtension`): the custom type is
 *   registered via `brand: "__vocabDecimalBrand"` so the build resolves it
 *   structurally through the unique-symbol computed property key.
 *
 * Both variants use the same 5 constraint broadenings and the same vocabulary
 * constraint registrations; only the type detection mechanism differs.
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

const VOCAB_DECIMAL_EXTENSION_ID = "x-test/vocabulary-decimal";

// ---------------------------------------------------------------------------
// Constraint payload identity parser
//
// For the vocabulary-mode fixture we intentionally keep the payload as the raw
// trimmed string rather than parsing it into a structured Decimal value. This
// keeps the fixture lightweight and makes test assertions simple: the emitted
// JSON Schema value is always the original tag argument as a string (e.g. "0",
// "100", "0.01").
// ---------------------------------------------------------------------------

function trimmedString(raw: string): string {
  return raw.trim();
}

// ---------------------------------------------------------------------------
// Vocabulary constraint registrations (shared by both name and brand variants)
//
// Each constraint uses `emitsVocabularyKeywords: true` so the build pipeline
// does not require the vendor-prefix guard. The `toJsonSchema` callback emits
// a plain camelCase keyword with the raw string payload.
// ---------------------------------------------------------------------------

const decimalMinimumConstraint: CustomConstraintRegistration = defineConstraint({
  constraintName: "DecimalMinimum",
  compositionRule: "intersect",
  applicableTypes: ["custom"],
  isApplicableToType: (type) => type.kind === "custom",
  emitsVocabularyKeywords: true,
  semanticRole: { family: "vocab-decimal-bound", bound: "lower", inclusive: true },
  toJsonSchema: (payload) => ({ decimalMinimum: payload }),
});

const decimalMaximumConstraint: CustomConstraintRegistration = defineConstraint({
  constraintName: "DecimalMaximum",
  compositionRule: "intersect",
  applicableTypes: ["custom"],
  isApplicableToType: (type) => type.kind === "custom",
  emitsVocabularyKeywords: true,
  semanticRole: { family: "vocab-decimal-bound", bound: "upper", inclusive: true },
  toJsonSchema: (payload) => ({ decimalMaximum: payload }),
});

const decimalExclusiveMinimumConstraint: CustomConstraintRegistration = defineConstraint({
  constraintName: "DecimalExclusiveMinimum",
  compositionRule: "intersect",
  applicableTypes: ["custom"],
  isApplicableToType: (type) => type.kind === "custom",
  emitsVocabularyKeywords: true,
  semanticRole: { family: "vocab-decimal-bound", bound: "lower", inclusive: false },
  toJsonSchema: (payload) => ({ decimalExclusiveMinimum: payload }),
});

const decimalExclusiveMaximumConstraint: CustomConstraintRegistration = defineConstraint({
  constraintName: "DecimalExclusiveMaximum",
  compositionRule: "intersect",
  applicableTypes: ["custom"],
  isApplicableToType: (type) => type.kind === "custom",
  emitsVocabularyKeywords: true,
  semanticRole: { family: "vocab-decimal-bound", bound: "upper", inclusive: false },
  toJsonSchema: (payload) => ({ decimalExclusiveMaximum: payload }),
});

const decimalMultipleOfConstraint: CustomConstraintRegistration = defineConstraint({
  constraintName: "DecimalMultipleOf",
  compositionRule: "intersect",
  applicableTypes: ["custom"],
  isApplicableToType: (type) => type.kind === "custom",
  emitsVocabularyKeywords: true,
  toJsonSchema: (payload) => ({ decimalMultipleOf: payload }),
});

// ---------------------------------------------------------------------------
// Shared broadening registrations (same set for both name and brand variants)
// ---------------------------------------------------------------------------

const BUILTIN_BROADENINGS = [
  { tagName: "minimum" as const, constraintName: "DecimalMinimum", parseValue: trimmedString },
  { tagName: "maximum" as const, constraintName: "DecimalMaximum", parseValue: trimmedString },
  {
    tagName: "exclusiveMinimum" as const,
    constraintName: "DecimalExclusiveMinimum",
    parseValue: trimmedString,
  },
  {
    tagName: "exclusiveMaximum" as const,
    constraintName: "DecimalExclusiveMaximum",
    parseValue: trimmedString,
  },
  {
    tagName: "multipleOf" as const,
    constraintName: "DecimalMultipleOf",
    parseValue: trimmedString,
  },
] as const;

// ---------------------------------------------------------------------------
// Name-based custom type (resolved by tsTypeNames)
// ---------------------------------------------------------------------------

const vocabDecimalByNameType: CustomTypeRegistration = defineCustomType({
  typeName: "VocabDecimal",
  // Accept both "VocabDecimal" and "Decimal" source aliases so all path-target
  // and schema-generation tests can share this single registration.
  tsTypeNames: ["VocabDecimal", "Decimal"],
  builtinConstraintBroadenings: [...BUILTIN_BROADENINGS],
  toJsonSchema: () => ({ type: "string", format: "decimal" }),
});

export const vocabDecimalByNameExtension = defineExtension({
  extensionId: VOCAB_DECIMAL_EXTENSION_ID,
  types: [vocabDecimalByNameType],
  constraints: [
    decimalMinimumConstraint,
    decimalMaximumConstraint,
    decimalExclusiveMinimumConstraint,
    decimalExclusiveMaximumConstraint,
    decimalMultipleOfConstraint,
  ],
});

// ---------------------------------------------------------------------------
// Brand-based custom type (resolved by unique-symbol computed property key)
// ---------------------------------------------------------------------------

const vocabDecimalByBrandType: CustomTypeRegistration = defineCustomType({
  typeName: "VocabDecimalBranded",
  brand: "__vocabDecimalBrand",
  builtinConstraintBroadenings: [...BUILTIN_BROADENINGS],
  toJsonSchema: () => ({ type: "string", format: "decimal" }),
});

const VOCAB_DECIMAL_BRAND_EXTENSION_ID = "x-test/vocabulary-decimal-brand";

export const vocabDecimalByBrandExtension = defineExtension({
  extensionId: VOCAB_DECIMAL_BRAND_EXTENSION_ID,
  types: [vocabDecimalByBrandType],
  constraints: [
    decimalMinimumConstraint,
    decimalMaximumConstraint,
    decimalExclusiveMinimumConstraint,
    decimalExclusiveMaximumConstraint,
    decimalMultipleOfConstraint,
  ],
});
