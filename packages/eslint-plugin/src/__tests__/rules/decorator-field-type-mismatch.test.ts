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
    // @Min/@Max on number fields
    {
      code: `
        function Min(n: number) { return () => {}; }
        function Max(n: number) { return () => {}; }
        class Form {
          @Min(0)
          @Max(100)
          age!: number;
        }
      `,
    },
    // @Placeholder on string fields
    {
      code: `
        function Placeholder(s: string) { return () => {}; }
        class Form {
          @Placeholder("Enter name")
          name!: string;
        }
      `,
    },
    // @MinItems/@MaxItems on array fields
    {
      code: `
        function MinItems(n: number) { return () => {}; }
        function MaxItems(n: number) { return () => {}; }
        class Form {
          @MinItems(1)
          @MaxItems(10)
          items!: string[];
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
  ],
  invalid: [
    // @Min on non-number field
    {
      code: `
        function Min(n: number) { return () => {}; }
        class Form {
          @Min(0)
          name!: string;
        }
      `,
      errors: [{ messageId: "minMaxOnNonNumber" }],
    },
    // @Max on non-number field
    {
      code: `
        function Max(n: number) { return () => {}; }
        class Form {
          @Max(100)
          tags!: string[];
        }
      `,
      errors: [{ messageId: "minMaxOnNonNumber" }],
    },
    // @Placeholder on non-string field
    {
      code: `
        function Placeholder(s: string) { return () => {}; }
        class Form {
          @Placeholder("Enter value")
          count!: number;
        }
      `,
      errors: [{ messageId: "placeholderOnNonString" }],
    },
    // @MinItems on non-array field
    {
      code: `
        function MinItems(n: number) { return () => {}; }
        class Form {
          @MinItems(1)
          name!: string;
        }
      `,
      errors: [{ messageId: "minMaxItemsOnNonArray" }],
    },
    // @MaxItems on non-array field
    {
      code: `
        function MaxItems(n: number) { return () => {}; }
        class Form {
          @MaxItems(10)
          count!: number;
        }
      `,
      errors: [{ messageId: "minMaxItemsOnNonArray" }],
    },
  ],
});
