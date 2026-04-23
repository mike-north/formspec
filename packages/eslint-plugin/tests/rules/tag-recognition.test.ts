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
import { noUnknownTags } from "../../src/rules/tag-recognition/no-unknown-tags.js";
import { requireTagArguments } from "../../src/rules/tag-recognition/require-tag-arguments.js";
import { noDisabledTags } from "../../src/rules/tag-recognition/no-disabled-tags.js";
import { noMarkdownFormatting } from "../../src/rules/tag-recognition/no-markdown-formatting.js";

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
    // An annotation whose annotationName shadows a built-in tag name (e.g.
    // "minimum") must not break built-in handling. `getTagMetadata` for the
    // built-in is consulted first (before the extension set), so the built-in
    // tag is still recognized correctly and neither tag produces an "unknown"
    // error. Registering an annotation named "minimum" is unusual but must not
    // regress built-in behaviour.
    {
      code: `
        class Form {
          /** @minimum 0 */
          count!: number;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: {
            extensions: [
              {
                annotations: [{ annotationName: "minimum" }],
              },
            ],
          },
        },
      },
    },
    // constraintTags with a leading-@ tagName is normalized and recognized.
    {
      code: `
        class Form {
          /** @someConstraint 5 */
          count!: number;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: {
            extensions: [
              {
                constraintTags: [{ tagName: "@someConstraint" }],
              },
            ],
          },
        },
      },
    },
    // metadataSlots with a leading-@ tagName is normalized and recognized.
    {
      code: `
        class Form {
          /** @someSlot value */
          name!: string;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: {
            extensions: [
              {
                metadataSlots: [{ tagName: "@someSlot" }],
              },
            ],
          },
        },
      },
    },
    // Empty extensions array is a no-op — no crash and built-in tags still pass.
    {
      code: `
        class Form {
          /** @minimum 0 */
          count!: number;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: {
            extensions: [],
          },
        },
      },
    },
    // Two extensions (one declaring an annotation, another a constraintTag)
    // used in the same file — both tags must be recognized.
    {
      code: `
        class Form {
          /** @primaryField */
          id!: string;
          /** @afterDate 2025-01-01 */
          startsAt!: string;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: {
            extensions: [
              { annotations: [{ annotationName: "primaryField" }] },
              { constraintTags: [{ tagName: "afterDate" }] },
            ],
          },
        },
      },
    },
    // annotationName without a leading @ is normalized and recognized —
    // verifies the normalization path for bare (no-@ prefix) annotation names.
    {
      code: `
        class Form {
          /** @bareAnno */
          id!: string;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: {
            extensions: [
              {
                annotations: [{ annotationName: "bareAnno" }],
              },
            ],
          },
        },
      },
    },
    // settings.formspec is absent — only built-in tags are enforced; no crash.
    {
      code: `
        class Form {
          /** @minimum 0 */
          count!: number;
        }
      `,
    },
    // settings.formspec is null — only built-in tags are enforced; no crash.
    {
      code: `
        class Form {
          /** @minimum 0 */
          count!: number;
        }
      `,
      settings: {
        formspec: null,
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
    // constraintTags populated but comment uses a different unknown tag —
    // the exemption set must not leak to unregistered names.
    {
      code: `
        class Form {
          /** @unknownTag 1 */
          count!: number;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: {
            extensions: [
              {
                constraintTags: [{ tagName: "someConstraint" }],
              },
            ],
          },
        },
      },
      errors: [{ messageId: "unknownTag" }],
    },
    // metadataSlots populated but an unrelated unknown tag is still flagged.
    {
      code: `
        class Form {
          /** @unknownTag value */
          name!: string;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: {
            extensions: [
              {
                metadataSlots: [{ tagName: "someSlot" }],
              },
            ],
          },
        },
      },
      errors: [{ messageId: "unknownTag" }],
    },
    // Empty `extension.annotations: []` must not silently allow-list any tags.
    // An unknown tag must still be reported even when the extension is registered
    // with an empty annotations array.
    {
      code: `
        class Form {
          /** @unknownExtensionTag */
          name!: string;
        }
      `,
      settings: {
        formspec: {
          extensionRegistry: {
            extensions: [
              {
                annotations: [],
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
