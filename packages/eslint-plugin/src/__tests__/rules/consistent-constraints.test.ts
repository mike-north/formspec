/**
 * Tests for consistent-constraints rule.
 *
 * @see https://json-schema.org/understanding-json-schema/reference/numeric#range
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { consistentConstraints } from "../../rules/consistent-constraints.js";
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

ruleTester.run("consistent-constraints", consistentConstraints, {
  valid: [
    // -----------------------------------------------------------------------
    // @minimum / @maximum — inclusive numeric bounds
    // -----------------------------------------------------------------------
    // @Minimum < @Maximum
    {
      code: `
        class Form {
          /** @Minimum 0 @Maximum 100 */
          value!: number;
        }
      `,
    },
    // @Minimum == @Maximum (equal is valid for inclusive bounds)
    {
      code: `
        class Form {
          /** @Minimum 50 @Maximum 50 */
          value!: number;
        }
      `,
    },
    // Only @Minimum (no @Maximum)
    {
      code: `
        class Form {
          /** @Minimum 0 */
          value!: number;
        }
      `,
    },
    // Only @Maximum (no @Minimum)
    {
      code: `
        class Form {
          /** @Maximum 100 */
          value!: number;
        }
      `,
    },
    // Negative values: @Minimum(-100) < @Maximum(-50) is valid
    {
      code: `
        class Form {
          /** @Minimum -100 @Maximum -50 */
          value!: number;
        }
      `,
    },
    // Float bounds
    {
      code: `
        class Form {
          /** @Minimum 0.5 @Maximum 0.9 */
          ratio!: number;
        }
      `,
    },
    // -----------------------------------------------------------------------
    // @exclusiveMinimum / @exclusiveMaximum — exclusive numeric bounds
    // -----------------------------------------------------------------------
    // @ExclusiveMinimum < @ExclusiveMaximum
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 0 @ExclusiveMaximum 100 */
          value!: number;
        }
      `,
    },
    // -----------------------------------------------------------------------
    // Mixed exclusive/inclusive bounds
    // -----------------------------------------------------------------------
    // @Minimum with @ExclusiveMaximum where exclusive max > min (valid)
    {
      code: `
        class Form {
          /** @Minimum 0 @ExclusiveMaximum 100 */
          value!: number;
        }
      `,
    },
    // @ExclusiveMinimum < @Maximum (valid: exclusive min below inclusive max)
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 0 @Maximum 100 */
          value!: number;
        }
      `,
    },
    // @Minimum equals @ExclusiveMaximum – still invalid (exclusiveMax must be > min)
    // so we test the valid side: ExclusiveMaximum strictly greater than Minimum
    {
      code: `
        class Form {
          /** @Minimum 50 @ExclusiveMaximum 51 */
          value!: number;
        }
      `,
    },
    // @ExclusiveMinimum strictly less than @Maximum (valid)
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 49 @Maximum 50 */
          value!: number;
        }
      `,
    },
    // -----------------------------------------------------------------------
    // @minLength / @maxLength
    // -----------------------------------------------------------------------
    // @MinLength < @MaxLength
    {
      code: `
        class Form {
          /** @MinLength 1 @MaxLength 100 */
          name!: string;
        }
      `,
    },
    // @MinLength == @MaxLength (valid: fixed-length string)
    {
      code: `
        class Form {
          /** @MinLength 5 @MaxLength 5 */
          name!: string;
        }
      `,
    },
    // -----------------------------------------------------------------------
    // @minItems / @maxItems
    // -----------------------------------------------------------------------
    // @minItems < @maxItems — valid
    {
      code: `
        class Form {
          /** @minItems 1 @maxItems 10 */
          tags!: string[];
        }
      `,
    },
    // @minItems == @maxItems — valid (fixed-length array)
    {
      code: `
        class Form {
          /** @minItems 5 @maxItems 5 */
          tags!: string[];
        }
      `,
    },
    // -----------------------------------------------------------------------
    // No constraints at all
    // -----------------------------------------------------------------------
    {
      code: `
        class Form {
          value!: number;
        }
      `,
    },
    // -----------------------------------------------------------------------
    // Path-targeted constraints — skipped entirely
    // -----------------------------------------------------------------------
    // Path-targeted contradicting bounds — skipped, no error
    {
      code: `
        class Form {
          /** @minimum :value 100 @maximum :value 50 */
          amount!: { value: number };
        }
      `,
    },
    // Path-targeted conflicting exclusive bounds — skipped
    {
      code: `
        class Form {
          /** @exclusiveMinimum :value 50 @exclusiveMaximum :value 50 */
          amount!: { value: number };
        }
      `,
    },
    // Path-targeted conflicting bound types — skipped
    {
      code: `
        class Form {
          /** @minimum :value 0 @exclusiveMinimum :value 0 */
          amount!: { value: number };
        }
      `,
    },
  ],
  invalid: [
    // -----------------------------------------------------------------------
    // @minimum > @maximum
    // -----------------------------------------------------------------------
    // @Minimum > @Maximum
    {
      code: `
        class Form {
          /** @Minimum 100 @Maximum 50 */
          value!: number;
        }
      `,
      errors: [{ messageId: "minimumGreaterThanMaximum" }],
    },
    // Negative values: @Minimum(-50) > @Maximum(-100) is invalid
    {
      code: `
        class Form {
          /** @Minimum -50 @Maximum -100 */
          value!: number;
        }
      `,
      errors: [{ messageId: "minimumGreaterThanMaximum" }],
    },
    // -----------------------------------------------------------------------
    // @exclusiveMinimum >= @exclusiveMaximum
    // -----------------------------------------------------------------------
    // @ExclusiveMinimum == @ExclusiveMaximum (equal is invalid for exclusive bounds)
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 50 @ExclusiveMaximum 50 */
          value!: number;
        }
      `,
      errors: [{ messageId: "exclusiveMinGreaterOrEqualMax" }],
    },
    // @ExclusiveMinimum > @ExclusiveMaximum
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 100 @ExclusiveMaximum 50 */
          value!: number;
        }
      `,
      errors: [{ messageId: "exclusiveMinGreaterOrEqualMax" }],
    },
    // -----------------------------------------------------------------------
    // @minLength > @maxLength
    // -----------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @MinLength 100 @MaxLength 10 */
          name!: string;
        }
      `,
      errors: [{ messageId: "minLengthGreaterThanMaxLength" }],
    },
    // -----------------------------------------------------------------------
    // @minItems > @maxItems
    // -----------------------------------------------------------------------
    {
      code: `
        class Form {
          /** @minItems 10 @maxItems 1 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "minItemsGreaterThanMaxItems" }],
    },
    // -----------------------------------------------------------------------
    // Conflicting bound types: both inclusive and exclusive on same side
    // -----------------------------------------------------------------------
    // @Minimum + @ExclusiveMinimum — conflicting lower bounds
    {
      code: `
        class Form {
          /** @Minimum 0 @ExclusiveMinimum 0 */
          value!: number;
        }
      `,
      errors: [{ messageId: "conflictingMinimumBounds" }],
    },
    // @Minimum + @ExclusiveMinimum with different values — still conflicting
    {
      code: `
        class Form {
          /** @Minimum 10 @ExclusiveMinimum 5 */
          value!: number;
        }
      `,
      errors: [{ messageId: "conflictingMinimumBounds" }],
    },
    // @Maximum + @ExclusiveMaximum — conflicting upper bounds
    {
      code: `
        class Form {
          /** @Maximum 100 @ExclusiveMaximum 100 */
          value!: number;
        }
      `,
      errors: [{ messageId: "conflictingMaximumBounds" }],
    },
    // @Maximum + @ExclusiveMaximum with different values — still conflicting
    {
      code: `
        class Form {
          /** @Maximum 90 @ExclusiveMaximum 100 */
          value!: number;
        }
      `,
      errors: [{ messageId: "conflictingMaximumBounds" }],
    },
    // -----------------------------------------------------------------------
    // Mixed exclusive/inclusive: impossible ranges
    // -----------------------------------------------------------------------
    // @exclusiveMaximum(n) <= @minimum(m): n == m is invalid
    {
      code: `
        class Form {
          /** @Minimum 50 @ExclusiveMaximum 50 */
          value!: number;
        }
      `,
      errors: [{ messageId: "exclusiveMaxLessOrEqualMin" }],
    },
    // @exclusiveMaximum(n) < @minimum(m)
    {
      code: `
        class Form {
          /** @Minimum 100 @ExclusiveMaximum 50 */
          value!: number;
        }
      `,
      errors: [{ messageId: "exclusiveMaxLessOrEqualMin" }],
    },
    // @maximum(n) <= @exclusiveMinimum(m): n == m is invalid (no valid values)
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 50 @Maximum 50 */
          value!: number;
        }
      `,
      errors: [{ messageId: "maximumLessOrEqualExclusiveMin" }],
    },
    // @maximum(n) < @exclusiveMinimum(m)
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 100 @Maximum 50 */
          value!: number;
        }
      `,
      errors: [{ messageId: "maximumLessOrEqualExclusiveMin" }],
    },
  ],
});
