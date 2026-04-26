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
