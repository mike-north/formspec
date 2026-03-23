/**
 * Rule: constraint-type-mismatch
 *
 * Ensures JSDoc constraints are applied to fields with compatible types:
 * - @Minimum/@Maximum/@ExclusiveMinimum/@ExclusiveMaximum only on number fields
 * - @MinLength/@MaxLength/@Pattern only on string fields
 */

import { ESLintUtils, AST_NODE_TYPES } from "@typescript-eslint/utils";
import { getJSDocConstraints } from "../utils/jsdoc-utils.js";
import {
  getPropertyType,
  getFieldTypeCategory,
  type FieldTypeCategory,
} from "../utils/type-utils.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds = "numericOnNonNumber" | "stringOnNonString";

const EXPECTED_TYPES: Record<string, FieldTypeCategory[]> = {
  Minimum: ["number"],
  Maximum: ["number"],
  ExclusiveMinimum: ["number"],
  ExclusiveMaximum: ["number"],
  MinLength: ["string"],
  MaxLength: ["string"],
  Pattern: ["string"],
  EnumOptions: ["string", "union"],
};

const CONSTRAINT_MESSAGE_IDS: Record<string, MessageIds | undefined> = {
  Minimum: "numericOnNonNumber",
  Maximum: "numericOnNonNumber",
  ExclusiveMinimum: "numericOnNonNumber",
  ExclusiveMaximum: "numericOnNonNumber",
  MinLength: "stringOnNonString",
  MaxLength: "stringOnNonString",
  Pattern: "stringOnNonString",
};

export const constraintTypeMismatch = createRule<[], MessageIds>({
  name: "constraint-type-mismatch",
  meta: {
    type: "problem",
    docs: {
      description: "Ensures JSDoc constraints are applied to fields with compatible types",
    },
    messages: {
      numericOnNonNumber:
        "@{{constraint}} can only be used on number fields, but field '{{field}}' has type '{{actualType}}'",
      stringOnNonString:
        "@{{constraint}} can only be used on string fields, but field '{{field}}' has type '{{actualType}}'",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    return {
      PropertyDefinition(node) {
        const jsdocConstraints = getJSDocConstraints(node, context.sourceCode);

        if (jsdocConstraints.length === 0) return;

        const type = getPropertyType(node, services);
        if (!type) return;

        const fieldTypeCategory = getFieldTypeCategory(type, checker);
        const fieldName =
          node.key.type === AST_NODE_TYPES.Identifier ? node.key.name : "<computed>";
        const actualType = checker.typeToString(type);

        for (const constraint of jsdocConstraints) {
          const constraintName = constraint.name;
          if (constraintName === "EnumOptions") continue;

          const expectedTypes = EXPECTED_TYPES[constraintName];
          if (!expectedTypes) continue;
          const isCompatible = expectedTypes.includes(fieldTypeCategory);

          if (!isCompatible) {
            const messageId = CONSTRAINT_MESSAGE_IDS[constraintName];
            if (!messageId) continue;

            context.report({
              loc: constraint.comment.loc,
              messageId,
              data: {
                constraint: constraintName,
                field: fieldName,
                actualType,
              },
            });
          }
        }
      },
    };
  },
});
