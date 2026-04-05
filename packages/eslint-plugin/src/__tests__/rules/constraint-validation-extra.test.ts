import { RuleTester } from "@typescript-eslint/rule-tester";
import * as vitest from "vitest";
import { noDuplicateTags } from "../../rules/constraint-validation/no-duplicate-tags.js";
import { noDescriptionTag } from "../../rules/constraint-validation/no-description-tag.js";
import { noContradictoryRules } from "../../rules/constraint-validation/no-contradictory-rules.js";
import { validDiscriminator } from "../../rules/constraint-validation/valid-discriminator.js";

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

ruleTester.run("no-duplicate-tags", noDuplicateTags, {
  valid: [
    {
      code: `
        class Form {
          /** @showWhen status=draft @showWhen type=internal */
          name!: string;
        }
      `,
    },
    {
      code: `
        /** @discriminator :kind T */
        interface TaggedValue<T> {
          kind: string;
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        class Form {
          /** @minimum 0 @minimum 1 */
          count!: number;
        }
      `,
      errors: [{ messageId: "duplicateTag" }],
    },
    {
      code: `
        /**
         * @discriminator :kind T
         * @discriminator :kind T
         */
        interface TaggedValue<T> {
          kind: string;
        }
      `,
      errors: [{ messageId: "duplicateDiscriminatorTag" }],
    },
  ],
});

ruleTester.run("no-description-tag", noDescriptionTag, {
  valid: [{ code: `class Form { /** A name */ name!: string; }` }],
  invalid: [
    {
      code: `class Form { /** @description A name */ name!: string; }`,
      errors: [{ messageId: "descriptionTagForbidden" }],
    },
  ],
});

ruleTester.run("no-contradictory-rules", noContradictoryRules, {
  valid: [
    { code: `class Form { /** @showWhen status=draft */ name!: string; }` },
    { code: `class Form { /** @showWhen status=draft @showWhen type=internal */ name!: string; }` },
    {
      code: `class Form { /** @showWhen status=draft @disableWhen status=archived */ name!: string; }`,
    },
  ],
  invalid: [
    {
      code: `class Form { /** @showWhen status=draft @hideWhen status=archived */ name!: string; }`,
      errors: [{ messageId: "contradictoryRuleEffects" }],
    },
    {
      code: `class Form { /** @enableWhen status=draft @disableWhen status=archived */ name!: string; }`,
      errors: [{ messageId: "contradictoryRuleEffects" }],
    },
  ],
});

ruleTester.run("valid-discriminator", validDiscriminator, {
  valid: [
    {
      code: `
        /** @discriminator :kind T */
        interface TaggedValue<T> {
          kind: string;
          id: string;
        }
      `,
    },
    {
      code: `
        /** @discriminator :kind T */
        class TaggedValue<T> {
          kind!: string;
          id!: string;
        }
      `,
    },
    {
      code: `
        /** @discriminator :kind T */
        type TaggedValue<T> = {
          kind: string;
          id: string;
        };
      `,
    },
    {
      code: `
        /** @discriminator :kind $Tag */
        interface TaggedValue<$Tag> {
          kind: string;
          id: string;
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        /** @discriminator :kind T */
        interface TaggedValue<T> {
          kind?: string;
        }
      `,
      errors: [{ messageId: "optionalTargetField" }],
    },
    {
      code: `
        /** @discriminator :kind T */
        interface TaggedValue<T> {
          kind: string | null;
        }
      `,
      errors: [{ messageId: "nullableTargetField" }],
    },
    {
      code: `
        /** @discriminator :kind T */
        interface TaggedValue<T> {
          kind: number;
        }
      `,
      errors: [{ messageId: "nonStringLikeTargetField" }],
    },
    {
      code: `
        /** @discriminator :meta.kind T */
        class TaggedValue<T> {
          kind!: string;
          meta!: { kind: string };
        }
      `,
      errors: [{ messageId: "nestedTarget" }],
    },
    {
      code: `
        /** @discriminator :missing T */
        interface TaggedValue<T> {
          kind: string;
        }
      `,
      errors: [{ messageId: "missingTargetField" }],
    },
    {
      code: `
        /** @discriminator kind T */
        interface TaggedValue<T> {
          kind: string;
        }
      `,
      errors: [{ messageId: "missingTarget" }],
    },
    {
      code: `
        /** @discriminator :kind Foo<T> */
        interface TaggedValue<T> {
          kind: string;
        }
      `,
      errors: [{ messageId: "invalidSourceOperand" }],
    },
    {
      code: `
        /** @discriminator :kind U */
        interface TaggedValue<T> {
          kind: string;
        }
      `,
      errors: [{ messageId: "nonLocalTypeParameter" }],
    },
    {
      code: `
        class TaggedValue<T> {
          /** @discriminator :kind T */
          kind!: string;
        }
      `,
      errors: [{ messageId: "invalidPlacement" }],
    },
    {
      code: `
        type TaggedValue<T> = string;
        /** @discriminator :kind T */
        type Invalid = TaggedValue<string>;
      `,
      errors: [{ messageId: "invalidPlacement" }],
    },
  ],
});
