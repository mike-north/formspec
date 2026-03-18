/**
 * Rule: decorator-allowed-field-types
 *
 * Configurable rule restricting TypeScript field types on decorated properties.
 * Only applies to properties that have at least one FormSpec decorator.
 *
 * Config example:
 *   "@formspec/decorator-allowed-field-types": ["error", { allow: ["string", "number", "boolean", "enum"] }]
 */

import { ESLintUtils, AST_NODE_TYPES } from "@typescript-eslint/utils";
import { getFormSpecDecorators } from "../utils/decorator-utils.js";
import { getPropertyType, getFieldTypeCategory } from "../utils/type-utils.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds = "disallowedFieldType";

export interface DecoratorAllowedFieldTypesOptions {
  allow: string[];
}

export const decoratorAllowedFieldTypes = createRule<
  [DecoratorAllowedFieldTypesOptions],
  MessageIds
>({
  name: "decorator-allowed-field-types",
  meta: {
    type: "problem",
    docs: {
      description: "Restricts TypeScript field types on decorated properties to an allowed list",
    },
    messages: {
      disallowedFieldType:
        "Field '{{field}}' has type '{{actualType}}' (category: {{category}}), which is not in the allowed list: [{{allowed}}]",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
          },
        },
        required: ["allow"],
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ allow: ["string", "number", "boolean", "union"] }],
  create(context, [options]) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    const allowedSet = new Set(options.allow);

    return {
      PropertyDefinition(node) {
        const decorators = getFormSpecDecorators(node);
        if (decorators.length === 0) return;

        const type = getPropertyType(node, services);
        if (!type) return;

        const category = getFieldTypeCategory(type, checker);
        if (allowedSet.has(category)) return;

        const fieldName =
          node.key.type === AST_NODE_TYPES.Identifier ? node.key.name : "<computed>";
        const actualType = checker.typeToString(type);

        context.report({
          node: node.key,
          messageId: "disallowedFieldType",
          data: {
            field: fieldName,
            actualType,
            category,
            allowed: options.allow.join(", "),
          },
        });
      },
    };
  },
});
