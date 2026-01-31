/**
 * Tests for showwhen-field-exists rule.
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { showwhenFieldExists } from "../../rules/showwhen-field-exists.js";
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

ruleTester.run("showwhen-field-exists", showwhenFieldExists, {
  valid: [
    // @ShowWhen references existing field
    {
      code: `
        function EnumOptions(options: unknown[]) { return () => {}; }
        function ShowWhen(predicate: unknown) { return () => {}; }
        class Form {
          @EnumOptions(["a", "b"])
          type!: "a" | "b";

          @ShowWhen({ _predicate: "equals", field: "type", value: "a" })
          conditionalField?: string;
        }
      `,
    },
    // No @ShowWhen decorator
    {
      code: `
        class Form {
          type!: string;
          otherField!: string;
        }
      `,
    },
    // @ShowWhen references field defined after it
    {
      code: `
        function ShowWhen(predicate: unknown) { return () => {}; }
        class Form {
          @ShowWhen({ _predicate: "equals", field: "type", value: "x" })
          conditionalField?: string;

          type!: string;
        }
      `,
    },
  ],
  invalid: [
    // @ShowWhen references non-existent field
    {
      code: `
        function ShowWhen(predicate: unknown) { return () => {}; }
        class Form {
          @ShowWhen({ _predicate: "equals", field: "nonexistent", value: "x" })
          conditionalField?: string;
        }
      `,
      errors: [{ messageId: "fieldDoesNotExist" }],
    },
    // @ShowWhen references misspelled field
    {
      code: `
        function ShowWhen(predicate: unknown) { return () => {}; }
        class Form {
          type!: string;

          @ShowWhen({ _predicate: "equals", field: "typo", value: "x" })
          conditionalField?: string;
        }
      `,
      errors: [{ messageId: "fieldDoesNotExist" }],
    },
  ],
});
