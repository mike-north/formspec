/**
 * Tests for decorator-allowed-field-types rule.
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { decoratorAllowedFieldTypes } from "../../rules/decorator-allowed-field-types.js";
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

ruleTester.run("decorator-allowed-field-types", decoratorAllowedFieldTypes, {
  valid: [
    // String field with default allowed types
    {
      code: `
        function Field(opts: unknown) { return () => {}; }
        class Form {
          @Field({ displayName: "Name" })
          name!: string;
        }
      `,
      options: [{ allow: ["string", "number", "boolean"] }],
    },
    // Number field with default allowed types
    {
      code: `
        function Field(opts: unknown) { return () => {}; }
        class Form {
          @Field({ displayName: "Age" })
          age!: number;
        }
      `,
      options: [{ allow: ["string", "number", "boolean"] }],
    },
    // Undecorated field - not checked
    {
      code: `
        class Form {
          complexField!: { nested: string };
        }
      `,
      options: [{ allow: ["string"] }],
    },
    // Union field when union is allowed
    {
      code: `
        function EnumOptions(opts: unknown[]) { return () => {}; }
        class Form {
          @EnumOptions(["a", "b"])
          type!: "a" | "b";
        }
      `,
      options: [{ allow: ["string", "union"] }],
    },
  ],
  invalid: [
    // Object field not in allowed list
    {
      code: `
        function Field(opts: unknown) { return () => {}; }
        class Form {
          @Field({ displayName: "Address" })
          address!: { street: string; city: string };
        }
      `,
      options: [{ allow: ["string", "number", "boolean"] }],
      errors: [{ messageId: "disallowedFieldType" }],
    },
    // Boolean field when only string/number allowed
    {
      code: `
        function Field(opts: unknown) { return () => {}; }
        class Form {
          @Field({ displayName: "Active" })
          active!: boolean;
        }
      `,
      options: [{ allow: ["string", "number"] }],
      errors: [{ messageId: "disallowedFieldType" }],
    },
  ],
});
