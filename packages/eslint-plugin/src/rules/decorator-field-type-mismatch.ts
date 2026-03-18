/**
 * Rule: decorator-field-type-mismatch
 *
 * Ensures FormSpec decorators are applied to fields with compatible types:
 * - @Minimum/@Maximum/@ExclusiveMinimum/@ExclusiveMaximum only on number fields
 * - @MinLength/@MaxLength/@Pattern only on string fields
 */

import { ESLintUtils, AST_NODE_TYPES } from "@typescript-eslint/utils";
import {
  getFormSpecDecorators,
  DECORATOR_TYPE_HINTS,
  type TypeHintDecorator,
} from "../utils/decorator-utils.js";
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

const EXPECTED_TYPES: Record<TypeHintDecorator, FieldTypeCategory[]> = {
  Minimum: ["number"],
  Maximum: ["number"],
  ExclusiveMinimum: ["number"],
  ExclusiveMaximum: ["number"],
  MinLength: ["string"],
  MaxLength: ["string"],
  Pattern: ["string"],
  EnumOptions: ["string", "union"], // Handled by separate rule
};

const DECORATOR_MESSAGE_IDS: Partial<Record<TypeHintDecorator, MessageIds>> = {
  Minimum: "numericOnNonNumber",
  Maximum: "numericOnNonNumber",
  ExclusiveMinimum: "numericOnNonNumber",
  ExclusiveMaximum: "numericOnNonNumber",
  MinLength: "stringOnNonString",
  MaxLength: "stringOnNonString",
  Pattern: "stringOnNonString",
};

export const decoratorFieldTypeMismatch = createRule<[], MessageIds>({
  name: "decorator-field-type-mismatch",
  meta: {
    type: "problem",
    docs: {
      description: "Ensures FormSpec decorators are applied to fields with compatible types",
    },
    messages: {
      numericOnNonNumber:
        "@{{decorator}} can only be used on number fields, but field '{{field}}' has type '{{actualType}}'",
      stringOnNonString:
        "@{{decorator}} can only be used on string fields, but field '{{field}}' has type '{{actualType}}'",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    return {
      PropertyDefinition(node) {
        const decorators = getFormSpecDecorators(node);
        const jsdocConstraints = getJSDocConstraints(node, context.sourceCode);

        // Nothing to check if there are no decorators or JSDoc constraints
        if (decorators.length === 0 && jsdocConstraints.length === 0) return;

        const type = getPropertyType(node, services);
        if (!type) return;

        const fieldTypeCategory = getFieldTypeCategory(type, checker);
        const fieldName =
          node.key.type === AST_NODE_TYPES.Identifier ? node.key.name : "<computed>";
        const actualType = checker.typeToString(type);

        for (const decorator of decorators) {
          const decoratorName = decorator.name as TypeHintDecorator;

          // Skip decorators that don't have type hints
          if (!(decoratorName in DECORATOR_TYPE_HINTS)) continue;

          // Skip EnumOptions - handled by separate rule
          if (decoratorName === "EnumOptions") continue;

          const expectedTypes = EXPECTED_TYPES[decoratorName];

          // Check if field type matches any expected type
          const isCompatible = expectedTypes.includes(fieldTypeCategory);

          if (!isCompatible) {
            const messageId = DECORATOR_MESSAGE_IDS[decoratorName];
            if (!messageId) continue;

            context.report({
              node: decorator.node,
              messageId,
              data: {
                decorator: decoratorName,
                field: fieldName,
                actualType,
              },
            });
          }
        }

        // Also check JSDoc constraint tags for type compatibility
        for (const constraint of jsdocConstraints) {
          const constraintName = constraint.name as TypeHintDecorator;
          if (!(constraintName in DECORATOR_TYPE_HINTS)) continue;
          if (constraintName === "EnumOptions") continue;

          const expectedTypes = EXPECTED_TYPES[constraintName];
          const isCompatible = expectedTypes.includes(fieldTypeCategory);

          if (!isCompatible) {
            const messageId = DECORATOR_MESSAGE_IDS[constraintName];
            if (!messageId) continue;

            context.report({
              loc: constraint.comment.loc,
              messageId,
              data: {
                decorator: constraintName,
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
