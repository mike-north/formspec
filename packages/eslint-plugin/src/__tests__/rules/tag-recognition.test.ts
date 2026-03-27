import { RuleTester } from "@typescript-eslint/rule-tester";
import * as vitest from "vitest";
import { noUnknownTags } from "../../rules/tag-recognition/no-unknown-tags.js";
import { requireTagArguments } from "../../rules/tag-recognition/require-tag-arguments.js";
import { noDisabledTags } from "../../rules/tag-recognition/no-disabled-tags.js";

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

ruleTester.run("no-unknown-tags", noUnknownTags, {
  valid: [
    {
      code: `
        class Form {
          /** @minimum 0 @description Legal name */
          name!: string;
        }
      `,
    },
    {
      code: String.raw`
        class Form {
          /** @pattern ^[^@]+@example\.org$ */
          email!: string;
        }
      `,
    },
    {
      code: `
        class Form {
          /** @apiName first_name */
          name!: string;
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        class Form {
          /** @wat 1 */
          name!: string;
        }
      `,
      errors: [{ messageId: "unknownTag" }],
    },
  ],
});

ruleTester.run("require-tag-arguments", requireTagArguments, {
  valid: [
    {
      code: `
        class Form {
          /** @minimum 0 */
          count!: number;
        }
      `,
    },
    {
      code: `
        class Form {
          /** @deprecated */
          name!: string;
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        class Form {
          /**
           * @description
           */
          name!: string;
        }
      `,
      errors: [{ messageId: "missingTagArgument" }],
    },
  ],
});

ruleTester.run("no-disabled-tags", noDisabledTags, {
  valid: [
    {
      code: `
        class Form {
          /** @minimum 0 */
          count!: number;
        }
      `,
      options: [{ tags: ["maxLength"] }],
    },
  ],
  invalid: [
    {
      code: `
        class Form {
          /** @minimum 0 */
          count!: number;
        }
      `,
      options: [{ tags: ["minimum"] }],
      errors: [{ messageId: "disabledTag" }],
    },
  ],
});
