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
    // @Minimum < @Maximum
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        function Maximum(n: number) { return () => {}; }
        class Form {
          @Minimum(0)
          @Maximum(100)
          value!: number;
        }
      `,
    },
    // @Minimum == @Maximum (equal is valid for inclusive bounds)
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        function Maximum(n: number) { return () => {}; }
        class Form {
          @Minimum(50)
          @Maximum(50)
          value!: number;
        }
      `,
    },
    // @ExclusiveMinimum < @ExclusiveMaximum
    {
      code: `
        function ExclusiveMinimum(n: number) { return () => {}; }
        function ExclusiveMaximum(n: number) { return () => {}; }
        class Form {
          @ExclusiveMinimum(0)
          @ExclusiveMaximum(100)
          value!: number;
        }
      `,
    },
    // @MinLength < @MaxLength
    {
      code: `
        function MinLength(n: number) { return () => {}; }
        function MaxLength(n: number) { return () => {}; }
        class Form {
          @MinLength(1)
          @MaxLength(100)
          name!: string;
        }
      `,
    },
    // Only @Minimum (no @Maximum)
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        class Form {
          @Minimum(0)
          value!: number;
        }
      `,
    },
    // Only @Maximum (no @Minimum)
    {
      code: `
        function Maximum(n: number) { return () => {}; }
        class Form {
          @Maximum(100)
          value!: number;
        }
      `,
    },
    // @Minimum with @ExclusiveMaximum where exclusive max > min
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        function ExclusiveMaximum(n: number) { return () => {}; }
        class Form {
          @Minimum(0)
          @ExclusiveMaximum(100)
          value!: number;
        }
      `,
    },
    // @ExclusiveMinimum < @Maximum (valid: exclusive min below inclusive max)
    {
      code: `
        function ExclusiveMinimum(n: number) { return () => {}; }
        function Maximum(n: number) { return () => {}; }
        class Form {
          @ExclusiveMinimum(0)
          @Maximum(100)
          value!: number;
        }
      `,
    },
    // @MinLength == @MaxLength (valid: fixed-length string)
    {
      code: `
        function MinLength(n: number) { return () => {}; }
        function MaxLength(n: number) { return () => {}; }
        class Form {
          @MinLength(5)
          @MaxLength(5)
          name!: string;
        }
      `,
    },
    // Negative values: @Minimum(-100) < @Maximum(-50) is valid
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        function Maximum(n: number) { return () => {}; }
        class Form {
          @Minimum(-100)
          @Maximum(-50)
          value!: number;
        }
      `,
    },
    // JSDoc-only constraints with valid range
    {
      code: `
        class Form {
          /** @Minimum 0 @Maximum 100 */
          value!: number;
        }
      `,
    },
    // Mixed source: decorator for one constraint, JSDoc for a different one
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        class Form {
          @Minimum(0)
          /** @Maximum 100 */
          value!: number;
        }
      `,
    },
    // JSDoc-only: MinLength/MaxLength
    {
      code: `
        class Form {
          /** @MinLength 1 @MaxLength 255 */
          name!: string;
        }
      `,
    },
    // JSDoc ExclusiveMinimum < ExclusiveMaximum
    {
      code: `
        class Form {
          /** @ExclusiveMinimum 0 @ExclusiveMaximum 100 */
          value!: number;
        }
      `,
    },
  ],
  invalid: [
    // Negative values: @Minimum(-50) > @Maximum(-100) is invalid
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        function Maximum(n: number) { return () => {}; }
        class Form {
          @Minimum(-50)
          @Maximum(-100)
          value!: number;
        }
      `,
      errors: [{ messageId: "minimumGreaterThanMaximum" }],
    },
    // @Minimum > @Maximum
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        function Maximum(n: number) { return () => {}; }
        class Form {
          @Minimum(100)
          @Maximum(50)
          value!: number;
        }
      `,
      errors: [{ messageId: "minimumGreaterThanMaximum" }],
    },
    // @ExclusiveMinimum >= @ExclusiveMaximum (equal is invalid for exclusive bounds)
    {
      code: `
        function ExclusiveMinimum(n: number) { return () => {}; }
        function ExclusiveMaximum(n: number) { return () => {}; }
        class Form {
          @ExclusiveMinimum(50)
          @ExclusiveMaximum(50)
          value!: number;
        }
      `,
      errors: [{ messageId: "exclusiveMinGreaterOrEqualMax" }],
    },
    // @ExclusiveMinimum > @ExclusiveMaximum
    {
      code: `
        function ExclusiveMinimum(n: number) { return () => {}; }
        function ExclusiveMaximum(n: number) { return () => {}; }
        class Form {
          @ExclusiveMinimum(100)
          @ExclusiveMaximum(50)
          value!: number;
        }
      `,
      errors: [{ messageId: "exclusiveMinGreaterOrEqualMax" }],
    },
    // @MinLength > @MaxLength
    {
      code: `
        function MinLength(n: number) { return () => {}; }
        function MaxLength(n: number) { return () => {}; }
        class Form {
          @MinLength(100)
          @MaxLength(10)
          name!: string;
        }
      `,
      errors: [{ messageId: "minLengthGreaterThanMaxLength" }],
    },
    // Conflicting minimum bounds: @Minimum + @ExclusiveMinimum
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        function ExclusiveMinimum(n: number) { return () => {}; }
        class Form {
          @Minimum(0)
          @ExclusiveMinimum(0)
          value!: number;
        }
      `,
      errors: [{ messageId: "conflictingMinimumBounds" }],
    },
    // Conflicting maximum bounds: @Maximum + @ExclusiveMaximum
    {
      code: `
        function Maximum(n: number) { return () => {}; }
        function ExclusiveMaximum(n: number) { return () => {}; }
        class Form {
          @Maximum(100)
          @ExclusiveMaximum(100)
          value!: number;
        }
      `,
      errors: [{ messageId: "conflictingMaximumBounds" }],
    },
    // @ExclusiveMaximum(n) where n <= @Minimum(m)
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        function ExclusiveMaximum(n: number) { return () => {}; }
        class Form {
          @Minimum(50)
          @ExclusiveMaximum(50)
          value!: number;
        }
      `,
      errors: [{ messageId: "exclusiveMaxLessOrEqualMin" }],
    },
    // @ExclusiveMaximum(n) where n < @Minimum(m)
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        function ExclusiveMaximum(n: number) { return () => {}; }
        class Form {
          @Minimum(100)
          @ExclusiveMaximum(50)
          value!: number;
        }
      `,
      errors: [{ messageId: "exclusiveMaxLessOrEqualMin" }],
    },
    // @ExclusiveMinimum(m) + @Maximum(n) where n == m (invalid: no valid values)
    {
      code: `
        function ExclusiveMinimum(n: number) { return () => {}; }
        function Maximum(n: number) { return () => {}; }
        class Form {
          @ExclusiveMinimum(50)
          @Maximum(50)
          value!: number;
        }
      `,
      errors: [{ messageId: "maximumLessOrEqualExclusiveMin" }],
    },
    // @ExclusiveMinimum(m) + @Maximum(n) where n < m (invalid)
    {
      code: `
        function ExclusiveMinimum(n: number) { return () => {}; }
        function Maximum(n: number) { return () => {}; }
        class Form {
          @ExclusiveMinimum(100)
          @Maximum(50)
          value!: number;
        }
      `,
      errors: [{ messageId: "maximumLessOrEqualExclusiveMin" }],
    },
    // JSDoc range violation: MinLength > MaxLength
    {
      code: `
        class Form {
          /** @MinLength 100 @MaxLength 1 */
          name!: string;
        }
      `,
      errors: [{ messageId: "minLengthGreaterThanMaxLength" }],
    },
    // JSDoc range violation: Minimum > Maximum
    {
      code: `
        class Form {
          /** @Minimum 100 @Maximum 1 */
          value!: number;
        }
      `,
      errors: [{ messageId: "minimumGreaterThanMaximum" }],
    },
    // Conflicting bounds via JSDoc: @Minimum + @ExclusiveMinimum
    {
      code: `
        class Form {
          /** @Minimum 5 @ExclusiveMinimum 5 */
          value!: number;
        }
      `,
      errors: [{ messageId: "conflictingMinimumBounds" }],
    },
    // Duplicate source: same constraint via decorator AND JSDoc
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        class Form {
          @Minimum(5)
          /** @Minimum 10 */
          value!: number;
        }
      `,
      errors: [{ messageId: "duplicateConstraintSource" }],
    },
    // Cross-source range violation: decorator @Minimum(100) + JSDoc @Maximum 1
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        class Form {
          @Minimum(100)
          /** @Maximum 1 */
          value!: number;
        }
      `,
      errors: [{ messageId: "minimumGreaterThanMaximum" }],
    },
  ],
});
