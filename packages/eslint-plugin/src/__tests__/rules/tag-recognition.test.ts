/**
 * Tests for tag-recognition rules: no-unknown-tags, require-tag-arguments,
 * no-disabled-tags, no-markdown-formatting.
 *
 * Regression tests for issue #350: extension-registered annotation tags,
 * constraint tags, and metadata slots supplied via `context.settings` were not
 * recognized by `no-unknown-tags` and were incorrectly flagged as unknown.
 *
 * @see https://github.com/mike-north/formspec/issues/350
 */
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
    // Regression test for issue #350: annotation tag registered via
    // `defineAnnotation()` must not be flagged as unknown by `no-unknown-tags`.
    // Previously the rule only consulted built-in tags and ignored extension
    // settings entirely, so `@primaryField` would be reported as unknown.
    {
      code: `
        class Form {
          /** @primaryField */
          id!: string;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: {
            extensions: [
              {
                annotations: [{ annotationName: "primaryField" }],
              },
            ],
          },
        },
      },
    },
    // Regression test for issue #350: extension constraint tag recognized via
    // settings must not be flagged.
    {
      code: `
        class Form {
          /** @afterDate 2025-01-01 */
          startsAt!: string;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: {
            extensions: [
              {
                constraintTags: [{ tagName: "afterDate" }],
              },
            ],
          },
        },
      },
    },
    // Regression test for issue #350: extension metadata slot recognized via
    // settings must not be flagged.
    {
      code: `
        class Form {
          /** @fieldLabel First name */
          firstName!: string;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: {
            extensions: [
              {
                metadataSlots: [{ tagName: "fieldLabel" }],
              },
            ],
          },
        },
      },
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
    // Extension tag in settings does not exempt unrelated unknown tags.
    {
      code: `
        class Form {
          /** @wat 1 */
          name!: string;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: {
            extensions: [
              {
                annotations: [{ annotationName: "primaryField" }],
              },
            ],
          },
        },
      },
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
