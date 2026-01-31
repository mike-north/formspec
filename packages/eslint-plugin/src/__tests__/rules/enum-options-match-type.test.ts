/**
 * Tests for enum-options-match-type rule.
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { enumOptionsMatchType } from "../../rules/enum-options-match-type.js";
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

ruleTester.run("enum-options-match-type", enumOptionsMatchType, {
  valid: [
    // String literal union matches exactly
    {
      code: `
        function EnumOptions(options: unknown[]) { return () => {}; }
        class Form {
          @EnumOptions(["a", "b", "c"])
          type!: "a" | "b" | "c";
        }
      `,
    },
    // Object options with id property
    {
      code: `
        function EnumOptions(options: unknown[]) { return () => {}; }
        class Form {
          @EnumOptions([{ id: "x", label: "X" }, { id: "y", label: "Y" }])
          type!: "x" | "y";
        }
      `,
    },
    // Plain string type accepts any enum options
    {
      code: `
        function EnumOptions(options: unknown[]) { return () => {}; }
        class Form {
          @EnumOptions(["a", "b", "c"])
          type!: string;
        }
      `,
    },
    // No @EnumOptions decorator
    {
      code: `
        class Form {
          type!: "a" | "b" | "c";
        }
      `,
    },
  ],
  invalid: [
    // Missing values in options
    {
      code: `
        function EnumOptions(options: unknown[]) { return () => {}; }
        class Form {
          @EnumOptions(["a", "b"])
          type!: "a" | "b" | "c";
        }
      `,
      errors: [{ messageId: "enumOptionsMissing" }],
    },
    // Extra values in options
    {
      code: `
        function EnumOptions(options: unknown[]) { return () => {}; }
        class Form {
          @EnumOptions(["a", "b", "c", "d"])
          type!: "a" | "b" | "c";
        }
      `,
      errors: [{ messageId: "enumOptionsExtra" }],
    },
    // Complete mismatch
    {
      code: `
        function EnumOptions(options: unknown[]) { return () => {}; }
        class Form {
          @EnumOptions(["x", "y"])
          type!: "a" | "b";
        }
      `,
      errors: [
        { messageId: "enumOptionsMissing" },
        { messageId: "enumOptionsExtra" },
      ],
    },
  ],
});
