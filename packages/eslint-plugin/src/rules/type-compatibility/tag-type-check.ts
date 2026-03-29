import { ESLintUtils } from "@typescript-eslint/utils";
import {
  createDeclarationVisitor,
  getDeclarationName,
  getDeclarationType,
  getResolvedTypeName,
  resolveTagTarget,
} from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";
import { getFieldTypeCategory } from "../../utils/type-utils.js";
import { getTagMetadata } from "../../utils/tag-metadata.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds = "typeMismatch";

const EXPECTED_TYPES: Record<string, string[]> = {
  minimum: ["number", "bigint"],
  maximum: ["number", "bigint"],
  exclusiveMinimum: ["number", "bigint"],
  exclusiveMaximum: ["number", "bigint"],
  multipleOf: ["number", "bigint"],
  minLength: ["string"],
  maxLength: ["string"],
  pattern: ["string"],
  minItems: ["array"],
  maxItems: ["array"],
  uniqueItems: ["array"],
  enumOptions: ["string", "union"],
};

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

    return createDeclarationVisitor((node) => {
      const declarationType = getDeclarationType(node, services);
      if (!declarationType) return;
      const fieldName = getDeclarationName(node);
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        const expectedTypes = EXPECTED_TYPES[tag.normalizedName];
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
