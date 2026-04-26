import { ESLintUtils } from "@typescript-eslint/utils";
import {
  createDeclarationVisitor,
  getDeclarationName,
  getDeclarationType,
  getResolvedTypeName,
  resolveTagTarget,
} from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";
import { getFieldTypeCategory, type FieldTypeCategory } from "../../utils/type-utils.js";
import { getTagMetadata } from "../../utils/tag-metadata.js";
import {
  getTagDefinition,
  readExtensionRegistryFromSettings,
  type SemanticCapability,
} from "@formspec/analysis/internal";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds = "typeMismatch";

const CAPABILITY_TO_FIELD_TYPES: Record<SemanticCapability, FieldTypeCategory[]> = {
  "numeric-comparable": ["number", "bigint"],
  "string-like": ["string"],
  "array-like": ["array"],
  "enum-member-addressable": ["string", "union"],
  "json-like": [],
  "condition-like": [],
  "object-like": ["object"],
};

function getExpectedTypesForTag(tagName: string): FieldTypeCategory[] | null {
  const definition = getTagDefinition(tagName);
  if (definition === null) return null;
  const capabilities = definition.capabilities;
  if (capabilities.length === 0) return null;
  const types: FieldTypeCategory[] = [];
  for (const cap of capabilities) {
    // CAPABILITY_TO_FIELD_TYPES covers all SemanticCapability variants
    const capTypes = CAPABILITY_TO_FIELD_TYPES[cap];
    if (capTypes.length === 0) {
      // json-like or condition-like: skip type check entirely
      return null;
    }
    for (const t of capTypes) {
      if (!types.includes(t)) types.push(t);
    }
  }
  return types.length > 0 ? types : null;
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
        const expectedTypes = getExpectedTypesForTag(tag.normalizedName);
        if (!expectedTypes) continue;
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
        const actualCategory = getFieldTypeCategory(resolved.type, checker);
        if (expectedTypes.includes(actualCategory)) continue;

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
            expected: expectedTypes.join(" or "),
            field: fieldName,
            actualType: getResolvedTypeName(resolved.type, services),
          },
        });
      }
    });
  },
});
