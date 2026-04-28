import { ESLintUtils } from "@typescript-eslint/utils";
import {
  createDeclarationVisitor,
  getDeclarationName,
  getDeclarationType,
  getResolvedTypeName,
  resolveTagTarget,
} from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";
import { getTagMetadata } from "../../utils/tag-metadata.js";
import {
  _capabilityLabel,
  getTagDefinition,
  hasTypeSemanticCapability,
  readExtensionRegistryFromSettings,
  type SemanticCapability,
} from "@formspec/analysis/internal";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds = "typeMismatch";

function getRequiredCapabilityForTag(tagName: string): SemanticCapability | null {
  const definition = getTagDefinition(tagName);
  if (definition === null) return null;
  const capability = definition.capabilities[0];
  if (capability === undefined) return null;

  // Preserve the current ESLint rule behavior for capabilities that do not
  // translate cleanly into a single field-kind diagnostic label.
  if (capability === "json-like" || capability === "condition-like") {
    return null;
  }

  return capability;
}

/**
 * ESLint rule that ensures FormSpec tags are applied to compatible field types.
 *
 * @public
 */
export const tagTypeCheck = createRule<[], MessageIds>({
  name: "type-compatibility/tag-type-check",
  meta: {
    type: "problem",
    docs: {
      description: "Ensures FormSpec tags are applied to compatible field types",
    },
    schema: [],
    messages: {
      typeMismatch:
        'Tag "@{{tag}}" can only be used on {{expected}} targets, but "{{field}}" resolves to type "{{actualType}}".',
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    const registry = readExtensionRegistryFromSettings(context.settings);

    return createDeclarationVisitor((node) => {
      const declarationType = getDeclarationType(node, services);
      if (!declarationType) return;
      const fieldName = getDeclarationName(node);
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        const requiredCapability = getRequiredCapabilityForTag(tag.normalizedName);
        if (requiredCapability === null) continue;
        const metadata = getTagMetadata(tag.rawName);
        const supportsValueLessCheck =
          metadata?.valueKind === "boolean" || metadata?.requiresArgument === false;
        if (tag.valueText === "" && !supportsValueLessCheck) continue;
        if (metadata?.valueKind === "number" && !Number.isFinite(Number(tag.valueText))) continue;
        if (
          metadata?.valueKind === "integer" &&
          !(Number.isInteger(Number(tag.valueText)) && Number(tag.valueText) >= 0)
        ) {
          continue;
        }
        if (tag.normalizedName === "pattern") {
          try {
            new RegExp(tag.valueText);
          } catch {
            continue;
          }
        }
        if (metadata?.valueKind === "json") {
          try {
            JSON.parse(tag.valueText);
          } catch {
            continue;
          }
        }

        const resolved = resolveTagTarget(tag, declarationType, services);
        if (!resolved.valid || !resolved.type) continue;
        if (hasTypeSemanticCapability(resolved.type, checker, requiredCapability)) continue;

        // Check for builtin constraint broadening via extension registry.
        // Use checker.typeToString for the name — it correctly resolves
        // type aliases (e.g., `type Decimal = ...` → "Decimal").
        if (
          registry?.findTypeByName !== undefined &&
          registry.findBuiltinConstraintBroadening !== undefined
        ) {
          const typeName = checker.typeToString(resolved.type);
          const typeResult = registry.findTypeByName(typeName);
          if (typeResult !== undefined) {
            const typeId = `${typeResult.extensionId}/${typeResult.registration.typeName}`;
            const broadening = registry.findBuiltinConstraintBroadening(typeId, tag.normalizedName);
            if (broadening !== undefined) continue;
          }
        }

        context.report({
          loc: tag.comment.loc,
          messageId: "typeMismatch",
          data: {
            tag: tag.rawName,
            expected: _capabilityLabel(requiredCapability),
            field: fieldName,
            actualType: getResolvedTypeName(resolved.type, services),
          },
        });
      }
    });
  },
});
