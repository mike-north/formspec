/**
 * Tests for constraints/allowed-field-types rule.
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { allowedFieldTypes } from "../../../rules/constraints/allowed-field-types.js";
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

ruleTester.run("constraints-allowed-field-types", allowedFieldTypes, {
  valid: [
    // All field types allowed by default (no constraints)
    {
      code: `
        const field = {
          text: (name: string) => ({ name }),
          number: (name: string) => ({ name }),
          dynamicEnum: (name: string, source: string) => ({ name, source }),
        };
        field.text("name");
        field.number("age");
        field.dynamicEnum("country", "countries");
      `,
    },
    // Field types allowed when explicitly set to "off"
    {
      code: `
        const field = {
          text: (name: string) => ({ name }),
          dynamicEnum: (name: string, source: string) => ({ name, source }),
        };
        field.text("name");
        field.dynamicEnum("country", "countries");
      `,
      options: [{ text: "off", dynamicEnum: "off" }],
    },
    // Non-field method calls should be ignored
    {
      code: `
        const field = { text: (name: string) => ({ name }) };
        const other = { dynamicEnum: (name: string) => ({ name }) };
        other.dynamicEnum("country");
      `,
      options: [{ dynamicEnum: "error" }],
    },
    // Non-member expressions should be ignored
    {
      code: `
        function text(name: string) { return { name }; }
        text("name");
      `,
      options: [{ text: "error" }],
    },
  ],
  invalid: [
    // field.dynamicEnum() disallowed
    {
      code: `
        const field = {
          dynamicEnum: (name: string, source: string) => ({ name, source }),
        };
        field.dynamicEnum("country", "countries");
      `,
      options: [{ dynamicEnum: "error" }],
      errors: [{ messageId: "disallowedFieldType" }],
    },
    // field.text() disallowed
    {
      code: `
        const field = { text: (name: string) => ({ name }) };
        field.text("name");
      `,
      options: [{ text: "error" }],
      errors: [{ messageId: "disallowedFieldType" }],
    },
    // field.array() disallowed
    {
      code: `
        const field = {
          array: (name: string, ...items: unknown[]) => ({ name, items }),
        };
        field.array("items", { name: "description" });
      `,
      options: [{ array: "error" }],
      errors: [{ messageId: "disallowedFieldType" }],
    },
    // field.arrayWithConfig() also uses "array" constraint
    {
      code: `
        const field = {
          arrayWithConfig: (name: string, config: unknown, ...items: unknown[]) => ({ name, config, items }),
        };
        field.arrayWithConfig("items", { minItems: 1 }, { name: "description" });
      `,
      options: [{ array: "error" }],
      errors: [{ messageId: "disallowedFieldType" }],
    },
    // field.object() disallowed
    {
      code: `
        const field = {
          object: (name: string, ...props: unknown[]) => ({ name, props }),
        };
        field.object("address", { name: "street" });
      `,
      options: [{ object: "error" }],
      errors: [{ messageId: "disallowedFieldType" }],
    },
    // field.dynamicSchema() disallowed
    {
      code: `
        const field = {
          dynamicSchema: (name: string, source: string) => ({ name, source }),
        };
        field.dynamicSchema("extension", "extensions");
      `,
      options: [{ dynamicSchema: "error" }],
      errors: [{ messageId: "disallowedFieldType" }],
    },
    // Multiple disallowed field types
    {
      code: `
        const field = {
          dynamicEnum: (name: string, source: string) => ({ name, source }),
          array: (name: string, ...items: unknown[]) => ({ name, items }),
        };
        field.dynamicEnum("country", "countries");
        field.array("items", { name: "x" });
      `,
      options: [{ dynamicEnum: "error", array: "error" }],
      errors: [
        { messageId: "disallowedFieldType" },
        { messageId: "disallowedFieldType" },
      ],
    },
    // field.enum() (staticEnum constraint)
    {
      code: `
        const field = {
          enum: (name: string, options: readonly string[]) => ({ name, options }),
        };
        field.enum("status", ["active", "inactive"]);
      `,
      options: [{ staticEnum: "error" }],
      errors: [{ messageId: "disallowedFieldType" }],
    },
  ],
});
