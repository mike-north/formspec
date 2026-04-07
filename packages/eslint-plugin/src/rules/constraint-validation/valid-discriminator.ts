import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from "@typescript-eslint/utils";
import type { ParserServicesWithTypeInformation } from "@typescript-eslint/utils";
import * as ts from "typescript";
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

function getObjectLikeTypeAliasMembers(
  typeNode: ts.TypeNode
): readonly ts.TypeElement[] | null {
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return getObjectLikeTypeAliasMembers(typeNode.type);
  }

  if (ts.isTypeLiteralNode(typeNode)) {
    return [...typeNode.members];
  }

  if (ts.isIntersectionTypeNode(typeNode)) {
    const members: ts.TypeElement[] = [];
    for (const intersectionMember of typeNode.types) {
      const resolvedMembers = getObjectLikeTypeAliasMembers(intersectionMember);
      if (resolvedMembers === null) {
        return null;
      }
      members.push(...resolvedMembers);
    }
    return members;
  }

  return null;
}

function isObjectLikeTypeAliasDeclaration(
  node: TSESTree.TSTypeAliasDeclaration,
  services: ParserServicesWithTypeInformation
): boolean {
  const tsNode = services.esTreeNodeToTSNodeMap.get(node);
  return ts.isTypeAliasDeclaration(tsNode) && getObjectLikeTypeAliasMembers(tsNode.type) !== null;
}

function getDirectPropertyMembers(
  node: import("../../utils/rule-helpers.js").SupportedDeclaration,
  services: ParserServicesWithTypeInformation
): readonly (TSESTree.PropertyDefinition | TSESTree.TSPropertySignature)[] {
  switch (node.type) {
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
    case AST_NODE_TYPES.TSTypeAliasDeclaration: {
      const tsNode = services.esTreeNodeToTSNodeMap.get(node);
      if (!ts.isTypeAliasDeclaration(tsNode)) {
        return [];
      }

      const directMembers = getObjectLikeTypeAliasMembers(tsNode.type) ?? [];
      return directMembers.flatMap((member) => {
        if (!ts.isPropertySignature(member)) {
          return [];
        }

        const estreeNode = services.tsNodeToESTreeNodeMap.get(member);
        return estreeNode.type === AST_NODE_TYPES.TSPropertySignature ? [estreeNode] : [];
      });
    }
    default:
      return [];
  }
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
          !isObjectLikeTypeAliasDeclaration(node, services))
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
      const checker = services.program.getTypeChecker();
      const directMembers = getDirectPropertyMembers(node, services);

      for (const tag of tags) {
        const target = tag.target;
        if (target === null) {
          context.report({
            loc: tag.comment.loc,
            messageId: "missingTarget",
          });
          continue;
        }

        if (target.value.includes(".")) {
          context.report({
            loc: tag.comment.loc,
            messageId: "nestedTarget",
          });
          continue;
        }

        const targetMember = directMembers.find(
          (member) => getDeclarationName(member) === target.value
        );
        if (!targetMember) {
          context.report({
            loc: tag.comment.loc,
            messageId: "missingTargetField",
            data: { target: target.value },
          });
          continue;
        }
        const targetLoc = targetMember.key.loc;

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
            loc: targetLoc,
            messageId: "optionalTargetField",
            data: { target: target.value },
          });
          continue;
        }

        const targetType = getDeclarationType(targetMember, services);
        if (targetType === null) {
          context.report({
            loc: targetLoc,
            messageId: "missingTargetField",
            data: { target: target.value },
          });
          continue;
        }

        if (isNullableType(targetType)) {
          context.report({
            loc: targetLoc,
            messageId: "nullableTargetField",
            data: { target: target.value },
          });
          continue;
        }

        if (!isStringType(targetType, checker)) {
          context.report({
            loc: targetLoc,
            messageId: "nonStringLikeTargetField",
            data: {
              target: target.value,
              actualType: getResolvedTypeName(targetType, services),
            },
          });
        }
      }
    });
  },
});
