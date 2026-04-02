import { RuleTester } from "@typescript-eslint/rule-tester";
import * as vitest from "vitest";
import { noUnknownTags } from "../../rules/tag-recognition/no-unknown-tags.js";
import { requireTagArguments } from "../../rules/tag-recognition/require-tag-arguments.js";
import { noDisabledTags } from "../../rules/tag-recognition/no-disabled-tags.js";
import { noMarkdownFormatting } from "../../rules/tag-recognition/no-markdown-formatting.js";

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
          /** Legal name @minimum 0 */
          name!: string;
        }
      `,
    },
    {
      code: String.raw`
        class Form {
          /** @pattern ^[^@]+@example\\.org$ */
          email!: string;
        }
      `,
    },
    {
      code: String.raw`
        class Form {
          /** @pattern ^\\S+ @example.org$ */
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
    {
      code: `
        class Form {
          /** @const "draft" */
          status!: string;
        }
      `,
    },
    {
      code: `
        class Form {
          /** Legal name @minimum 1 */
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
    {
      code: `
        class Form {
          /** @uniqueItems */
          tags!: string[];
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        class Form {
          /**
           * @remarks
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

ruleTester.run("no-markdown-formatting", noMarkdownFormatting, {
  valid: [
    {
      code: `
        class Form {
          /** @remarks Plain text only */
          name!: string;
        }
      `,
      options: [{ tags: ["remarks"] }],
    },
    {
      code: `
        class Form {
          /** @displayName **Full Name** */
          name!: string;
        }
      `,
      options: [{ tags: ["remarks"] }],
    },
    {
      code: `
        class Form {
          /** @displayName :plural Customer Names */
          name!: string;
        }
      `,
      options: [{ tags: ["displayName"] }],
    },
  ],
  invalid: [
    {
      code: `
        class Form {
          /** @remarks Use \`customer.email\` in the follow-up. */
          name!: string;
        }
      `,
      options: [{ tags: ["remarks"] }],
      errors: [{ messageId: "markdownFormattingForbidden" }],
      output: `
        class Form {
          /** @remarks Use customer.email in the follow-up. */
          name!: string;
        }
      `,
    },
    {
      code: `
        class Form {
          /** @displayName **Full Name** */
          name!: string;
        }
      `,
      options: [{ tags: ["displayName"] }],
      errors: [{ messageId: "markdownFormattingForbidden" }],
      output: `
        class Form {
          /** @displayName Full Name */
          name!: string;
        }
      `,
    },
    {
      code: `
        class Form {
          /**
           * @displayName :plural [Customer Names](https://example.com)
           */
          name!: string;
        }
      `,
      options: [{ tags: ["displayName"] }],
      errors: [{ messageId: "markdownFormattingForbidden" }],
      output: `
        class Form {
          /**
           * @displayName :plural Customer Names
           */
          name!: string;
        }
      `,
    },
  ],
});
