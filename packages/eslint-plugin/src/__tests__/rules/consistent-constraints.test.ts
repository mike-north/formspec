/**
 * Tests for no-contradictions rule.
 *
 * Coverage:
 * - Every valid constraint pair (min < max, equal for inclusive, etc.)
 * - Every invalid constraint pair (min > max, exclusive bounds equal, etc.)
 * - Conflicting same-side bounds (@minimum + @exclusiveMinimum, etc.)
 * - Mixed exclusive/inclusive impossible ranges
 * - Path-targeted constraints skipped entirely
 * - Edge values (negative, float, zero)
 *
 * @see docs/002-tsdoc-grammar.md §2.1 (constraint contradiction detection)
 * @see docs/005-numeric-types.md §7.2 (numeric bound consistency)
 * @see https://json-schema.org/understanding-json-schema/reference/numeric#range
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { noContradictions } from "../../rules/constraint-validation/no-contradictions.js";
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

ruleTester.run("no-contradictions", noContradictions, {
  valid: [
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
    // @ExclusiveMinimum < @ExclusiveMaximum
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 0 @ExclusiveMaximum 100 */
          value!: number;
        }
      `,
    },
    // @MinLength < @MaxLength
    {
      code: `
        class Form {
          /** @MinLength 1 @MaxLength 100 */
          name!: string;
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
    // @Minimum with @ExclusiveMaximum where exclusive max > min
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
    // @MinLength == @MaxLength (valid: fixed-length string)
    {
      code: `
        class Form {
          /** @MinLength 5 @MaxLength 5 */
          name!: string;
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
    // @Minimum(50) with @ExclusiveMaximum(51) — exclusiveMax strictly greater than min
    {
      code: `
        class Form {
          /** @Minimum 50 @ExclusiveMaximum 51 */
          value!: number;
        }
      `,
    },
    // @ExclusiveMinimum(49) with @Maximum(50) — max strictly greater than exclusiveMin
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 49 @Maximum 50 */
          value!: number;
        }
      `,
    },
    // No constraints at all
    {
      code: `
        class Form {
          value!: number;
        }
      `,
    },
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
  ],
  invalid: [
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
    // @ExclusiveMinimum >= @ExclusiveMaximum (equal is invalid for exclusive bounds)
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
    // @MinLength > @MaxLength
    {
      code: `
        class Form {
          /** @MinLength 100 @MaxLength 10 */
          name!: string;
        }
      `,
      errors: [{ messageId: "minLengthGreaterThanMaxLength" }],
    },
    // Conflicting minimum bounds: @Minimum + @ExclusiveMinimum — same values
    {
      code: `
        class Form {
          /** @Minimum 0 @ExclusiveMinimum 0 */
          value!: number;
        }
      `,
      errors: [{ messageId: "conflictingMinimumBounds" }],
    },
    // Conflicting minimum bounds: @Minimum + @ExclusiveMinimum — different values
    {
      code: `
        class Form {
          /** @Minimum 10 @ExclusiveMinimum 5 */
          value!: number;
        }
      `,
      errors: [{ messageId: "conflictingMinimumBounds" }],
    },
    // Conflicting maximum bounds: @Maximum + @ExclusiveMaximum — same values
    {
      code: `
        class Form {
          /** @Maximum 100 @ExclusiveMaximum 100 */
          value!: number;
        }
      `,
      errors: [{ messageId: "conflictingMaximumBounds" }],
    },
    // Conflicting maximum bounds: @Maximum + @ExclusiveMaximum — different values
    {
      code: `
        class Form {
          /** @Maximum 90 @ExclusiveMaximum 100 */
          value!: number;
        }
      `,
      errors: [{ messageId: "conflictingMaximumBounds" }],
    },
    // @ExclusiveMaximum(n) where n <= @Minimum(m)
    {
      code: `
        class Form {
          /** @Minimum 50 @ExclusiveMaximum 50 */
          value!: number;
        }
      `,
      errors: [{ messageId: "exclusiveMaxLessOrEqualMin" }],
    },
    // @ExclusiveMaximum(n) where n < @Minimum(m)
    {
      code: `
        class Form {
          /** @Minimum 100 @ExclusiveMaximum 50 */
          value!: number;
        }
      `,
      errors: [{ messageId: "exclusiveMaxLessOrEqualMin" }],
    },
    // @ExclusiveMinimum(m) + @Maximum(n) where n == m (invalid: no valid values)
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 50 @Maximum 50 */
          value!: number;
        }
      `,
      errors: [{ messageId: "maximumLessOrEqualExclusiveMin" }],
    },
    // @ExclusiveMinimum(m) + @Maximum(n) where n < m (invalid)
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 100 @Maximum 50 */
          value!: number;
        }
      `,
      errors: [{ messageId: "maximumLessOrEqualExclusiveMin" }],
    },
    // @minItems > @maxItems — invalid
    {
      code: `
        class Form {
          /** @minItems 10 @maxItems 1 */
          tags!: string[];
        }
      `,
      errors: [{ messageId: "minItemsGreaterThanMaxItems" }],
    },
    {
      code: `
        class Form {
          /** @minimum :value 100 @maximum :value 50 */
          amount!: { value: number };
        }
      `,
      errors: [{ messageId: "minimumGreaterThanMaximum" }],
    },
    {
      code: `
        class Form {
          /** @exclusiveMinimum :value 50 @exclusiveMaximum :value 50 */
          amount!: { value: number };
        }
      `,
      errors: [{ messageId: "exclusiveMinGreaterOrEqualMax" }],
    },
    {
      code: `
        class Form {
          /** @minimum :value 0 @exclusiveMinimum :value 0 */
          amount!: { value: number };
        }
      `,
      errors: [{ messageId: "conflictingMinimumBounds" }],
    },
  ],
});
