/**
 * Rule: consistent-constraints
 *
 * Ensures JSDoc constraint pairs have valid ranges and don't conflict:
 * - @Minimum must be <= @Maximum
 * - @ExclusiveMinimum must be < @ExclusiveMaximum
 * - @MinLength must be <= @MaxLength
 * - @Minimum and @ExclusiveMinimum must not both be present
 * - @Maximum and @ExclusiveMaximum must not both be present
 * - @Maximum(n) where n < @Minimum(m) is invalid
 * - @ExclusiveMaximum(n) where n <= @Minimum(m) is invalid
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
        "@Minimum({{min}}) is greater than @Maximum({{max}}). Minimum must be less than or equal to Maximum.",
      exclusiveMinGreaterOrEqualMax:
        "@ExclusiveMinimum({{min}}) must be less than @ExclusiveMaximum({{max}}).",
      minLengthGreaterThanMaxLength:
        "@MinLength({{min}}) is greater than @MaxLength({{max}}). MinLength must be less than or equal to MaxLength.",
      conflictingMinimumBounds:
        "Field has both @Minimum and @ExclusiveMinimum. Use only one lower bound constraint.",
      conflictingMaximumBounds:
        "Field has both @Maximum and @ExclusiveMaximum. Use only one upper bound constraint.",
      exclusiveMaxLessOrEqualMin:
        "@ExclusiveMaximum({{max}}) must be greater than @Minimum({{min}}).",
      maximumLessOrEqualExclusiveMin:
        "@Maximum({{max}}) must be greater than @ExclusiveMinimum({{min}}).",
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

        // Check @Minimum/@Maximum range
        const minimum = getConstraintValue("Minimum");
        const maximum = getConstraintValue("Maximum");

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

        // Check @ExclusiveMinimum/@ExclusiveMaximum range
        const exclusiveMin = getConstraintValue("ExclusiveMinimum");
        const exclusiveMax = getConstraintValue("ExclusiveMaximum");

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

        // Check @MinLength/@MaxLength range
        const minLength = getConstraintValue("MinLength");
        const maxLength = getConstraintValue("MaxLength");

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

        // Check conflicting bound types: @Minimum + @ExclusiveMinimum
        const hasMinimum = hasConstraint("Minimum");
        const hasExclusiveMinimum = hasConstraint("ExclusiveMinimum");

        if (hasMinimum.present && hasExclusiveMinimum.present) {
          context.report({
            loc: hasExclusiveMinimum.loc ?? node.loc,
            messageId: "conflictingMinimumBounds",
          });
        }

        // Check conflicting bound types: @Maximum + @ExclusiveMaximum
        const hasMaximum = hasConstraint("Maximum");
        const hasExclusiveMaximum = hasConstraint("ExclusiveMaximum");

        if (hasMaximum.present && hasExclusiveMaximum.present) {
          context.report({
            loc: hasExclusiveMaximum.loc ?? node.loc,
            messageId: "conflictingMaximumBounds",
          });
        }

        // Check @ExclusiveMinimum(m) + @Maximum(n) where n <= m
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

        // Check @ExclusiveMaximum(n) where n <= @Minimum(m)
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
