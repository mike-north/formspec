/**
 * Tests for no-conflicting-decorators rule.
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { noConflictingDecorators } from "../../rules/no-conflicting-decorators.js";
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

ruleTester.run("no-conflicting-decorators", noConflictingDecorators, {
  valid: [
    // @Min and @Max both imply number - no conflict
    {
      code: `
        function Min(n: number) { return () => {}; }
        function Max(n: number) { return () => {}; }
        class Form {
          @Min(0)
          @Max(100)
          value!: number;
        }
      `,
    },
    // @MinItems and @MaxItems both imply array - no conflict
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
    // Single decorator - no conflict possible
    {
      code: `
        function Placeholder(s: string) { return () => {}; }
        class Form {
          @Placeholder("Enter name")
          name!: string;
        }
      `,
    },
    // Non-type-hinting decorators
    {
      code: `
        function Label(s: string) { return () => {}; }
        function Optional() { return () => {}; }
        class Form {
          @Label("Name")
          @Optional()
          name?: string;
        }
      `,
    },
  ],
  invalid: [
    // @Min (number) + @Placeholder (string) - conflict
    {
      code: `
        function Min(n: number) { return () => {}; }
        function Placeholder(s: string) { return () => {}; }
        class Form {
          @Min(0)
          @Placeholder("Enter value")
          field!: string;
        }
      `,
      errors: [{ messageId: "conflictingDecorators" }],
    },
    // @MinItems (array) + @Min (number) - conflict
    {
      code: `
        function Min(n: number) { return () => {}; }
        function MinItems(n: number) { return () => {}; }
        class Form {
          @MinItems(1)
          @Min(0)
          field!: number[];
        }
      `,
      errors: [{ messageId: "conflictingDecorators" }],
    },
    // @Placeholder (string) + @MaxItems (array) - conflict
    {
      code: `
        function Placeholder(s: string) { return () => {}; }
        function MaxItems(n: number) { return () => {}; }
        class Form {
          @Placeholder("Enter items")
          @MaxItems(10)
          field!: string[];
        }
      `,
      errors: [{ messageId: "conflictingDecorators" }],
    },
  ],
});
