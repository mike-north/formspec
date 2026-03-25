/**
 * Rule: consistent-constraints
 *
 * Ensures JSDoc constraint pairs have valid ranges and don't conflict:
 * - @minimum must be <= @maximum
 * - @exclusiveMinimum must be < @exclusiveMaximum
 * - @minLength must be <= @maxLength
 * - @minItems must be <= @maxItems
 * - @minimum and @exclusiveMinimum must not both be present
 * - @maximum and @exclusiveMaximum must not both be present
 * - @maximum(n) where n < @minimum(m) is invalid
 * - @exclusiveMaximum(n) where n <= @minimum(m) is invalid
 */

import type { TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils } from "@typescript-eslint/utils";
import { getJSDocConstraints, findJSDocConstraint } from "../utils/jsdoc-utils.js";

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

interface ConstraintResult {
  value: number;
  loc: TSESTree.SourceLocation;
}

interface PresenceResult {
  present: boolean;
  loc: TSESTree.SourceLocation | null;
}

export const consistentConstraints = createRule<[], MessageIds>({
  name: "consistent-constraints",
  meta: {
    type: "problem",
    docs: {
      description: "Ensures JSDoc constraint pairs have valid ranges and don't conflict",
    },
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
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      PropertyDefinition(node) {
        const jsdocConstraints = getJSDocConstraints(node, sourceCode);

        // Nothing to check without any constraints
        if (jsdocConstraints.length === 0) return;

        /**
         * Gets a numeric constraint value from a JSDoc tag.
         * Returns null if the constraint is absent or non-numeric.
         */
        function getConstraintValue(name: string): ConstraintResult | null {
          const jsdoc = findJSDocConstraint(jsdocConstraints, name);

          if (jsdoc && typeof jsdoc.value === "number") {
            return { value: jsdoc.value, loc: jsdoc.comment.loc };
          }

          return null;
        }

        /**
         * Checks whether a constraint is present.
         */
        function hasConstraint(name: string): PresenceResult {
          const jsdoc = findJSDocConstraint(jsdocConstraints, name);

          if (jsdoc) return { present: true, loc: jsdoc.comment.loc };
          return { present: false, loc: null };
        }

        // Check @minimum/@maximum range
        const minimum = getConstraintValue("minimum");
        const maximum = getConstraintValue("maximum");

        if (minimum && maximum && minimum.value > maximum.value) {
          context.report({
            loc: minimum.loc,
            messageId: "minimumGreaterThanMaximum",
            data: {
              min: String(minimum.value),
              max: String(maximum.value),
            },
          });
        }

        // Check @exclusiveMinimum/@exclusiveMaximum range
        const exclusiveMin = getConstraintValue("exclusiveMinimum");
        const exclusiveMax = getConstraintValue("exclusiveMaximum");

        if (exclusiveMin && exclusiveMax && exclusiveMin.value >= exclusiveMax.value) {
          context.report({
            loc: exclusiveMin.loc,
            messageId: "exclusiveMinGreaterOrEqualMax",
            data: {
              min: String(exclusiveMin.value),
              max: String(exclusiveMax.value),
            },
          });
        }

        // Check @minLength/@maxLength range
        const minLength = getConstraintValue("minLength");
        const maxLength = getConstraintValue("maxLength");

        if (minLength && maxLength && minLength.value > maxLength.value) {
          context.report({
            loc: minLength.loc,
            messageId: "minLengthGreaterThanMaxLength",
            data: {
              min: String(minLength.value),
              max: String(maxLength.value),
            },
          });
        }

        // Check @minItems/@maxItems range
        const minItems = getConstraintValue("minItems");
        const maxItems = getConstraintValue("maxItems");

        if (minItems && maxItems && minItems.value > maxItems.value) {
          context.report({
            loc: minItems.loc,
            messageId: "minItemsGreaterThanMaxItems",
            data: {
              min: String(minItems.value),
              max: String(maxItems.value),
            },
          });
        }

        // Check conflicting bound types: @minimum + @exclusiveMinimum
        const hasMinimum = hasConstraint("minimum");
        const hasExclusiveMinimum = hasConstraint("exclusiveMinimum");

        if (hasMinimum.present && hasExclusiveMinimum.present) {
          context.report({
            loc: hasExclusiveMinimum.loc ?? node.loc,
            messageId: "conflictingMinimumBounds",
          });
        }

        // Check conflicting bound types: @maximum + @exclusiveMaximum
        const hasMaximum = hasConstraint("maximum");
        const hasExclusiveMaximum = hasConstraint("exclusiveMaximum");

        if (hasMaximum.present && hasExclusiveMaximum.present) {
          context.report({
            loc: hasExclusiveMaximum.loc ?? node.loc,
            messageId: "conflictingMaximumBounds",
          });
        }

        // Check @exclusiveMinimum(m) + @maximum(n) where n <= m
        if (exclusiveMin && maximum && maximum.value <= exclusiveMin.value) {
          context.report({
            loc: maximum.loc,
            messageId: "maximumLessOrEqualExclusiveMin",
            data: {
              min: String(exclusiveMin.value),
              max: String(maximum.value),
            },
          });
        }

        // Check @exclusiveMaximum(n) where n <= @minimum(m)
        if (minimum && exclusiveMax && exclusiveMax.value <= minimum.value) {
          context.report({
            loc: exclusiveMax.loc,
            messageId: "exclusiveMaxLessOrEqualMin",
            data: {
              min: String(minimum.value),
              max: String(exclusiveMax.value),
            },
          });
        }
      },
    };
  },
});
