import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from "@typescript-eslint/utils";
import {
  createDeclarationVisitor,
  getDeclarationType,
  type SupportedDeclaration,
} from "../../utils/rule-helpers.js";
import { scanFormSpecTags, type ScannedTag } from "../../utils/tag-scanner.js";
import { isArrayType } from "../../utils/type-utils.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

function isNamingVariant(tag: ScannedTag): boolean {
  return (
    (tag.normalizedName === "displayName" || tag.normalizedName === "apiName") &&
    tag.target?.kind === "variant" &&
    (tag.target.value === "singular" || tag.target.value === "plural")
  );
}

function isArrayField(
  node: SupportedDeclaration
): node is TSESTree.PropertyDefinition | TSESTree.TSPropertySignature {
  return (
    node.type === AST_NODE_TYPES.PropertyDefinition ||
    node.type === AST_NODE_TYPES.TSPropertySignature
  );
}

function isValidPluralPlacement(node: SupportedDeclaration): boolean {
  // Classes can represent API resources, where both singular and plural names
  // may be needed for human-readable and programmatic contracts.
  return node.type === AST_NODE_TYPES.ClassDeclaration;
}

function isValidSingularPlacement(node: SupportedDeclaration, tag: ScannedTag): boolean {
  if (node.type === AST_NODE_TYPES.ClassDeclaration) {
    return true;
  }

  return (
    tag.normalizedName === "displayName" &&
    (node.type === AST_NODE_TYPES.TSInterfaceDeclaration ||
      node.type === AST_NODE_TYPES.TSTypeAliasDeclaration)
  );
}

/**
 * ESLint rule that validates singular/plural variant target placement for naming tags.
 *
 * @public
 */
export const validTargetVariant = createRule<[], "invalidPluralTarget" | "invalidSingularTarget">({
  name: "target-resolution/valid-target-variant",
  meta: {
    type: "problem",
    docs: {
      description:
        "Validates singular and plural variant target placement for FormSpec naming tags",
    },
    schema: [],
    messages: {
      invalidPluralTarget:
        'Variant target ":plural" is only valid on array fields and class declarations.',
      invalidSingularTarget:
        'Variant target ":singular" is only valid on array fields, class declarations, and type-level @displayName tags.',
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    return createDeclarationVisitor((node) => {
      const variantTags = scanFormSpecTags(node, context.sourceCode).filter(isNamingVariant);
      if (variantTags.length === 0) {
        return;
      }

      if (isArrayField(node)) {
        const declarationType = getDeclarationType(node, services);
        if (declarationType !== null && isArrayType(declarationType, checker)) {
          return;
        }
      }

      for (const tag of variantTags) {
        if (tag.target?.value === "plural" && isValidPluralPlacement(node)) {
          continue;
        }
        if (tag.target?.value === "singular" && isValidSingularPlacement(node, tag)) {
          continue;
        }
        context.report({
          loc: tag.comment.loc,
          messageId:
            tag.target?.value === "singular" ? "invalidSingularTarget" : "invalidPluralTarget",
        });
      }
    });
  },
});
