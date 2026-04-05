import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import type { ParserServicesWithTypeInformation } from "@typescript-eslint/utils";
import type ts from "typescript";
import {
  getStringLiteralUnionValues,
  getTypeChecker,
  typeToString,
} from "./type-utils.js";
import type { ScannedTag } from "./tag-scanner.js";

export type SupportedDeclaration =
  | TSESTree.PropertyDefinition
  | TSESTree.TSPropertySignature
  | TSESTree.ClassDeclaration
  | TSESTree.TSInterfaceDeclaration
  | TSESTree.TSTypeAliasDeclaration;

export interface ResolvedTagTarget {
  readonly valid: boolean;
  readonly reason: "none" | "unknownPath" | "unknownMember" | "memberTargetOnNonUnion";
  readonly type: ts.Type | null;
}

export function createDeclarationVisitor(
  callback: (node: SupportedDeclaration) => void
): Record<string, (node: TSESTree.Node) => void> {
  return {
    PropertyDefinition(node) {
      callback(node as SupportedDeclaration);
    },
    TSPropertySignature(node) {
      callback(node as SupportedDeclaration);
    },
    ClassDeclaration(node) {
      callback(node as SupportedDeclaration);
    },
    TSInterfaceDeclaration(node) {
      callback(node as SupportedDeclaration);
    },
    TSTypeAliasDeclaration(node) {
      callback(node as SupportedDeclaration);
    },
  };
}

export function getDeclarationName(node: SupportedDeclaration): string {
  switch (node.type) {
    case AST_NODE_TYPES.PropertyDefinition:
    case AST_NODE_TYPES.TSPropertySignature:
      if (
        node.key.type === AST_NODE_TYPES.Identifier ||
        node.key.type === AST_NODE_TYPES.PrivateIdentifier
      ) {
        return node.key.name;
      }
      if (node.key.type === AST_NODE_TYPES.Literal && typeof node.key.value === "string") {
        return node.key.value;
      }
      return "<computed>";

    case AST_NODE_TYPES.ClassDeclaration:
    case AST_NODE_TYPES.TSInterfaceDeclaration:
    case AST_NODE_TYPES.TSTypeAliasDeclaration:
      return node.id?.name ?? "<anonymous>";

    default:
      return "<computed>";
  }
}

export function getDeclarationType(
  node: SupportedDeclaration,
  services: ParserServicesWithTypeInformation
): ts.Type | null {
  try {
    const checker = services.program.getTypeChecker();
    const tsNode = services.esTreeNodeToTSNodeMap.get(node);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- map.get() can return undefined
    if (!tsNode) return null;

    return checker.getTypeAtLocation(tsNode);
  } catch {
    return null;
  }
}

export function resolveTagTarget(
  tag: ScannedTag,
  declarationType: ts.Type,
  services: ParserServicesWithTypeInformation
): ResolvedTagTarget {
  if (!tag.target) {
    return { valid: true, reason: "none", type: declarationType };
  }

  if (tag.target.kind === "variant") {
    return { valid: true, reason: "none", type: declarationType };
  }

  const checker = getTypeChecker(services);
  if (tag.target.kind === "path") {
    let currentType: ts.Type = declarationType;
    for (const segment of tag.target.value.split(".")) {
      const property = currentType.getProperty(segment);
      if (!property?.valueDeclaration) {
        return { valid: false, reason: "unknownPath", type: null };
      }
      currentType = checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration);
    }
    return {
      valid: true,
      reason: "none",
      type: currentType,
    };
  }

  const members = getStringLiteralUnionValues(declarationType, checker);
  if (!members) {
    return { valid: false, reason: "memberTargetOnNonUnion", type: null };
  }
  if (!members.includes(tag.target.value)) {
    return { valid: false, reason: "unknownMember", type: null };
  }
  return { valid: true, reason: "none", type: declarationType };
}

export function getResolvedTypeName(
  type: ts.Type | null,
  services: ParserServicesWithTypeInformation
): string {
  if (!type) return "unknown";
  return typeToString(type, getTypeChecker(services));
}
