/**
 * Tests for decorator-field-type-mismatch rule.
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { decoratorFieldTypeMismatch } from "../../rules/decorator-field-type-mismatch.js";
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

ruleTester.run("decorator-field-type-mismatch", decoratorFieldTypeMismatch, {
  valid: [
    // @Minimum/@Maximum on number fields
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        function Maximum(n: number) { return () => {}; }
        class Form {
          @Minimum(0)
          @Maximum(100)
          age!: number;
        }
      `,
    },
    // @ExclusiveMinimum/@ExclusiveMaximum on number fields
    {
      code: `
        function ExclusiveMinimum(n: number) { return () => {}; }
        function ExclusiveMaximum(n: number) { return () => {}; }
        class Form {
          @ExclusiveMinimum(0)
          @ExclusiveMaximum(100)
          age!: number;
        }
      `,
    },
    // @MinLength/@MaxLength on string fields
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
    // @Pattern on string fields
    {
      code: `
        function Pattern(s: string) { return () => {}; }
        class Form {
          @Pattern("^[a-z]+$")
          code!: string;
        }
      `,
    },
    // Non-FormSpec decorators should be ignored
    {
      code: `
        function SomeOtherDecorator() { return () => {}; }
        class Form {
          @SomeOtherDecorator()
          field!: boolean;
        }
      `,
    },
    // JSDoc @Minimum on number field
    {
      code: `
        class Form {
          /** @Minimum 5 */
          count!: number;
        }
      `,
    },
    // JSDoc @Pattern on string field
    {
      code: `
        class Form {
          /** @Pattern ^[a-z]+$ */
          code!: string;
        }
      `,
    },
    // JSDoc @Pattern containing @ (e.g., email validation regex)
    {
      code: `
        class Form {
          /** @Pattern ^[^@]+@[^@]+\\.[^@]+$ */
          email!: string;
        }
      `,
    },
    // JSDoc @MinLength on string field
    {
      code: `
        class Form {
          /** @MinLength 1 */
          name!: string;
        }
      `,
    },
  ],
  invalid: [
    // @Minimum on non-number field
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        class Form {
          @Minimum(0)
          name!: string;
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @Maximum on non-number field
    {
      code: `
        function Maximum(n: number) { return () => {}; }
        class Form {
          @Maximum(100)
          tags!: string[];
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @ExclusiveMinimum on non-number field
    {
      code: `
        function ExclusiveMinimum(n: number) { return () => {}; }
        class Form {
          @ExclusiveMinimum(0)
          name!: string;
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // @MinLength on non-string field
    {
      code: `
        function MinLength(n: number) { return () => {}; }
        class Form {
          @MinLength(1)
          count!: number;
        }
      `,
      errors: [{ messageId: "stringOnNonString" }],
    },
    // @MaxLength on non-string field
    {
      code: `
        function MaxLength(n: number) { return () => {}; }
        class Form {
          @MaxLength(100)
          count!: number;
        }
      `,
      errors: [{ messageId: "stringOnNonString" }],
    },
    // @Pattern on non-string field
    {
      code: `
        function Pattern(s: string) { return () => {}; }
        class Form {
          @Pattern("^[0-9]+$")
          count!: number;
        }
      `,
      errors: [{ messageId: "stringOnNonString" }],
    },
    // JSDoc @Minimum on string field
    {
      code: `
        class Form {
          /** @Minimum 5 */
          name!: string;
        }
      `,
      errors: [{ messageId: "numericOnNonNumber" }],
    },
    // JSDoc @Pattern on number field
    {
      code: `
        class Form {
          /** @Pattern ^[0-9]+$ */
          count!: number;
        }
      `,
      errors: [{ messageId: "stringOnNonString" }],
    },
    // JSDoc @MaxLength on number field
    {
      code: `
        class Form {
          /** @MaxLength 100 */
          count!: number;
        }
      `,
      errors: [{ messageId: "stringOnNonString" }],
    },
  ],
});
