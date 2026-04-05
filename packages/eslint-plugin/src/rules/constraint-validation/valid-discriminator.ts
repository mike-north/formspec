import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from "@typescript-eslint/utils";
import type { ParserServicesWithTypeInformation } from "@typescript-eslint/utils";
import ts from "typescript";
import {
  createDeclarationVisitor,
  getDeclarationName,
  getDeclarationType,
  getResolvedTypeName,
} from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";
import { isNullableType, isStringType } from "../../utils/type-utils.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds =
  | "invalidPlacement"
  | "missingTarget"
  | "nestedTarget"
  | "invalidSourceOperand"
  | "nonLocalTypeParameter"
  | "missingTargetField"
  | "optionalTargetField"
  | "nullableTargetField"
  | "nonStringLikeTargetField";

function getDirectPropertyMembers(
  node: import("../../utils/rule-helpers.js").SupportedDeclaration
): readonly (TSESTree.PropertyDefinition | TSESTree.TSPropertySignature)[] {
  switch (node.type) {
    case AST_NODE_TYPES.PropertyDefinition:
    case AST_NODE_TYPES.TSPropertySignature:
      return [node];

    case AST_NODE_TYPES.ClassDeclaration:
      return node.body.body.filter(
        (member): member is TSESTree.PropertyDefinition =>
          member.type === AST_NODE_TYPES.PropertyDefinition
      );

    case AST_NODE_TYPES.TSInterfaceDeclaration:
      return node.body.body.filter(
        (member): member is TSESTree.TSPropertySignature =>
          member.type === AST_NODE_TYPES.TSPropertySignature
      );

    case AST_NODE_TYPES.TSTypeAliasDeclaration:
      if (node.typeAnnotation.type !== AST_NODE_TYPES.TSTypeLiteral) {
        return [];
      }
      return node.typeAnnotation.members.filter(
        (member): member is TSESTree.TSPropertySignature =>
          member.type === AST_NODE_TYPES.TSPropertySignature
      );

    default:
      return [];
  }
}

function getLocalTypeParameterNames(
  node: import("../../utils/rule-helpers.js").SupportedDeclaration
): Set<string> {
  switch (node.type) {
    case AST_NODE_TYPES.ClassDeclaration:
    case AST_NODE_TYPES.TSInterfaceDeclaration:
    case AST_NODE_TYPES.TSTypeAliasDeclaration:
      return new Set(node.typeParameters?.params.map((param) => param.name.name) ?? []);

    default:
      return new Set();
  }
}

function isOptionalProperty(
  member: TSESTree.PropertyDefinition | TSESTree.TSPropertySignature,
  services: ParserServicesWithTypeInformation
): boolean {
  const tsMember = services.esTreeNodeToTSNodeMap.get(member);
  return (
    (ts.isPropertyDeclaration(tsMember) || ts.isPropertySignature(tsMember)) &&
    tsMember.questionToken !== undefined
  );
}

function isIdentifierLike(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value);
}

/**
 * ESLint rule that validates built-in `@discriminator` declarations.
 *
 * @public
 */
export const validDiscriminator = createRule<[], MessageIds>({
  name: "constraint-validation/valid-discriminator",
  meta: {
    type: "problem",
    docs: {
      description:
        "Validates declaration placement, targeting, and source operands for @discriminator",
    },
    schema: [],
    messages: {
      invalidPlacement:
        'Tag "@discriminator" is only allowed on class, interface, or object type alias declarations.',
      missingTarget: 'Tag "@discriminator" requires a direct property target.',
      nestedTarget: 'Tag "@discriminator" only supports direct properties, not nested paths.',
      invalidSourceOperand:
        'Tag "@discriminator" requires a single local type parameter name as its source operand.',
      nonLocalTypeParameter:
        'Tag "@discriminator" references type parameter "{{typeParameter}}" which is not declared on this declaration.',
      missingTargetField:
        'Tag "@discriminator" targets "{{target}}" but that property does not exist on this declaration.',
      optionalTargetField:
        'Tag "@discriminator" targets "{{target}}" but that property is optional.',
      nullableTargetField:
        'Tag "@discriminator" targets "{{target}}" but that property is nullable.',
      nonStringLikeTargetField:
        'Tag "@discriminator" targets "{{target}}" but that property is not string-like ({{actualType}}).',
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);

    return createDeclarationVisitor((node) => {
      const tags = scanFormSpecTags(node, context.sourceCode).filter(
        (tag) => tag.normalizedName === "discriminator"
      );
      if (tags.length === 0) {
        return;
      }

      if (
        node.type === AST_NODE_TYPES.PropertyDefinition ||
        node.type === AST_NODE_TYPES.TSPropertySignature ||
        (node.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
          node.typeAnnotation.type !== AST_NODE_TYPES.TSTypeLiteral)
      ) {
        for (const tag of tags) {
          context.report({
            loc: tag.comment.loc,
            messageId: "invalidPlacement",
          });
        }
        return;
      }

      const declarationType = getDeclarationType(node, services);
      if (!declarationType) {
        for (const tag of tags) {
          context.report({
            loc: tag.comment.loc,
            messageId: "invalidPlacement",
          });
        }
        return;
      }

      const localTypeParameters = getLocalTypeParameterNames(node);
      const directMembers = getDirectPropertyMembers(node);

      for (const tag of tags) {
        if (tag.target === null) {
          context.report({
            loc: tag.comment.loc,
            messageId: "missingTarget",
          });
          continue;
        }

        if (tag.target.value.includes(".")) {
          context.report({
            loc: tag.comment.loc,
            messageId: "nestedTarget",
          });
          continue;
        }

        const targetMember = directMembers.find(
          (member) => getDeclarationName(member) === tag.target?.value
        );
        if (!targetMember) {
          context.report({
            loc: tag.comment.loc,
            messageId: "missingTargetField",
            data: { target: tag.target.value },
          });
          continue;
        }

        if (!isIdentifierLike(tag.valueText)) {
          context.report({
            loc: tag.comment.loc,
            messageId: "invalidSourceOperand",
          });
          continue;
        }

        if (!localTypeParameters.has(tag.valueText)) {
          context.report({
            loc: tag.comment.loc,
            messageId: "nonLocalTypeParameter",
            data: { typeParameter: tag.valueText },
          });
          continue;
        }

        if (isOptionalProperty(targetMember, services)) {
          context.report({
            loc: targetMember.key.loc,
            messageId: "optionalTargetField",
            data: { target: tag.target.value },
          });
          continue;
        }

        const targetType = getDeclarationType(targetMember, services);
        if (!targetType) {
          context.report({
            loc: targetMember.key.loc,
            messageId: "missingTargetField",
            data: { target: tag.target.value },
          });
          continue;
        }

        if (isNullableType(targetType)) {
          context.report({
            loc: targetMember.key.loc,
            messageId: "nullableTargetField",
            data: { target: tag.target.value },
          });
          continue;
        }

        if (!isStringType(targetType, services.program.getTypeChecker())) {
          context.report({
            loc: targetMember.key.loc,
            messageId: "nonStringLikeTargetField",
            data: {
              target: tag.target.value,
              actualType: getResolvedTypeName(targetType, services),
            },
          });
        }
      }
    });
  },
});
