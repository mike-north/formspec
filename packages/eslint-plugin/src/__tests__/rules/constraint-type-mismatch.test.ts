/**
 * Tests for the constraint-type-mismatch rule.
 *
 * Ensures JSDoc constraints are only applied to fields with compatible
 * TypeScript types (e.g., @Minimum only on number fields).
 *
 * @see https://json-schema.org/understanding-json-schema/reference/numeric#range
 * @see https://json-schema.org/understanding-json-schema/reference/string#length
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { constraintTypeMismatch } from "../../rules/constraint-type-mismatch.js";
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

ruleTester.run("constraint-type-mismatch", constraintTypeMismatch, {
  valid: [
    // -----------------------------------------------------------------------
    // Numeric constraints on number fields
    // -----------------------------------------------------------------------
    // @Minimum on number field — valid
    {
      code: `
        class Form {
          /** @Minimum 0 */
          count!: number;
        }
      `,
    },
    // @Maximum on number field — valid
    {
      code: `
        class Form {
          /** @Maximum 100 */
          score!: number;
        }
      `,
    },
    // @ExclusiveMinimum on number field — valid
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 0 */
          value!: number;
        }
      `,
    },
    // @ExclusiveMaximum on number field — valid
    {
      code: `
        class Form {
          /** @ExclusiveMaximum 100 */
          value!: number;
        }
      `,
    },
    // @multipleOf on number field — valid
    {
      code: `
        class Form {
          /** @multipleOf 0.01 */
          price!: number;
        }
      `,
    },
    // Edge values: zero, negative, float
    {
      code: `
        class Form {
          /** @Minimum -999.5 */
          temperature!: number;
        }
      `,
    },
    // -----------------------------------------------------------------------
    // String constraints on string fields
    // -----------------------------------------------------------------------
    // @MinLength on string field — valid
    {
      code: `
        class Form {
          /** @MinLength 1 */
          name!: string;
        }
      `,
    },
    // @MaxLength on string field — valid
    {
      code: `
        class Form {
          /** @MaxLength 255 */
          name!: string;
        }
      `,
    },
    // @Pattern on string field — valid
    {
      code: `
        class Form {
          /** @Pattern ^[a-z]+$ */
          slug!: string;
        }
      `,
    },
    // -----------------------------------------------------------------------
    // Array constraints on array fields
    // -----------------------------------------------------------------------
    // @minItems on array field — valid
    {
      code: `
        class Form {
          /** @minItems 1 */
          tags!: string[];
        }
      `,
    },
    // @maxItems on array field — valid
    {
      code: `
        class Form {
          /** @maxItems 10 */
          items!: number[];
        }
      `,
    },
    // -----------------------------------------------------------------------
    // Optional fields (undefined stripped)
    // -----------------------------------------------------------------------
    // @Minimum on optional number field — valid (undefined stripped)
    {
      code: `
        class Form {
          /** @Minimum 0 */
          count?: number;
        }
      `,
    },
    // -----------------------------------------------------------------------
    // No constraints
    // -----------------------------------------------------------------------
    {
      code: `
        class Form {
          name!: string;
          count!: number;
        }
      `,
    },
    // Multiple numeric constraints on number field — all valid
    {
      code: `
        class Form {
          /** @Minimum 0 @Maximum 100 */
          score!: number;
        }
      `,
    },
    // -----------------------------------------------------------------------
    // Malformed / unrecognized tags — silently ignored, no errors
    // -----------------------------------------------------------------------
    // Bare @minimum with no value — ignored
    {
      code: `
        class Form {
          /** @minimum */
          name!: string;
        }
      `,
    },
    // @minimum with non-numeric value — ignored
    {
      code: `
        class Form {
          /** @minimum abc */
          name!: string;
        }
      `,
    },
    // @minimum with invalid number format — ignored
    {
      code: `
        class Form {
          /** @minimum 1.2.3 */
          name!: string;
        }
      `,
    },
    // Unrecognized tag — ignored
    {
      code: `
        class Form {
          /** @unknownTag value */
          count!: number;
        }
      `,
    },
    // PascalCase @Maximum on number field — identical behaviour to camelCase
    {
      code: `
        class Form {
          /** @Maximum 50 @Minimum 0 */
          score!: number;
        }
      `,
    },
    // PascalCase @MaxLength on string field — identical behaviour to camelCase
    {
      code: `
        class Form {
          /** @MaxLength 64 */
          slug!: string;
        }
      `,
    },
    // -----------------------------------------------------------------------
    // Path-targeted constraints — skipped entirely (target sub-property)
    // -----------------------------------------------------------------------
    // @minimum :value on object field — skipped, no type-mismatch
    {
      code: `
        class Form {
          /** @minimum :value 0 */
          amount!: { value: number; currency: string };
        }
      `,
    },
    // @pattern :code on object field — skipped
    {
      code: `
        class Form {
          /** @pattern :code ^[A-Z]{3}$ */
          amount!: { value: number; code: string };
        }
      `,
    },
    // Path-targeted constraints with contradicting values — still skipped
    {
      code: `
        class Form {
          /** @minimum :value 100 @maximum :value 50 */
          amount!: { value: number };
        }
      `,
    },
  ],
  invalid: [
    // -----------------------------------------------------------------------
    // @minimum / @maximum / @exclusiveMinimum / @exclusiveMaximum / @multipleOf
    // on non-number fields
    // -----------------------------------------------------------------------
    // @Minimum on string field
    {
      code: `
        class Form {
          /** @Minimum 0 */
          name!: string;
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @Minimum on boolean field
    {
      code: `
        class Form {
          /** @Minimum 0 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @Minimum on array field
    {
      code: `
        class Form {
          /** @Minimum 0 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @Maximum on string field
    {
      code: `
        class Form {
          /** @Maximum 100 */
          name!: string;
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @Maximum on boolean field
    {
      code: `
        class Form {
          /** @Maximum 1 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @Maximum on array field
    {
      code: `
        class Form {
          /** @Maximum 10 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @ExclusiveMinimum on string field
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 0 */
          name!: string;
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @ExclusiveMinimum on boolean field
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 0 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @ExclusiveMinimum on array field
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 0 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @ExclusiveMaximum on string field
    {
      code: `
        class Form {
          /** @ExclusiveMaximum 100 */
          name!: string;
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @ExclusiveMaximum on boolean field
    {
      code: `
        class Form {
          /** @ExclusiveMaximum 1 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @ExclusiveMaximum on array field
    {
      code: `
        class Form {
          /** @ExclusiveMaximum 10 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @multipleOf on string field
    {
      code: `
        class Form {
          /** @multipleOf 0.01 */
          name!: string;
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @multipleOf on boolean field
    {
      code: `
        class Form {
          /** @multipleOf 1 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @multipleOf on array field
    {
      code: `
        class Form {
          /** @multipleOf 2 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // -----------------------------------------------------------------------
    // @minLength / @maxLength / @pattern on non-string fields
    // -----------------------------------------------------------------------
    // @MinLength on number field
    {
      code: `
        class Form {
          /** @MinLength 1 */
          count!: number;
        }
      `,
      errors: [{ messageId: "stringOnNonString" }],
    },
    // @MinLength on boolean field
    {
      code: `
        class Form {
          /** @MinLength 5 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "stringOnNonString" }],
    },
    // @MinLength on array field
    {
      code: `
        class Form {
          /** @MinLength 1 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "stringOnNonString" }],
    },
    // @MaxLength on number field
    {
      code: `
        class Form {
          /** @MaxLength 100 */
          score!: number;
        }
      `,
      errors: [{ messageId: "stringOnNonString" }],
    },
    // @MaxLength on boolean field
    {
      code: `
        class Form {
          /** @MaxLength 10 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "stringOnNonString" }],
    },
    // @MaxLength on array field
    {
      code: `
        class Form {
          /** @MaxLength 10 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "stringOnNonString" }],
    },
    // @Pattern on number field
    {
      code: `
        class Form {
          /** @Pattern ^[0-9]+$ */
          count!: number;
        }
      `,
      errors: [{ messageId: "stringOnNonString" }],
    },
    // @Pattern on boolean field
    {
      code: `
        class Form {
          /** @Pattern true|false */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "stringOnNonString" }],
    },
    // @Pattern on array field
    {
      code: `
        class Form {
          /** @Pattern ^[a-z]+$ */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "stringOnNonString" }],
    },
    // -----------------------------------------------------------------------
    // @minItems / @maxItems on non-array fields
    // -----------------------------------------------------------------------
    // @minItems on string field
    {
      code: `
        class Form {
          /** @minItems 1 */
          name!: string;
        }
      `,
      errors: [{ messageId: "arrayOnNonArray" }],
    },
    // @minItems on number field
    {
      code: `
        class Form {
          /** @minItems 1 */
          count!: number;
        }
      `,
      errors: [{ messageId: "arrayOnNonArray" }],
    },
    // @minItems on boolean field
    {
      code: `
        class Form {
          /** @minItems 1 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "arrayOnNonArray" }],
    },
    // @maxItems on string field
    {
      code: `
        class Form {
          /** @maxItems 10 */
          name!: string;
        }
      `,
      errors: [{ messageId: "arrayOnNonArray" }],
    },
    // @maxItems on number field
    {
      code: `
        class Form {
          /** @maxItems 10 */
          count!: number;
        }
      `,
      errors: [{ messageId: "arrayOnNonArray" }],
    },
    // @maxItems on boolean field
    {
      code: `
        class Form {
          /** @maxItems 10 */
          active!: boolean;
        }
      `,
      errors: [{ messageId: "arrayOnNonArray" }],
    },
    // -----------------------------------------------------------------------
    // Multiple constraints — all wrong types produce multiple errors
    // -----------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @Minimum 0 @Maximum 100 */
          label!: string;
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }, { messageId: "numericOnNonNumber" }],
    },
  ],
});
