/**
 * Tests for the tag-type-check rule.
 *
 * Ensures JSDoc constraints are only applied to fields with compatible
 * TypeScript types (e.g., @minimum only on number fields).
 *
 * Coverage:
 * - Every constraint × every compatible type (positive)
 * - Every constraint × every incompatible type (negative)
 * - Malformed/ignored tag syntax (bare tags, non-numeric, bad path-targets)
 * - PascalCase tag equivalence (@Minimum identical to @minimum)
 * - Path-targeted constraints (@minimum :prop value) skipped entirely
 * - Builtin constraint broadening via extension registry in settings
 *
 * @see docs/002-tsdoc-grammar.md §2.1 (constraint tag type applicability)
 * @see docs/003-json-schema-vocabulary.md §2.6-§2.7 (constraint → keyword mapping)
 * @see https://json-schema.org/understanding-json-schema/reference/numeric#range
 * @see https://json-schema.org/understanding-json-schema/reference/string#length
 * @see https://json-schema.org/understanding-json-schema/reference/array#length
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { tagTypeCheck } from "../../rules/type-compatibility/tag-type-check.js";
import * as vitest from "vitest";

RuleTester.afterAll = vitest.afterAll;
RuleTester.it = vitest.it;
RuleTester.itOnly = vitest.it.only;
RuleTester.describe = vitest.describe;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ["*.ts"],
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Mock extension registry for broadening tests
// ---------------------------------------------------------------------------
// Simulates a registry where "Decimal" is a custom type with a builtin
// constraint broadening for the "minimum" tag (numeric-comparable).
const mockRegistryWithDecimal = {
  findTypeByName(typeName: string) {
    if (typeName === "Decimal") {
      return {
        extensionId: "x-test",
        registration: { typeName: "Decimal" },
      };
    }
    return undefined;
  },
  findBuiltinConstraintBroadening(typeId: string, tagName: string) {
    if (typeId === "x-test/Decimal" && tagName === "minimum") {
      return { extensionId: "x-test", registration: { tagName: "minimum" } };
    }
    return undefined;
  },
};

ruleTester.run("tag-type-check", tagTypeCheck, {
  valid: [
    // -------------------------------------------------------------------------
    // @minimum on number fields
    // -------------------------------------------------------------------------
    // PascalCase
    {
      code: `
        class Form {
          /** @Minimum 0 */
          count!: number;
        }
      `,
    },
    // camelCase — identical to PascalCase
    {
      code: `
        class Form {
          /** @minimum 0 */
          count!: number;
        }
      `,
    },
    // optional field — undefined stripped before type check
    {
      code: `
        class Form {
          /** @Minimum 0 */
          count?: number;
        }
      `,
    },
    // negative and float edge values
    {
      code: `
        class Form {
          /** @Minimum -999.5 */
          temperature!: number;
        }
      `,
    },
    {
      code: `
        class Form {
          /** @Minimum 0 */
          count!: bigint;
        }
      `,
    },

    // -------------------------------------------------------------------------
    // @maximum on number fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @Maximum 100 */
          score!: number;
        }
      `,
    },

    // -------------------------------------------------------------------------
    // @exclusiveMinimum on number fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 0 */
          value!: number;
        }
      `,
    },

    // -------------------------------------------------------------------------
    // @exclusiveMaximum on number fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @ExclusiveMaximum 100 */
          value!: number;
        }
      `,
    },

    // -------------------------------------------------------------------------
    // @multipleOf on number fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @multipleOf 0.01 */
          price!: number;
        }
      `,
    },

    // -------------------------------------------------------------------------
    // Multiple numeric constraints on the same number field
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @Minimum 0 @Maximum 100 */
          score!: number;
        }
      `,
    },

    // -------------------------------------------------------------------------
    // @minLength on string fields
    // -------------------------------------------------------------------------
    // PascalCase
    {
      code: `
        class Form {
          /** @MinLength 1 */
          name!: string;
        }
      `,
    },
    // camelCase — identical to PascalCase
    {
      code: `
        class Form {
          /** @minLength 1 */
          name!: string;
        }
      `,
    },

    // -------------------------------------------------------------------------
    // @maxLength on string fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @MaxLength 255 */
          name!: string;
        }
      `,
    },

    // -------------------------------------------------------------------------
    // @pattern on string fields
    // -------------------------------------------------------------------------
    // PascalCase
    {
      code: `
        class Form {
          /** @Pattern ^[a-z]+$ */
          slug!: string;
        }
      `,
    },
    // camelCase — identical to PascalCase
    {
      code: `
        class Form {
          /** @pattern ^[a-z]+$ */
          slug!: string;
        }
      `,
    },

    // -------------------------------------------------------------------------
    // @minItems on array fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @minItems 1 */
          tags!: string[];
        }
      `,
    },

    // -------------------------------------------------------------------------
    // @maxItems on array fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @maxItems 10 */
          items!: number[];
        }
      `,
    },
    {
      code: `
        class Form {
          /** @uniqueItems */
          tags!: string[];
        }
      `,
    },

    // -------------------------------------------------------------------------
    // No constraints at all — no errors
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          name!: string;
          count!: number;
          tags!: string[];
          active!: boolean;
        }
      `,
    },

    // -------------------------------------------------------------------------
    // Malformed / unrecognized tag syntax — all silently ignored
    // -------------------------------------------------------------------------

    // bare @minimum with no value — not matched by regex, ignored
    {
      code: `
        class Form {
          /** @minimum */
          name!: string;
        }
      `,
    },
    // @minimum with non-numeric value — NaN, dropped from results
    {
      code: `
        class Form {
          /** @minimum abc */
          name!: string;
        }
      `,
    },
    // @minimum with invalid number format (1.2.3 is NaN) — dropped
    {
      code: `
        class Form {
          /** @minimum 1.2.3 */
          name!: string;
        }
      `,
    },
    // bare @pattern with no value — empty string filtered out, ignored
    {
      code: `
        class Form {
          /** @pattern */
          count!: number;
        }
      `,
    },
    // unrecognized tag — not in EXPECTED_TYPES, skipped
    {
      code: `
        class Form {
          /** @unknownTag value */
          count!: number;
        }
      `,
    },
    // @displayName with no value — not a type-check constraint, ignored
    {
      code: `
        class Form {
          /** @displayName */
          name!: string;
        }
      `,
    },

    // -------------------------------------------------------------------------
    // Path-targeted constraints — skipped entirely regardless of field type
    // -------------------------------------------------------------------------

    // @minimum :value targets sub-property on object field
    {
      code: `
        class Form {
          /** @minimum :value 0 */
          amount!: { value: number; currency: string };
        }
      `,
    },
    // @pattern :code targets sub-property on object field
    {
      code: `
        class Form {
          /** @pattern :code ^[A-Z]{3}$ */
          amount!: { value: number; code: string };
        }
      `,
    },
    // @minimum :value on non-object field — path-targeted, still skipped
    {
      code: `
        class Form {
          /** @minimum :value 0 */
          name!: string;
        }
      `,
    },
    // @minimum : (colon, no identifier) — regex does not match :\s as :\w+,
    // so the whole tag falls through without a numeric match
    {
      code: `
        class Form {
          /** @minimum : */
          count!: number;
        }
      `,
    },
    // @minimum :value (no trailing numeric) — path-target lookahead fires but
    // the value group captures nothing parseable as a number, dropped
    {
      code: `
        class Form {
          /** @minimum :value */
          count!: number;
        }
      `,
    },

    // -------------------------------------------------------------------------
    // Builtin constraint broadening via extension registry
    // -------------------------------------------------------------------------
    // @minimum on a custom "Decimal" type is allowed when the extension
    // registry declares a broadening for x-test/Decimal + minimum.
    {
      code: `
        type Decimal = { _brand: "Decimal" };
        class Form {
          /** @minimum 0 */
          price!: Decimal;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: mockRegistryWithDecimal,
        },
      },
    },
    // Multiple numeric constraints on a broadened type — all pass
    {
      code: `
        type Decimal = { _brand: "Decimal" };
        class Form {
          /** @minimum 0 */
          priceA!: Decimal;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: mockRegistryWithDecimal,
        },
      },
    },

    // -------------------------------------------------------------------------
    // Non-constraint tags — annotation, structure, ecosystem categories do
    // NOT impose a field-type requirement. Value-kind describes the tag's
    // *argument*, not the field.
    //
    // Regression: `buildExtraTagDefinition` used to copy the value-kind into
    // `capabilities`, which `getExpectedTypesForTag` then surfaced as an
    // expected field type — causing spurious rejections.
    // -------------------------------------------------------------------------

    // @displayName (annotation / string): any field type is allowed
    {
      code: `
        type MonetaryAmount = { amount: number; currency: string };
        class Form {
          /** @displayName Maximum Credit Amount */
          maximumCreditAmount!: MonetaryAmount;
        }
      `,
    },
    {
      code: `
        class Form {
          /** @displayName Active Flag */
          isActive!: boolean;
        }
      `,
    },

    // @displayName on the real `@formspec/core` Integer brand — a
    // `number` intersected with a symbol-keyed brand property. Mirrors
    // `type Integer = number & { readonly [__integerBrand]: true }`.
    // This is exactly the shape that would previously have been rejected
    // under `capabilities: ["string-like"]` via `getFieldTypeCategory`
    // returning "number" rather than "string".
    {
      code: `
        declare const __integerBrand: unique symbol;
        type Integer = number & { readonly [__integerBrand]: true };
        class Form {
          /** @displayName Item Count */
          count!: Integer;
        }
      `,
    },

    // @order (annotation / signedInteger): order is a UI ordering hint —
    // should work on any field regardless of type
    {
      code: `
        class Form {
          /** @order 3 */
          created!: Date;
        }
      `,
    },

    // @apiName (annotation / string): API-facing name works on any field
    {
      code: `
        class Form {
          /** @apiName legacy_amount */
          amount!: number;
        }
      `,
    },

    // @group (structure / string): UI grouping hint works on any field
    {
      code: `
        type MonetaryAmount = { amount: number; currency: string };
        class Form {
          /** @group Advanced */
          limit!: MonetaryAmount;
        }
      `,
    },

    // @example (ecosystem / string): example text works regardless of type
    {
      code: `
        class Form {
          /** @example 2024-01-15 */
          issuedOn!: Date;
        }
      `,
    },

    // @remarks (ecosystem / string): free-form remarks work on any field
    {
      code: `
        class Form {
          /** @remarks Historical note: migrated from v1. */
          legacyId!: number;
        }
      `,
    },

    // @see (ecosystem / string): references work on any field
    {
      code: `
        class Form {
          /** @see https://docs.example.com/fields/count */
          count!: number;
        }
      `,
    },

    // @placeholder (annotation / string) and @format (annotation / string)
    // on non-string fields — both placeholder and format are presentational
    // hints that should not constrain the field type.
    {
      code: `
        class Form {
          /** @placeholder Enter an amount */
          amount!: number;
        }
      `,
    },
    {
      code: `
        class Form {
          /** @format date */
          issuedOn!: Date;
        }
      `,
    },
  ],
  invalid: [
    // -------------------------------------------------------------------------
    // @minimum on non-number fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @Minimum 0 */
          name!: string;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @Minimum 0 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @Minimum 0 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },

    // -------------------------------------------------------------------------
    // @maximum on non-number fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @Maximum 100 */
          name!: string;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @Maximum 1 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @Maximum 10 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @uniqueItems */
          name!: string;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },

    // -------------------------------------------------------------------------
    // @exclusiveMinimum on non-number fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 0 */
          name!: string;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 0 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 0 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },

    // -------------------------------------------------------------------------
    // @exclusiveMaximum on non-number fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @ExclusiveMaximum 100 */
          name!: string;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @ExclusiveMaximum 1 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @ExclusiveMaximum 10 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },

    // -------------------------------------------------------------------------
    // @multipleOf on non-number fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @multipleOf 0.01 */
          name!: string;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @multipleOf 1 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @multipleOf 2 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },

    // -------------------------------------------------------------------------
    // @minLength on non-string fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @MinLength 1 */
          count!: number;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @MinLength 5 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @MinLength 1 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },

    // -------------------------------------------------------------------------
    // @maxLength on non-string fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @MaxLength 100 */
          score!: number;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @MaxLength 10 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @MaxLength 10 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },

    // -------------------------------------------------------------------------
    // @pattern on non-string fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @Pattern ^[0-9]+$ */
          count!: number;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @Pattern true|false */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @Pattern ^[a-z]+$ */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },

    // -------------------------------------------------------------------------
    // @minItems on non-array fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @minItems 1 */
          name!: string;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @minItems 1 */
          count!: number;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @minItems 1 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },

    // -------------------------------------------------------------------------
    // @maxItems on non-array fields
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @maxItems 10 */
          name!: string;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @maxItems 10 */
          count!: number;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
    {
      code: `
        class Form {
          /** @maxItems 10 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },

    // -------------------------------------------------------------------------
    // Multiple wrong-type constraints produce multiple errors
    // -------------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @Minimum 0 @Maximum 100 */
          label!: string;
        }
      `,
      errors: [{ messageId: "typeMismatch" }, { messageId: "typeMismatch" }],
    },

    // -------------------------------------------------------------------------
    // Builtin constraint broadening: non-broadened tag still reports error
    // -------------------------------------------------------------------------
    // @maximum is not broadened for x-test/Decimal in the mock registry,
    // so it still produces a type mismatch.
    {
      code: `
        type Decimal = { _brand: "Decimal" };
        class Form {
          /** @maximum 100 */
          price!: Decimal;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: mockRegistryWithDecimal,
        },
      },
      errors: [{ messageId: "typeMismatch" }],
    },
    // Without a registry, custom types have no broadening and still fail.
    {
      code: `
        type Decimal = { _brand: "Decimal" };
        class Form {
          /** @minimum 0 */
          price!: Decimal;
        }
      `,
      errors: [{ messageId: "typeMismatch" }],
    },
  ],
});
