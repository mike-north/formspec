/**
 * Tests for the createConstraintRule factory.
 *
 * The factory generates an ESLint rule that validates a custom JSDoc constraint
 * tag for type compatibility and value correctness.
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import type { AnyRuleModule } from "@typescript-eslint/utils/ts-eslint";
import type { RuleModule } from "@typescript-eslint/utils/ts-eslint";
import { createConstraintRule } from "../../src/factories/constraint-rule.js";
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

/**
 * The factory returns a typed `RuleModule<"typeMismatch" | "invalidValue", []>`.
 * RuleTester.run expects AnyRuleModule. The underlying shape is compatible —
 * this cast bridges the two TypeScript signatures.
 */
function asTestableRule(rule: RuleModule<"typeMismatch" | "invalidValue", []>): AnyRuleModule {
  // @ts-expect-error -- RuleModule<specific messageIds> narrows the type more
  // than AnyRuleModule requires. The runtime shape is identical.
  return rule;
}

// ---------------------------------------------------------------------------
// Rule: @CustomMin — numeric, number fields only, value must be >= 0
// ---------------------------------------------------------------------------
const customMinRule = createConstraintRule({
  tagName: "CustomMin",
  applicableTypes: ["number"],
  validateValue: (value) => {
    const n = Number(value);
    if (Number.isNaN(n)) return `Value must be numeric, got "${value}"`;
    if (n < 0) return `Value must be non-negative, got ${String(n)}`;
    return null;
  },
});

vitest.describe("createConstraintRule — @CustomMin (numeric, number only, >= 0)", () => {
  ruleTester.run("custom-min-valid", asTestableRule(customMinRule), {
    valid: [
      // Correct type and valid value
      {
        code: `
          class Form {
            /** @CustomMin 0 */
            count!: number;
          }
        `,
      },
      // Large value is fine
      {
        code: `
          class Form {
            /** @CustomMin 100 */
            quantity!: number;
          }
        `,
      },
      // Tag absent entirely — no error
      {
        code: `
          class Form {
            count!: number;
          }
        `,
      },
      // Different tag name — should be ignored
      {
        code: `
          class Form {
            /** @OtherTag 5 */
            name!: string;
          }
        `,
      },
    ],
    invalid: [
      // Applied to string field — typeMismatch
      {
        code: `
          class Form {
            /** @CustomMin 5 */
            name!: string;
          }
        `,
        errors: [{ messageId: "typeMismatch" }],
      },
      // Negative value — invalidValue
      {
        code: `
          class Form {
            /** @CustomMin -1 */
            count!: number;
          }
        `,
        errors: [{ messageId: "invalidValue" }],
      },
      // Non-numeric value — invalidValue
      {
        code: `
          class Form {
            /** @CustomMin abc */
            count!: number;
          }
        `,
        errors: [{ messageId: "invalidValue" }],
      },
    ],
  });
});

// ---------------------------------------------------------------------------
// Rule: @RequiredPattern — string fields only, value must be a valid regex
// ---------------------------------------------------------------------------
const requiredPatternRule = createConstraintRule({
  tagName: "RequiredPattern",
  applicableTypes: ["string"],
  validateValue: (value) => {
    if (value.trim() === "") return "Pattern value must not be empty";
    try {
      new RegExp(value);
      return null;
    } catch {
      return `Invalid regular expression: "${value}"`;
    }
  },
});

vitest.describe(
  "createConstraintRule — @RequiredPattern (string only, non-empty valid regex)",
  () => {
    ruleTester.run("required-pattern-valid", asTestableRule(requiredPatternRule), {
      valid: [
        // Valid regex on string field
        {
          code: `
            class Form {
              /** @RequiredPattern ^[a-z]+$ */
              slug!: string;
            }
          `,
        },
        // Email-like pattern with @ in value — value does not stop at @
        {
          code: `
            class Form {
              /** @RequiredPattern [^@]+@[^@]+ */
              email!: string;
            }
          `,
        },
        // Tag absent — no error
        {
          code: `
            class Form {
              slug!: string;
            }
          `,
        },
      ],
      invalid: [
        // Applied to number field — typeMismatch
        {
          code: `
            class Form {
              /** @RequiredPattern ^[0-9]+$ */
              count!: number;
            }
          `,
          errors: [{ messageId: "typeMismatch" }],
        },
      ],
    });
  }
);

// ---------------------------------------------------------------------------
// Rule: @AnyTag — no type restriction, no value validation
// ---------------------------------------------------------------------------
const anyTagRule = createConstraintRule({
  tagName: "AnyTag",
  applicableTypes: [], // empty = no type restriction
});

vitest.describe("createConstraintRule — @AnyTag (no type restriction, no value validation)", () => {
  ruleTester.run("any-tag-rule", asTestableRule(anyTagRule), {
    valid: [
      // On string field — OK because no type restriction
      {
        code: `
          class Form {
            /** @AnyTag hello */
            name!: string;
          }
        `,
      },
      // On number field — OK
      {
        code: `
          class Form {
            /** @AnyTag 42 */
            count!: number;
          }
        `,
      },
      // Tag absent — no error
      {
        code: `
          class Form {
            name!: string;
          }
        `,
      },
    ],
    invalid: [], // No invalid cases — type checking disabled, no value validator
  });
});

// ---------------------------------------------------------------------------
// Rule: @NumericOnly — number fields only, no value validation
// ---------------------------------------------------------------------------
const numericOnlyRule = createConstraintRule({
  tagName: "NumericOnly",
  applicableTypes: ["number"],
  // No validateValue — any value accepted
});

vitest.describe("createConstraintRule — @NumericOnly (number only, no value validation)", () => {
  ruleTester.run("numeric-only-rule", asTestableRule(numericOnlyRule), {
    valid: [
      // Number field — OK
      {
        code: `
            class Form {
              /** @NumericOnly 42 */
              score!: number;
            }
          `,
      },
      // Tag absent — OK
      {
        code: `
            class Form {
              score!: number;
            }
          `,
      },
    ],
    invalid: [
      // Boolean field — typeMismatch
      {
        code: `
            class Form {
              /** @NumericOnly 1 */
              active!: boolean;
            }
          `,
        errors: [{ messageId: "typeMismatch" }],
      },
      // String field — typeMismatch
      {
        code: `
            class Form {
              /** @NumericOnly 5 */
              label!: string;
            }
          `,
        errors: [{ messageId: "typeMismatch" }],
      },
    ],
  });
});

// ---------------------------------------------------------------------------
// Negative: type error is skipped — value validation does NOT run on wrong type
// ---------------------------------------------------------------------------
const strictRule = createConstraintRule({
  tagName: "StrictNum",
  applicableTypes: ["number"],
  validateValue: (value) => {
    const n = Number(value);
    if (Number.isNaN(n)) return "Not a number";
    return null;
  },
});

vitest.describe("createConstraintRule — type error skips value validation", () => {
  ruleTester.run("strict-num-type-gate", asTestableRule(strictRule), {
    valid: [],
    invalid: [
      // Wrong type AND invalid value: only ONE error (typeMismatch), not two
      {
        code: `
          class Form {
            /** @StrictNum not-a-number */
            label!: string;
          }
        `,
        errors: [{ messageId: "typeMismatch" }],
      },
    ],
  });
});
