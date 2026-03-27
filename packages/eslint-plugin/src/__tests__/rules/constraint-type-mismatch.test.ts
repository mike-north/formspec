/**
 * Tests for the constraint-type-mismatch rule.
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
  ],
});
