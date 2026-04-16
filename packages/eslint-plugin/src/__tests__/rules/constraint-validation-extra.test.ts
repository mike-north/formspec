import { RuleTester } from "@typescript-eslint/rule-tester";
import * as vitest from "vitest";
import { noDuplicateTags } from "../../rules/constraint-validation/no-duplicate-tags.js";
import { noDescriptionTag } from "../../rules/constraint-validation/no-description-tag.js";
import { noContradictoryRules } from "../../rules/constraint-validation/no-contradictory-rules.js";
import { validDiscriminator } from "../../rules/constraint-validation/valid-discriminator.js";
import { noDoubleUnderscoreFields } from "../../rules/constraint-validation/no-double-underscore-fields.js";

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
        type ExtractObjectTag<T> = T extends { readonly object: infer O }
          ? O extends string ? O : never
          : never;

        /** @discriminator :type T */
        type TaggedValue<T extends { readonly object: string }> = {
          type: ExtractObjectTag<T>;
          id: string;
        } & {
          readonly __type?: T;
        };
      `,
    },
    {
      code: `
        type ExtractObjectTag<T> = T extends { readonly object: infer O }
          ? O extends string ? O : never
          : never;

        /** @discriminator :type T */
        type TaggedValue<T extends { readonly object: string }> = ({
          type: ExtractObjectTag<T>;
          id: string;
        });
      `,
    },
    {
      code: `
        type ExtractObjectTag<T> = T extends { readonly object: infer O }
          ? O extends string ? O : never
          : never;

        /** @discriminator :type T */
        type TaggedValue<T extends { readonly object: string }> = ({
          type: ExtractObjectTag<T>;
          id: string;
        } & {
          readonly __type?: T;
        });
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
        type ExtractObjectTag<T> = T extends { readonly object: infer O }
          ? O extends number ? O : never
          : never;

        /** @discriminator :type T */
        type TaggedValue<T extends { readonly object: number }> = {
          type: ExtractObjectTag<T>;
          id: string;
        };
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
        interface BaseTaggedValue<T> {
          kind: string;
          id: string;
        }

        /** @discriminator :kind T */
        interface DerivedTaggedValue<T> extends BaseTaggedValue<T> {
          href: string;
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

ruleTester.run("no-double-underscore-fields", noDoubleUnderscoreFields, {
  valid: [
    { code: `class Form { name!: string; }` },
    { code: `class Form { _internal!: string; }` },
    { code: `interface Foo { name: string; }` },
    { code: `interface Foo { _internal: string; }` },
    // Computed properties (e.g. symbol keys) must not be flagged
    { code: `class Form { [Symbol.iterator]!: any; }` },
  ],
  invalid: [
    {
      code: `class Form { __type!: string; }`,
      errors: [{ messageId: "phantomField" }],
    },
    {
      code: `interface Foo { __brand: string; }`,
      errors: [{ messageId: "phantomField" }],
    },
    // Type alias with a __-prefixed property in a type literal
    {
      code: `type Foo = { __phantom: string; id: number; };`,
      errors: [{ messageId: "phantomField" }],
    },
    // Type alias with a __-prefixed property in an intersection type
    {
      code: `type Bar = { id: string } & { __brand: string };`,
      errors: [{ messageId: "phantomField" }],
    },
    // Parenthesized type alias with __-prefixed property
    {
      code: `type X = ({ __phantom: string });`,
      errors: [{ messageId: "phantomField" }],
    },
    // Parenthesized intersection type alias
    {
      code: `type X = ({ id: string } & { __brand: string });`,
      errors: [{ messageId: "phantomField" }],
    },
    // Property named exactly __ (two underscores, no suffix)
    {
      code: `class Form { __!: string; }`,
      errors: [{ messageId: "phantomField" }],
    },
    // Multiple __-prefixed properties each produce their own error
    {
      code: `interface Multi { __a: string; __b: number; }`,
      errors: [{ messageId: "phantomField" }, { messageId: "phantomField" }],
    },
  ],
});
