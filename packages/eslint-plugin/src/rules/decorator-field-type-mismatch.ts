/**
 * Rule: decorator-field-type-mismatch
 *
 * Ensures FormSpec decorators are applied to fields with compatible types:
 * - @Min/@Max only on number fields
 * - @MinItems/@MaxItems only on array fields
 * - @Placeholder only on string fields
 */

import { ESLintUtils, AST_NODE_TYPES } from "@typescript-eslint/utils";
import {
  getFormSpecDecorators,
  DECORATOR_TYPE_HINTS,
  type TypeHintDecorator,
} from "../utils/decorator-utils.js";
import {
  getPropertyType,
  getFieldTypeCategory,
  type FieldTypeCategory,
} from "../utils/type-utils.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds =
  | "minMaxOnNonNumber"
  | "minMaxItemsOnNonArray"
  | "placeholderOnNonString";

const EXPECTED_TYPES: Record<TypeHintDecorator, FieldTypeCategory[]> = {
  Min: ["number"],
  Max: ["number"],
  Placeholder: ["string"],
  MinItems: ["array"],
  MaxItems: ["array"],
  EnumOptions: ["string", "union"], // Handled by separate rule
};

const DECORATOR_MESSAGE_IDS: Partial<Record<TypeHintDecorator, MessageIds>> = {
  Min: "minMaxOnNonNumber",
  Max: "minMaxOnNonNumber",
  Placeholder: "placeholderOnNonString",
  MinItems: "minMaxItemsOnNonArray",
  MaxItems: "minMaxItemsOnNonArray",
};

export const decoratorFieldTypeMismatch = createRule<[], MessageIds>({
  name: "decorator-field-type-mismatch",
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensures FormSpec decorators are applied to fields with compatible types",
    },
    messages: {
      minMaxOnNonNumber:
        "@{{decorator}} can only be used on number fields, but field '{{field}}' has type '{{actualType}}'",
      minMaxItemsOnNonArray:
        "@{{decorator}} can only be used on array fields, but field '{{field}}' has type '{{actualType}}'",
      placeholderOnNonString:
        "@Placeholder can only be used on string fields, but field '{{field}}' has type '{{actualType}}'",
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
        if (decorators.length === 0) return;

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
      },
    };
  },
});
