/**
 * Tests for no-duplicate-decorators rule.
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { noDuplicateDecorators } from "../../rules/no-duplicate-decorators.js";
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

ruleTester.run("no-duplicate-decorators", noDuplicateDecorators, {
  valid: [
    // Single decorator
    {
      code: `
        function Field(opts: unknown) { return () => {}; }
        class Form {
          @Field({ displayName: "Name" })
          name!: string;
        }
      `,
    },
    // Multiple different decorators
    {
      code: `
        function Field(opts: unknown) { return () => {}; }
        function MinLength(n: number) { return () => {}; }
        function MaxLength(n: number) { return () => {}; }
        class Form {
          @Field({ displayName: "Name" })
          @MinLength(1)
          @MaxLength(100)
          name!: string;
        }
      `,
    },
    // No decorators
    {
      code: `
        class Form {
          name!: string;
        }
      `,
    },
  ],
  invalid: [
    // Duplicate @Field
    {
      code: `
        function Field(opts: unknown) { return () => {}; }
        class Form {
          @Field({ displayName: "First" })
          @Field({ displayName: "Second" })
          name!: string;
        }
      `,
      errors: [{ messageId: "duplicateDecorator" }],
    },
    // Duplicate @EnumOptions
    {
      code: `
        function EnumOptions(options: unknown[]) { return () => {}; }
        class Form {
          @EnumOptions(["a", "b"])
          @EnumOptions(["x", "y"])
          type!: string;
        }
      `,
      errors: [{ messageId: "duplicateDecorator" }],
    },
    // Duplicate @Minimum
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        class Form {
          @Minimum(0)
          @Minimum(10)
          value!: number;
        }
      `,
      errors: [{ messageId: "duplicateDecorator" }],
    },
    // Duplicate @MinLength
    {
      code: `
        function MinLength(n: number) { return () => {}; }
        class Form {
          @MinLength(1)
          @MinLength(5)
          name!: string;
        }
      `,
      errors: [{ messageId: "duplicateDecorator" }],
    },
    // Multiple duplicates (only first pair reported per decorator type)
    {
      code: `
        function Field(opts: unknown) { return () => {}; }
        function MinLength(n: number) { return () => {}; }
        class Form {
          @Field({ displayName: "First" })
          @Field({ displayName: "Second" })
          @MinLength(1)
          @MinLength(5)
          name!: string;
        }
      `,
      errors: [{ messageId: "duplicateDecorator" }, { messageId: "duplicateDecorator" }],
    },
  ],
});
