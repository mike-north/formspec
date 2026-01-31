/**
 * Rule: showwhen-suggests-optional
 *
 * Suggests that fields with @ShowWhen should be marked as optional (`?`)
 * since they may not be present in the output when the condition is false.
 *
 * Valid:
 *   @ShowWhen({ _predicate: "equals", field: "type", value: "a" })
 *   conditionalField?: string;  // Optional - good
 *
 * Warning:
 *   @ShowWhen({ _predicate: "equals", field: "type", value: "a" })
 *   conditionalField!: string;  // Not optional - may cause issues
 */

import { ESLintUtils, AST_NODE_TYPES } from "@typescript-eslint/utils";
import { findDecorator } from "../utils/decorator-utils.js";
import { isOptionalProperty } from "../utils/type-utils.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds = "shouldBeOptional";

export const showwhenSuggestsOptional = createRule<[], MessageIds>({
  name: "showwhen-suggests-optional",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Suggests that fields with @ShowWhen should be marked as optional",
    },
    messages: {
      shouldBeOptional:
        "Field '{{field}}' uses @ShowWhen but is not optional. Consider adding '?' since the field may not be in the output when the condition is false.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      PropertyDefinition(node) {
        const showWhenDecorator = findDecorator(node, "ShowWhen");
        if (!showWhenDecorator) return;

        // Check if the field is already optional
        if (isOptionalProperty(node)) return;

        const fieldName =
          node.key.type === AST_NODE_TYPES.Identifier ? node.key.name : "<computed>";

        context.report({
          node: node.key,
          messageId: "shouldBeOptional",
          data: {
            field: fieldName,
          },
        });
      },
    };
  },
});
