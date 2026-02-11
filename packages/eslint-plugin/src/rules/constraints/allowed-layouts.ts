/**
 * Rule: constraints/allowed-layouts
 *
 * Validates that layout constructs (group, when/conditionals) used in the
 * Chain DSL are allowed by the project's constraint configuration.
 *
 * Works with: group(), when()
 */

import { ESLintUtils, AST_NODE_TYPES } from "@typescript-eslint/utils";
import type { TSESTree } from "@typescript-eslint/utils";
import { isLayoutTypeAllowed, type LayoutConstraints } from "@formspec/constraints/browser";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds = "disallowedGroup" | "disallowedConditional";

export type Options = [LayoutConstraints];

export const allowedLayouts = createRule<Options, MessageIds>({
  name: "constraints-allowed-layouts",
  meta: {
    type: "problem",
    docs: {
      description:
        "Validates that layout constructs (group, conditionals) are allowed by the project's constraints",
    },
    messages: {
      disallowedGroup:
        "group() is not allowed - visual grouping is not supported in this project{{labelInfo}}",
      disallowedConditional:
        "when() conditional visibility is not allowed in this project",
    },
    schema: [
      {
        type: "object",
        properties: {
          group: { type: "string", enum: ["error", "warn", "off"] },
          conditionals: { type: "string", enum: ["error", "warn", "off"] },
          maxNestingDepth: { type: "number", minimum: 0 },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{}],
  create(context) {
    const constraints = context.options[0] ?? {};

    return {
      CallExpression(node) {
        // Check for group() or when() calls
        if (node.callee.type !== AST_NODE_TYPES.Identifier) {
          return;
        }

        const functionName = node.callee.name;

        if (functionName === "group") {
          if (!isLayoutTypeAllowed("group", constraints)) {
            const label = extractGroupLabel(node.arguments[0]);
            const labelInfo = label ? ` (label: "${label}")` : "";

            context.report({
              node: node.callee,
              messageId: "disallowedGroup",
              data: { labelInfo },
            });
          }
        } else if (functionName === "when") {
          if (!isLayoutTypeAllowed("conditional", constraints)) {
            context.report({
              node: node.callee,
              messageId: "disallowedConditional",
            });
          }
        }
      },
    };
  },
});

/**
 * Extracts the group label from the first argument of a group() call.
 */
function extractGroupLabel(arg: TSESTree.Node | undefined): string | null {
  if (!arg) return null;

  if (arg.type === AST_NODE_TYPES.Literal && typeof arg.value === "string") {
    return arg.value;
  }

  if (arg.type === AST_NODE_TYPES.TemplateLiteral && arg.quasis.length === 1) {
    return arg.quasis[0]?.value.cooked ?? null;
  }

  return null;
}
