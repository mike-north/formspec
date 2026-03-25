/**
 * Rule: constraint-type-mismatch
 *
 * Ensures JSDoc constraints are applied to fields with compatible types:
 * - @minimum/@maximum/@exclusiveMinimum/@exclusiveMaximum/@multipleOf only on number fields
 * - @minLength/@maxLength/@pattern only on string fields
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

type MessageIds = "numericOnNonNumber" | "stringOnNonString" | "arrayOnNonArray";

const EXPECTED_TYPES: Record<string, FieldTypeCategory[]> = {
  minimum: ["number"],
  maximum: ["number"],
  exclusiveMinimum: ["number"],
  exclusiveMaximum: ["number"],
  multipleOf: ["number"],
  minLength: ["string"],
  maxLength: ["string"],
  pattern: ["string"],
  minItems: ["array"],
  maxItems: ["array"],
  enumOptions: ["string", "union"],
};

const CONSTRAINT_MESSAGE_IDS: Record<string, MessageIds | undefined> = {
  minimum: "numericOnNonNumber",
  maximum: "numericOnNonNumber",
  exclusiveMinimum: "numericOnNonNumber",
  exclusiveMaximum: "numericOnNonNumber",
  multipleOf: "numericOnNonNumber",
  minLength: "stringOnNonString",
  maxLength: "stringOnNonString",
  pattern: "stringOnNonString",
  minItems: "arrayOnNonArray",
  maxItems: "arrayOnNonArray",
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
      arrayOnNonArray:
        "@{{constraint}} can only be used on array fields, but field '{{field}}' has type '{{actualType}}'",
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
          if (constraintName === "enumOptions") continue;

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
