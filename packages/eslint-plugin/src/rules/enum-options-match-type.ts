/**
 * Rule: enum-options-match-type
 *
 * Ensures @EnumOptions values match the field's TypeScript type.
 *
 * Valid:
 *   @EnumOptions(["a", "b", "c"])
 *   field!: "a" | "b" | "c";
 *
 *   @EnumOptions([{ id: "x", label: "X" }])
 *   field!: "x";
 *
 *   @EnumOptions(["a", "b"])
 *   field!: string;  // Permissive - string accepts any enum
 *
 * Invalid:
 *   @EnumOptions(["a", "b", "c"])
 *   field!: "x" | "y";  // Mismatch
 */

import { ESLintUtils } from "@typescript-eslint/utils";
import {
  findDecorator,
  getDecoratorArrayArg,
} from "../utils/decorator-utils.js";
import {
  getPropertyType,
  getStringLiteralUnionValues,
  isStringType,
} from "../utils/type-utils.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds = "enumOptionsMismatch" | "enumOptionsMissing" | "enumOptionsExtra";

export const enumOptionsMatchType = createRule<[], MessageIds>({
  name: "enum-options-match-type",
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensures @EnumOptions values match the field's TypeScript union type",
    },
    messages: {
      enumOptionsMismatch:
        "@EnumOptions values don't match field type. Options: [{{options}}], Type: {{fieldType}}",
      enumOptionsMissing:
        "@EnumOptions is missing values that are in the field type: [{{missing}}]",
      enumOptionsExtra:
        "@EnumOptions has values not in the field type: [{{extra}}]",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    return {
      PropertyDefinition(node) {
        const enumOptionsDecorator = findDecorator(node, "EnumOptions");
        if (!enumOptionsDecorator) return;

        const type = getPropertyType(node, services);
        if (!type) return;

        // If field type is plain `string`, any enum options are valid
        if (isStringType(type, checker) && !type.isUnion()) {
          return;
        }

        // Get the enum option values from the decorator
        const decoratorValues = getDecoratorArrayArg(enumOptionsDecorator);
        if (!decoratorValues) return;

        // Extract IDs from decorator options
        const optionIds = new Set<string>();
        for (const value of decoratorValues) {
          if (typeof value === "string") {
            optionIds.add(value);
          } else if (typeof value === "object" && value !== null && "id" in value) {
            const id = (value as { id: unknown }).id;
            if (typeof id === "string") {
              optionIds.add(id);
            }
          }
        }

        // Get the union type values from the field type
        const typeValues = getStringLiteralUnionValues(type, checker);
        if (!typeValues) {
          // Field type is not a string literal union - can't compare
          return;
        }

        const typeSet = new Set(typeValues);

        // Find missing values (in type but not in options)
        const missing: string[] = [];
        for (const v of typeValues) {
          if (!optionIds.has(v)) {
            missing.push(v);
          }
        }

        // Find extra values (in options but not in type)
        const extra: string[] = [];
        for (const v of optionIds) {
          if (!typeSet.has(v)) {
            extra.push(v);
          }
        }

        // Report specific issues
        if (missing.length > 0) {
          context.report({
            node: enumOptionsDecorator.node,
            messageId: "enumOptionsMissing",
            data: {
              missing: missing.map((v) => `"${v}"`).join(", "),
            },
          });
        }

        if (extra.length > 0) {
          context.report({
            node: enumOptionsDecorator.node,
            messageId: "enumOptionsExtra",
            data: {
              extra: extra.map((v) => `"${v}"`).join(", "),
            },
          });
        }
      },
    };
  },
});
