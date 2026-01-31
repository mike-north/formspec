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
        function Label(s: string) { return () => {}; }
        class Form {
          @Label("Name")
          name!: string;
        }
      `,
    },
    // Multiple different decorators
    {
      code: `
        function Label(s: string) { return () => {}; }
        function Placeholder(s: string) { return () => {}; }
        function Optional() { return () => {}; }
        class Form {
          @Label("Name")
          @Placeholder("Enter name")
          @Optional()
          name?: string;
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
    // Duplicate @Label
    {
      code: `
        function Label(s: string) { return () => {}; }
        class Form {
          @Label("First")
          @Label("Second")
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
    // Duplicate @Min
    {
      code: `
        function Min(n: number) { return () => {}; }
        class Form {
          @Min(0)
          @Min(10)
          value!: number;
        }
      `,
      errors: [{ messageId: "duplicateDecorator" }],
    },
    // Duplicate @Placeholder
    {
      code: `
        function Placeholder(s: string) { return () => {}; }
        class Form {
          @Placeholder("First")
          @Placeholder("Second")
          name!: string;
        }
      `,
      errors: [{ messageId: "duplicateDecorator" }],
    },
    // Multiple duplicates (only first pair reported per decorator type)
    {
      code: `
        function Label(s: string) { return () => {}; }
        function Placeholder(s: string) { return () => {}; }
        class Form {
          @Label("First")
          @Label("Second")
          @Placeholder("One")
          @Placeholder("Two")
          name!: string;
        }
      `,
      errors: [
        { messageId: "duplicateDecorator" },
        { messageId: "duplicateDecorator" },
      ],
    },
  ],
});
