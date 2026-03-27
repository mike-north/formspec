import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { getTagIdentity, scanFormSpecTags } from "../../utils/tag-scanner.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds =
  | "minimumGreaterThanMaximum"
  | "exclusiveMinGreaterOrEqualMax"
  | "minLengthGreaterThanMaxLength"
  | "minItemsGreaterThanMaxItems"
  | "conflictingMinimumBounds"
  | "conflictingMaximumBounds"
  | "exclusiveMaxLessOrEqualMin"
  | "maximumLessOrEqualExclusiveMin";

export const noContradictions = createRule<[], MessageIds>({
  name: "constraint-validation/no-contradictions",
  meta: {
    type: "problem",
    docs: {
      description: "Reports contradictory FormSpec constraint combinations",
    },
    schema: [],
    messages: {
      minimumGreaterThanMaximum:
        "@minimum({{min}}) is greater than @maximum({{max}}). minimum must be less than or equal to maximum.",
      exclusiveMinGreaterOrEqualMax:
        "@exclusiveMinimum({{min}}) must be less than @exclusiveMaximum({{max}}).",
      minLengthGreaterThanMaxLength:
        "@minLength({{min}}) is greater than @maxLength({{max}}). minLength must be less than or equal to maxLength.",
      minItemsGreaterThanMaxItems:
        "@minItems({{min}}) is greater than @maxItems({{max}}). minItems must be less than or equal to maxItems.",
      conflictingMinimumBounds:
        "Field has both @minimum and @exclusiveMinimum. Use only one lower bound constraint.",
      conflictingMaximumBounds:
        "Field has both @maximum and @exclusiveMaximum. Use only one upper bound constraint.",
      exclusiveMaxLessOrEqualMin:
        "@exclusiveMaximum({{max}}) must be greater than @minimum({{min}}).",
      maximumLessOrEqualExclusiveMin:
        "@maximum({{max}}) must be greater than @exclusiveMinimum({{min}}).",
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      const tags = scanFormSpecTags(node, context.sourceCode).filter(
        (tag) =>
          [
            "minimum",
            "maximum",
            "exclusiveMinimum",
            "exclusiveMaximum",
            "minLength",
            "maxLength",
            "minItems",
            "maxItems",
          ].includes(tag.normalizedName) && tag.valueText !== ""
      );

      const groups = new Map<string, Map<string, number>>();
      const locations = new Map<string, (typeof tags)[number]>();

      for (const tag of tags) {
        const groupKey = tag.target ? getTagIdentity({ ...tag, normalizedName: "_" }) : "none";
        const key = `${groupKey}|${tag.normalizedName}`;
        const parsedValue = Number(tag.valueText);
        if (!Number.isFinite(parsedValue)) continue;
        if (!groups.has(groupKey)) groups.set(groupKey, new Map());
        groups.get(groupKey)?.set(tag.normalizedName, parsedValue);
        locations.set(key, tag);
      }

      for (const [groupKey, values] of groups) {
        const report = (tagName: string, messageId: MessageIds, data?: Record<string, string>) => {
          const location = locations.get(`${groupKey}|${tagName}`);
          if (!location) return;
          if (data) {
            context.report({
              loc: location.comment.loc,
              messageId,
              data,
            });
            return;
          }
          context.report({
            loc: location.comment.loc,
            messageId,
          });
        };

        const minimum = values.get("minimum");
        const maximum = values.get("maximum");
        const exclusiveMinimum = values.get("exclusiveMinimum");
        const exclusiveMaximum = values.get("exclusiveMaximum");
        const minLength = values.get("minLength");
        const maxLength = values.get("maxLength");
        const minItems = values.get("minItems");
        const maxItems = values.get("maxItems");

        if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
          report("minimum", "minimumGreaterThanMaximum", {
            min: String(minimum),
            max: String(maximum),
          });
        }
        if (
          exclusiveMinimum !== undefined &&
          exclusiveMaximum !== undefined &&
          exclusiveMinimum >= exclusiveMaximum
        ) {
          report("exclusiveMinimum", "exclusiveMinGreaterOrEqualMax", {
            min: String(exclusiveMinimum),
            max: String(exclusiveMaximum),
          });
        }
        if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
          report("minLength", "minLengthGreaterThanMaxLength", {
            min: String(minLength),
            max: String(maxLength),
          });
        }
        if (minItems !== undefined && maxItems !== undefined && minItems > maxItems) {
          report("minItems", "minItemsGreaterThanMaxItems", {
            min: String(minItems),
            max: String(maxItems),
          });
        }
        if (minimum !== undefined && exclusiveMinimum !== undefined) {
          report("exclusiveMinimum", "conflictingMinimumBounds");
        }
        if (maximum !== undefined && exclusiveMaximum !== undefined) {
          report("exclusiveMaximum", "conflictingMaximumBounds");
        }
        if (
          minimum !== undefined &&
          exclusiveMaximum !== undefined &&
          exclusiveMaximum <= minimum
        ) {
          report("exclusiveMaximum", "exclusiveMaxLessOrEqualMin", {
            min: String(minimum),
            max: String(exclusiveMaximum),
          });
        }
        if (
          exclusiveMinimum !== undefined &&
          maximum !== undefined &&
          maximum <= exclusiveMinimum
        ) {
          report("maximum", "maximumLessOrEqualExclusiveMin", {
            min: String(exclusiveMinimum),
            max: String(maximum),
          });
        }
      }
    });
  },
});
