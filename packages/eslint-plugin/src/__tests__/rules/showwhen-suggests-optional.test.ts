/**
 * Tests for showwhen-suggests-optional rule.
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { showwhenSuggestsOptional } from "../../rules/showwhen-suggests-optional.js";
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

ruleTester.run("showwhen-suggests-optional", showwhenSuggestsOptional, {
  valid: [
    // @ShowWhen with optional field
    {
      code: `
        function ShowWhen(predicate: unknown) { return () => {}; }
        class Form {
          @ShowWhen({ _predicate: "equals", field: "type", value: "a" })
          conditionalField?: string;
        }
      `,
    },
    // No @ShowWhen decorator
    {
      code: `
        class Form {
          requiredField!: string;
        }
      `,
    },
  ],
  invalid: [
    // @ShowWhen on non-optional field
    {
      code: `
        function ShowWhen(predicate: unknown) { return () => {}; }
        class Form {
          @ShowWhen({ _predicate: "equals", field: "type", value: "a" })
          conditionalField!: string;
        }
      `,
      errors: [{ messageId: "shouldBeOptional" }],
    },
    // @ShowWhen on required field (no modifier)
    {
      code: `
        function ShowWhen(predicate: unknown) { return () => {}; }
        class Form {
          @ShowWhen({ _predicate: "equals", field: "type", value: "a" })
          conditionalField: string = "default";
        }
      `,
      errors: [{ messageId: "shouldBeOptional" }],
    },
  ],
});
