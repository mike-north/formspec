import { RuleTester } from "@typescript-eslint/rule-tester";
import * as vitest from "vitest";
import { validNumericValue } from "../../src/rules/value-parsing/valid-numeric-value.js";
import { validIntegerValue } from "../../src/rules/value-parsing/valid-integer-value.js";
import { validRegexPattern } from "../../src/rules/value-parsing/valid-regex-pattern.js";
import { validJsonValue } from "../../src/rules/value-parsing/valid-json-value.js";

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

ruleTester.run("valid-numeric-value", validNumericValue, {
  valid: [{ code: `class Form { /** @minimum 1.5 */ count!: number; }` }],
  invalid: [
    {
      code: `class Form { /** @minimum nope */ count!: number; }`,
      errors: [{ messageId: "invalidNumericValue" }],
    },
  ],
});

ruleTester.run("valid-integer-value", validIntegerValue, {
  valid: [
    { code: `class Form { /** @minLength 1 */ name!: string; }` },
    { code: `class Form { /** @order -1 */ name!: string; }` },
  ],
  invalid: [
    {
      code: `class Form { /** @minLength -1 */ name!: string; }`,
      errors: [{ messageId: "invalidIntegerValue" }],
    },
  ],
});

ruleTester.run("valid-regex-pattern", validRegexPattern, {
  valid: [
    { code: String.raw`class Form { /** @pattern ^[a-z]+$ */ name!: string; }` },
    {
      code: String.raw`class Form { /** @pattern ^[^@]+@example\\.org$ */ email!: string; }`,
    },
    {
      code: String.raw`class Form { /** @pattern ^\\S+ @example.org$ */ email!: string; }`,
    },
  ],
  invalid: [
    {
      code: String.raw`class Form { /** @pattern [a-z */ name!: string; }`,
      errors: [{ messageId: "invalidRegexPattern" }],
    },
    {
      code: String.raw`class Form { /** @pattern ^[^@]+@example\\.org)$ */ email!: string; }`,
      errors: [{ messageId: "invalidRegexPattern" }],
    },
  ],
});

ruleTester.run("valid-json-value", validJsonValue, {
  valid: [
    { code: `class Form { /** @const {"ok":true} */ name!: string; }` },
    { code: `class Form { /** @defaultValue pending */ status!: string; }` },
  ],
  invalid: [
    {
      code: `class Form { /** @const {oops} */ name!: string; }`,
      errors: [{ messageId: "invalidJsonValue" }],
    },
  ],
});
