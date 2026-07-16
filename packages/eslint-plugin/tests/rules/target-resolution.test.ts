import { RuleTester } from "@typescript-eslint/rule-tester";
import * as vitest from "vitest";
import { validPathTarget } from "../../src/rules/target-resolution/valid-path-target.js";
import { validMemberTarget } from "../../src/rules/target-resolution/valid-member-target.js";
import { noUnsupportedTargeting } from "../../src/rules/target-resolution/no-unsupported-targeting.js";
import { noMemberTargetOnObject } from "../../src/rules/target-resolution/no-member-target-on-object.js";
import { validTargetVariant } from "../../src/rules/target-resolution/valid-target-variant.js";

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

ruleTester.run("valid-path-target", validPathTarget, {
  valid: [
    {
      code: `
        class Form {
          /** @minimum :value 0 */
          amount!: { value: number; currency: string };
        }
      `,
    },
    {
      code: `
        class Form {
          /** @minimum :value.amount 0 */
          total!: { value: { amount: number; currency: string } };
        }
      `,
    },
    {
      // Regression test for #528: the tagged field itself is optional, so
      // its declared type is `{ zip: number } | undefined` under strict null
      // checks. The path walk must strip the `undefined` before resolving
      // `zip`, or a valid target is misreported as unknown.
      code: `
        class Form {
          /** @minimum :zip 0 */
          address?: { zip: number };
        }
      `,
    },
    {
      // Same as above, but the path also crosses a second, nested optional
      // property (`geo?`) one level deeper.
      code: `
        class Form {
          /** @minimum :geo.lat 0 */
          address?: { geo?: { lat: number; lng: number } };
        }
      `,
    },
    {
      // A non-optional container field with an optional intermediate
      // property reached via a multi-segment path.
      code: `
        class Form {
          /** @minimum :address.zip 0 */
          location!: { address?: { zip: number } };
        }
      `,
    },
    {
      // Regression test for a review finding on #528: a strip that only
      // collapses a union down to exactly one non-nullish member leaves a
      // *wider* optional union (more than one non-nullish member) with
      // `undefined` still attached, so `getProperty` still fails to resolve
      // the shared member. Here the tagged field's non-undefined part is a
      // union of two object shapes that both declare `zip`.
      code: `
        class Form {
          /** @minimum :zip 0 */
          address?: { zip: number } | { zip: string };
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        class Form {
          /** @minimum :missing 0 */
          amount!: { value: number; currency: string };
        }
      `,
      errors: [{ messageId: "unknownPathTarget" }],
    },
    {
      code: `
        class Form {
          /** @minimum :value.missing 0 */
          total!: { value: { amount: number; currency: string } };
        }
      `,
      errors: [{ messageId: "unknownPathTarget" }],
    },
    {
      // Regression test for #528: stripping nullish from an optional
      // field must not mask a genuinely missing final segment.
      code: `
        class Form {
          /** @minimum :missing 0 */
          address?: { zip: number };
        }
      `,
      errors: [{ messageId: "unknownPathTarget" }],
    },
  ],
});

ruleTester.run("valid-member-target", validMemberTarget, {
  valid: [
    {
      code: `
        interface Form {
          /** @displayName :draft Draft status */
          status: "draft" | "published";
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        interface Form {
          /** @displayName :archived Archived */
          status: "draft" | "published";
        }
      `,
      errors: [{ messageId: "unknownMemberTarget" }],
    },
  ],
});

ruleTester.run("no-unsupported-targeting", noUnsupportedTargeting, {
  valid: [
    {
      code: `
        class Form {
          /** @minimum :value 0 */
          amount!: { value: number };
        }
      `,
    },
    {
      code: `
        interface Form {
          /**
           * @displayName :singular Line item
           * @displayName :plural Line items
           */
          items: string[];
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        class Form {
          /** @remarks :value Text */
          name!: string;
        }
      `,
      errors: [{ messageId: "unsupportedTargetingSyntax" }],
    },
  ],
});

ruleTester.run("no-member-target-on-object", noMemberTargetOnObject, {
  valid: [
    {
      code: `
        interface Form {
          /** @displayName :draft Draft status */
          status: "draft" | "published";
        }
      `,
    },
    {
      code: `
        interface Form {
          /**
           * @displayName :singular Line item
           * @displayName :plural Line items
           */
          items: string[];
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        class Form {
          /** @displayName :value Amount */
          amount!: { value: number };
        }
      `,
      errors: [{ messageId: "memberTargetOnNonUnion" }],
    },
  ],
});

ruleTester.run("valid-target-variant", validTargetVariant, {
  valid: [
    {
      code: `
        class Form {
          /**
           * @displayName :singular Line item
           * @displayName :plural Line items
           */
          items!: string[];
        }
      `,
    },
    {
      code: `
        /**
         * @displayName :singular Product
         * @displayName :plural Products
         * @apiName :singular product
         * @apiName :plural products
         */
        class Product {}
      `,
    },
    {
      code: `
        /** @displayName :singular Customer Form */
        interface CustomerForm {
          name: string;
        }
      `,
    },
    {
      code: `
        /** @displayName :singular Customer ID */
        type CustomerId = string;
      `,
    },
  ],
  invalid: [
    {
      code: `
        class Form {
          /** @displayName :singular Name */
          name!: string;
        }
      `,
      errors: [{ messageId: "invalidSingularTarget" }],
    },
    {
      code: `
        class Form {
          /** @apiName :singular customer_name */
          customerName!: string;
        }
      `,
      errors: [{ messageId: "invalidSingularTarget" }],
    },
    {
      code: `
        class Form {
          /** @displayName :plural Names */
          name!: string;
        }
      `,
      errors: [{ messageId: "invalidPluralTarget" }],
    },
    {
      code: `
        interface Form {
          /** @apiName :plural customer_names */
          customerName: string;
        }
      `,
      errors: [{ messageId: "invalidPluralTarget" }],
    },
    {
      code: `
        /** @apiName :singular form */
        interface Form {
          name: string;
        }
      `,
      errors: [{ messageId: "invalidSingularTarget" }],
    },
    {
      code: `
        /** @displayName :plural Forms */
        interface Form {
          name: string;
        }
      `,
      errors: [{ messageId: "invalidPluralTarget" }],
    },
    {
      code: `
        /** @apiName :singular alias */
        type Alias = string;
      `,
      errors: [{ messageId: "invalidSingularTarget" }],
    },
    {
      code: `
        /** @apiName :plural aliases */
        type Alias = string;
      `,
      errors: [{ messageId: "invalidPluralTarget" }],
    },
  ],
});
