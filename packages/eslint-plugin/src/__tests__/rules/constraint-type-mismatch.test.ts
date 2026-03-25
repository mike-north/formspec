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
    // @Minimum on optional number field — valid (string | undefined strips to number)
    {
      code: `
        class Form {
          /** @Minimum 0 */
          count?: number;
        }
      `,
    },
    // No constraints at all — valid
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
    // @multipleOf on number field — valid
    {
      code: `
        class Form {
          /** @multipleOf 0.01 */
          price!: number;
        }
      `,
    },
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
    // Path-targeted constraints should be skipped — @minimum targets a sub-property, not the field itself
    {
      code: `
        class Form {
          /** @minimum :value 0 */
          amount!: { value: number; currency: string };
        }
      `,
    },
    // Path-targeted @pattern should be skipped
    {
      code: `
        class Form {
          /** @pattern :code ^[A-Z]{3}$ */
          amount!: { value: number; code: string };
        }
      `,
    },
  ],
  invalid: [
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
    // Multiple wrong constraints produce multiple errors
    {
      code: `
        class Form {
          /** @Minimum 0 @Maximum 100 */
          label!: string;
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }, { messageId: "numericOnNonNumber" }],
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
  ],
});
