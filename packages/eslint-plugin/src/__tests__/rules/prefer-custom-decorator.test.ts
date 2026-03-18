/**
 * Tests for prefer-custom-decorator rule.
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { preferCustomDecorator } from "../../rules/prefer-custom-decorator.js";
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

ruleTester.run("prefer-custom-decorator", preferCustomDecorator, {
  valid: [
    // No preference configured - @Field is fine
    {
      code: `
        function Field(opts: unknown) { return () => {}; }
        class Form {
          @Field({ displayName: "Name" })
          name!: string;
        }
      `,
      options: [{ prefer: {} }],
    },
    // Using the preferred custom decorator (not a FormSpec built-in, so not flagged)
    {
      code: `
        function MyField(opts: unknown) { return () => {}; }
        class Form {
          @MyField({ displayName: "Name" })
          name!: string;
        }
      `,
      options: [{ prefer: { Field: "MyField" } }],
    },
    // Decorator not in the prefer map
    {
      code: `
        function EnumOptions(opts: unknown[]) { return () => {}; }
        class Form {
          @EnumOptions(["a", "b"])
          type!: string;
        }
      `,
      options: [{ prefer: { Field: "MyField" } }],
    },
  ],
  invalid: [
    // @Field used when MyField is preferred
    {
      code: `
        function Field(opts: unknown) { return () => {}; }
        class Form {
          @Field({ displayName: "Name" })
          name!: string;
        }
      `,
      options: [{ prefer: { Field: "MyField" } }],
      errors: [{ messageId: "preferCustomDecorator" }],
    },
    // Multiple built-ins in prefer map
    {
      code: `
        function Field(opts: unknown) { return () => {}; }
        function EnumOptions(opts: unknown[]) { return () => {}; }
        class Form {
          @Field({ displayName: "Type" })
          @EnumOptions(["a", "b"])
          type!: string;
        }
      `,
      options: [{ prefer: { Field: "MyField", EnumOptions: "MyEnumOptions" } }],
      errors: [{ messageId: "preferCustomDecorator" }, { messageId: "preferCustomDecorator" }],
    },
  ],
});
