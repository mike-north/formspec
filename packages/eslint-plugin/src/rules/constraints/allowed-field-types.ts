/**
 * Rule: constraints/allowed-field-types
 *
 * Validates that field types used in the Chain DSL are allowed by the
 * project's constraint configuration.
 *
 * Works with: field.text(), field.number(), field.boolean(), field.enum(),
 * field.dynamicEnum(), field.dynamicSchema(), field.array(), field.object()
 */

import { ESLintUtils, AST_NODE_TYPES } from "@typescript-eslint/utils";
import type { TSESTree } from "@typescript-eslint/utils";
import {
  getFieldTypeSeverity,
  type FieldTypeConstraints,
  type Severity as _Severity,
} from "@formspec/constraints/browser";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds = "disallowedFieldType";

/**
 * Maps DSL method names to constraint config keys.
 */
const METHOD_TO_CONSTRAINT: Record<string, keyof FieldTypeConstraints> = {
  text: "text",
  number: "number",
  boolean: "boolean",
  enum: "staticEnum",
  dynamicEnum: "dynamicEnum",
  dynamicSchema: "dynamicSchema",
  array: "array",
  arrayWithConfig: "array",
  object: "object",
  objectWithConfig: "object",
};

/**
 * Human-readable names for field types.
 */
const FIELD_TYPE_NAMES: Record<string, string> = {
  text: "text field",
  number: "number field",
  boolean: "boolean field",
  enum: "static enum field",
  dynamicEnum: "dynamic enum field",
  dynamicSchema: "dynamic schema field",
  array: "array field",
  arrayWithConfig: "array field",
  object: "object field",
  objectWithConfig: "object field",
};

export type Options = [FieldTypeConstraints];

export const allowedFieldTypes = createRule<Options, MessageIds>({
  name: "constraints-allowed-field-types",
  meta: {
    type: "problem",
    docs: {
      description:
        "Validates that field types are allowed by the project's constraints",
    },
    messages: {
      disallowedFieldType:
        "{{fieldTypeName}} is not allowed in this project. Field: '{{fieldName}}'",
    },
    schema: [
      {
        type: "object",
        properties: {
          text: { type: "string", enum: ["error", "warn", "off"] },
          number: { type: "string", enum: ["error", "warn", "off"] },
          boolean: { type: "string", enum: ["error", "warn", "off"] },
          staticEnum: { type: "string", enum: ["error", "warn", "off"] },
          dynamicEnum: { type: "string", enum: ["error", "warn", "off"] },
          dynamicSchema: { type: "string", enum: ["error", "warn", "off"] },
          array: { type: "string", enum: ["error", "warn", "off"] },
          object: { type: "string", enum: ["error", "warn", "off"] },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{}],
  create(context) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- RuleTester may not apply defaultOptions
    const constraints = context.options[0] ?? {};

    return {
      CallExpression(node) {
        // Check for field.xxx() pattern
        if (
          node.callee.type !== AST_NODE_TYPES.MemberExpression ||
          node.callee.object.type !== AST_NODE_TYPES.Identifier ||
          node.callee.object.name !== "field" ||
          node.callee.property.type !== AST_NODE_TYPES.Identifier
        ) {
          return;
        }

        const methodName = node.callee.property.name;
        const constraintKey = METHOD_TO_CONSTRAINT[methodName];

        if (!constraintKey) {
          return; // Not a recognized field method
        }

        // Map constraint key to internal field type for severity check
        const fieldTypeMap: Record<keyof FieldTypeConstraints, string> = {
          text: "text",
          number: "number",
          boolean: "boolean",
          staticEnum: "enum",
          dynamicEnum: "dynamic_enum",
          dynamicSchema: "dynamic_schema",
          array: "array",
          object: "object",
        };

        const internalFieldType = fieldTypeMap[constraintKey];
        const severity = getFieldTypeSeverity(internalFieldType, constraints);

        if (severity === "off") {
          return; // Allowed
        }

        // Extract field name from first argument
        const fieldName = extractFieldName(node.arguments[0]);
        const fieldTypeName =
          FIELD_TYPE_NAMES[methodName] ?? `${methodName} field`;

        context.report({
          node: node.callee.property,
          messageId: "disallowedFieldType",
          data: {
            fieldTypeName,
            fieldName,
          },
        });
      },
    };
  },
});

/**
 * Extracts the field name from the first argument of a field.xxx() call.
 */
function extractFieldName(arg: TSESTree.Node | undefined): string {
  if (!arg) return "<unknown>";

  if (arg.type === AST_NODE_TYPES.Literal && typeof arg.value === "string") {
    return arg.value;
  }

  if (arg.type === AST_NODE_TYPES.TemplateLiteral && arg.quasis.length === 1) {
    return arg.quasis[0]?.value.cooked ?? "<unknown>";
  }

  return "<dynamic>";
}
