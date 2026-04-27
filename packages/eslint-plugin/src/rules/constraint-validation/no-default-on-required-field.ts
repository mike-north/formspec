import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from "@typescript-eslint/utils";
import type { SourceCode } from "@typescript-eslint/utils/ts-eslint";
import { createDeclarationVisitor, type SupportedDeclaration } from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

function hasDefaultValueTag(node: SupportedDeclaration, sourceCode: SourceCode): boolean {
  return scanFormSpecTags(node, sourceCode).some((tag) => tag.normalizedName === "defaultValue");
}

function isOptionalField(
  node: TSESTree.PropertyDefinition | TSESTree.TSPropertySignature
): boolean {
  return node.optional;
}

/**
 * ESLint rule that rejects `@defaultValue` on required fields.
 *
 * @public
 */
export const noDefaultOnRequiredField = createRule<[], "defaultOnRequiredField">({
  name: "constraint-validation/no-default-on-required-field",
  meta: {
    type: "problem",
    docs: {
      description: "Disallows @defaultValue on required fields",
    },
    schema: [],
    messages: {
      defaultOnRequiredField:
        'Tag "@defaultValue" is only valid on optional fields because required fields must be explicitly provided.',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      if (
        node.type !== AST_NODE_TYPES.PropertyDefinition &&
        node.type !== AST_NODE_TYPES.TSPropertySignature
      ) {
        return;
      }

      if (!hasDefaultValueTag(node, context.sourceCode) || isOptionalField(node)) {
        return;
      }

      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        if (tag.normalizedName !== "defaultValue") {
          continue;
        }
        context.report({
          loc: tag.comment.loc,
          messageId: "defaultOnRequiredField",
        });
      }
    });
  },
});
