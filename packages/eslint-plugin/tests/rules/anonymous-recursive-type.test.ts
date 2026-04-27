import { RuleTester } from "@typescript-eslint/rule-tester";
import { noAnonymousRecursiveType } from "../../src/rules/type-compatibility/no-anonymous-recursive-type.js";
import { fileURLToPath } from "node:url";
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

const externalConsumerPath = fileURLToPath(
  new URL("../fixtures/anonymous-recursive-type/consumer.ts", import.meta.url)
);

const anonymousRecursiveCases = [
  {
    name: "class declaration",
    code: `
      class AnonymousRecursiveForm {
        root!: {
          value: string;
          children?: AnonymousRecursiveForm["root"][];
        };
      }
    `,
  },
  {
    name: "interface declaration",
    code: `
      interface AnonymousRecursiveForm {
        root: {
          value: string;
          children?: AnonymousRecursiveForm["root"][];
        };
      }
    `,
  },
  {
    name: "type alias declaration",
    code: `
      type AnonymousRecursiveForm = {
        root: {
          value: string;
          children?: AnonymousRecursiveForm["root"][];
        };
      };
    `,
  },
] as const;

const anonymousRecursiveTypeError = {
  messageId: "anonymousRecursiveType",
  line: 5,
  column: 22,
} as const;

ruleTester.run("no-anonymous-recursive-type", noAnonymousRecursiveType, {
  valid: [
    {
      code: `
        class TreeNode {
          value!: string;
          children?: TreeNode[];
        }

        class Form {
          root!: TreeNode;
        }
      `,
    },
    {
      filename: externalConsumerPath,
      code: `
        import { ExternalAnonymousRecursiveForm } from "./external.js";

        class UsesExternalAnonymousRecursiveForm {
          root!: ExternalAnonymousRecursiveForm;
        }
      `,
    },
  ],
  invalid: [
    ...anonymousRecursiveCases.map(({ code, name }) => ({
      name,
      code,
      errors: [anonymousRecursiveTypeError],
    })),
    {
      code: `
        class AnonymousRecursiveForm {
          root!: {
            value: string;
            children?: AnonymousRecursiveForm["root"][];
          };
        }

        class UsesAnonymousRecursiveForm {
          root!: AnonymousRecursiveForm;
        }
      `,
      errors: [
        {
          messageId: "anonymousRecursiveType",
          line: 5,
          column: 24,
        },
      ],
    },
  ],
});
