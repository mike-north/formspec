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
    // @Minimum and @Maximum both imply number - no conflict
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
    // @MinLength and @MaxLength both imply string - no conflict
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
    // All exclusive numeric decorators - no conflict
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
    // Single decorator - no conflict possible
    {
      code: `
        function MinLength(n: number) { return () => {}; }
        class Form {
          @MinLength(1)
          name!: string;
        }
      `,
    },
    // Non-type-hinting decorators
    {
      code: `
        function Field(opts: unknown) { return () => {}; }
        function Group(name: string) { return () => {}; }
        class Form {
          @Field({ displayName: "Name" })
          @Group("personal")
          name!: string;
        }
      `,
    },
  ],
  invalid: [
    // @Minimum (number) + @MinLength (string) - conflict
    {
      code: `
        function Minimum(n: number) { return () => {}; }
        function MinLength(n: number) { return () => {}; }
        class Form {
          @Minimum(0)
          @MinLength(1)
          field!: string;
        }
      `,
      errors: [{ messageId: "conflictingDecorators" }],
    },
    // @Pattern (string) + @Maximum (number) - conflict
    {
      code: `
        function Pattern(s: string) { return () => {}; }
        function Maximum(n: number) { return () => {}; }
        class Form {
          @Pattern("^[a-z]+$")
          @Maximum(100)
          field!: string;
        }
      `,
      errors: [{ messageId: "conflictingDecorators" }],
    },
    // @ExclusiveMinimum (number) + @MaxLength (string) - conflict
    {
      code: `
        function ExclusiveMinimum(n: number) { return () => {}; }
        function MaxLength(n: number) { return () => {}; }
        class Form {
          @ExclusiveMinimum(0)
          @MaxLength(100)
          field!: string;
        }
      `,
      errors: [{ messageId: "conflictingDecorators" }],
    },
  ],
});
