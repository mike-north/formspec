import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from "@typescript-eslint/utils";
import { createDeclarationVisitor, getDeclarationName } from "../../utils/rule-helpers.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

/**
 * Extracts TSPropertySignature members from a TypeNode, walking into
 * TSTypeLiteral and TSIntersectionType constituents.
 */
function collectTypeAliasPropertySignatures(
  typeNode: TSESTree.TypeNode
): TSESTree.TSPropertySignature[] {
  if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
    return typeNode.members.filter(
      (m): m is TSESTree.TSPropertySignature =>
        m.type === AST_NODE_TYPES.TSPropertySignature
    );
  }

  if (typeNode.type === AST_NODE_TYPES.TSIntersectionType) {
    return typeNode.types.flatMap(collectTypeAliasPropertySignatures);
  }

  return [];
}

/**
 * ESLint rule that warns when a class, interface, or type alias property starts
 * with `__`, indicating it will be excluded from the generated schema.
 *
 * @public
 */
export const noDoubleUnderscoreFields = createRule<[], "phantomField">({
  name: "constraint-validation/no-double-underscore-fields",
  meta: {
    type: "problem",
    docs: {
      description:
        'Warns when a property starts with "__", indicating it will be excluded from the generated schema',
    },
    schema: [],
    messages: {
      phantomField:
        'Property "{{name}}" starts with "__" and will be excluded from the generated schema. Double-underscore properties are reserved for phantom type markers.',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      const members: (TSESTree.PropertyDefinition | TSESTree.TSPropertySignature)[] = [];

      if (node.type === AST_NODE_TYPES.ClassDeclaration) {
        members.push(
          ...node.body.body.filter(
            (m): m is TSESTree.PropertyDefinition =>
              m.type === AST_NODE_TYPES.PropertyDefinition
          )
        );
      } else if (node.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
        members.push(
          ...node.body.body.filter(
            (m): m is TSESTree.TSPropertySignature =>
              m.type === AST_NODE_TYPES.TSPropertySignature
          )
        );
      } else if (node.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
        members.push(...collectTypeAliasPropertySignatures(node.typeAnnotation));
      }

      for (const member of members) {
        const name = getDeclarationName(member);
        if (name !== "<computed>" && name.startsWith("__")) {
          context.report({
            node: member.key,
            messageId: "phantomField",
            data: { name },
          });
        }
      }
    });
  },
});
