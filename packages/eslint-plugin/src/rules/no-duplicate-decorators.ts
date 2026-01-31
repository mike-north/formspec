/**
 * Rule: no-duplicate-decorators
 *
 * Ensures a field doesn't have the same decorator applied multiple times.
 *
 * Invalid:
 *   @Label("First")
 *   @Label("Second")  // Duplicate
 *   field!: string;
 *
 *   @EnumOptions(["a", "b"])
 *   @EnumOptions(["x", "y"])  // Duplicate
 *   field!: string;
 */

import { ESLintUtils } from "@typescript-eslint/utils";
import { getFormSpecDecorators } from "../utils/decorator-utils.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds = "duplicateDecorator";

/**
 * Decorators that should only appear once per field.
 */
const SINGLE_USE_DECORATORS = new Set([
  "Label",
  "Placeholder",
  "Optional",
  "Min",
  "Max",
  "MinItems",
  "MaxItems",
  "EnumOptions",
  "Group",
  "ShowWhen",
]);

export const noDuplicateDecorators = createRule<[], MessageIds>({
  name: "no-duplicate-decorators",
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensures a field doesn't have the same decorator applied multiple times",
    },
    messages: {
      duplicateDecorator:
        "Duplicate @{{decorator}} decorator. Each decorator should only appear once per field.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      PropertyDefinition(node) {
        const decorators = getFormSpecDecorators(node);
        if (decorators.length < 2) return;

        // Track seen decorators
        const seen = new Map<string, boolean>();

        for (const decorator of decorators) {
          if (!SINGLE_USE_DECORATORS.has(decorator.name)) continue;

          if (seen.has(decorator.name)) {
            context.report({
              node: decorator.node,
              messageId: "duplicateDecorator",
              data: {
                decorator: decorator.name,
              },
            });
          } else {
            seen.set(decorator.name, true);
          }
        }
      },
    };
  },
});
