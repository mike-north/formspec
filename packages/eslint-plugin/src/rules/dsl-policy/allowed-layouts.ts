/**
 * Rule: dsl-policy/allowed-layouts
 *
 * Validates that layout constructs (group, when/conditionals) used in the
 * Chain DSL are allowed by the project's DSL policy configuration.
 *
 * Works with: group(), when()
 */

import { ESLintUtils, AST_NODE_TYPES } from "@typescript-eslint/utils";
import type { TSESTree } from "@typescript-eslint/utils";
import { isLayoutTypeAllowed } from "@formspec/dsl-policy/browser";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

/**
 * Message identifiers emitted by `allowedLayouts`.
 *
 * @public
 */
export type MessageIds = "disallowedGroup" | "disallowedConditional";

/**
 * Rule options accepted by `allowedLayouts`.
 *
 * @public
 */
export interface AllowedLayoutsConfig {
  /** group() - visual grouping of fields */
  group?: "error" | "warn" | "off";
  /** when() - conditional field visibility */
  conditionals?: "error" | "warn" | "off";
  /** Maximum nesting depth for objects/arrays (0 = flat only) */
  maxNestingDepth?: number;
}

/**
 * Rule options accepted by `allowedLayouts`.
 *
 * @public
 */
export type Options = [AllowedLayoutsConfig];
/**
 * ESLint rule that validates allowed layout constructs against project constraints.
 *
 * @public
 */
export const allowedLayouts = createRule<Options, MessageIds>({
  name: "dsl-policy/allowed-layouts",
  meta: {
    type: "problem",
    docs: {
      description:
        "Validates that layout constructs (group, conditionals) are allowed by the project's DSL policy",
    },
    messages: {
      disallowedGroup:
        "group() is not allowed - visual grouping is not supported in this project{{labelInfo}}",
      disallowedConditional: "when() conditional visibility is not allowed in this project",
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- RuleTester may not apply defaultOptions
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
