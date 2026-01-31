/**
 * Rule: showwhen-field-exists
 *
 * Ensures @ShowWhen references a field that exists in the same class.
 *
 * Valid:
 *   @EnumOptions(["a", "b"])
 *   type!: "a" | "b";
 *
 *   @ShowWhen({ _predicate: "equals", field: "type", value: "a" })
 *   conditionalField?: string;
 *
 * Invalid:
 *   @ShowWhen({ _predicate: "equals", field: "nonexistent", value: "x" })
 *   field?: string;  // "nonexistent" doesn't exist
 */

import { ESLintUtils, AST_NODE_TYPES } from "@typescript-eslint/utils";
import {
  findDecorator,
  getShowWhenField,
  getClassPropertyNames,
} from "../utils/decorator-utils.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds = "fieldDoesNotExist";

export const showwhenFieldExists = createRule<[], MessageIds>({
  name: "showwhen-field-exists",
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensures @ShowWhen references a field that exists in the same class",
    },
    messages: {
      fieldDoesNotExist:
        "@ShowWhen references field '{{referencedField}}' which does not exist in this class",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      PropertyDefinition(node) {
        const showWhenDecorator = findDecorator(node, "ShowWhen");
        if (!showWhenDecorator) return;

        const referencedField = getShowWhenField(showWhenDecorator);
        if (!referencedField) return;

        // Find the parent class
        // PropertyDefinition -> ClassBody -> ClassDeclaration/ClassExpression
        // TypeScript guarantees node.parent is ClassBody for PropertyDefinition
        const classBody = node.parent;
        const classNode = classBody.parent;
        if (
          classNode.type !== AST_NODE_TYPES.ClassDeclaration &&
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive check
          classNode.type !== AST_NODE_TYPES.ClassExpression
        ) {
          return;
        }

        // Get all property names in the class
        const propertyNames = getClassPropertyNames(classNode);

        // Check if the referenced field exists
        if (!propertyNames.has(referencedField)) {
          context.report({
            node: showWhenDecorator.node,
            messageId: "fieldDoesNotExist",
            data: {
              referencedField,
            },
          });
        }
      },
    };
  },
});
