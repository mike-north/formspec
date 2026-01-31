/**
 * Rule: no-conflicting-decorators
 *
 * Ensures a field doesn't have decorators that imply conflicting types.
 *
 * Invalid:
 *   @Min(0)           // Implies number
 *   @Placeholder("x") // Implies string
 *   field!: string;
 *
 *   @MinItems(1)      // Implies array
 *   @Min(0)           // Implies number
 *   field!: number[];
 */

import { ESLintUtils } from "@typescript-eslint/utils";
import {
  getFormSpecDecorators,
  DECORATOR_TYPE_HINTS,
  type TypeHintDecorator,
} from "../utils/decorator-utils.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds = "conflictingDecorators";

export const noConflictingDecorators = createRule<[], MessageIds>({
  name: "no-conflicting-decorators",
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensures a field doesn't have decorators that imply conflicting types",
    },
    messages: {
      conflictingDecorators:
        "Field has conflicting decorators: @{{decorator1}} implies {{type1}}, but @{{decorator2}} implies {{type2}}",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      PropertyDefinition(node) {
        const decorators = getFormSpecDecorators(node);
        if (decorators.length < 2) return;

        // Collect type hints from decorators
        const typeHints: { decorator: string; type: string }[] = [];

        for (const decorator of decorators) {
          // Only process decorators that have type hints
          if (decorator.name in DECORATOR_TYPE_HINTS) {
            const decoratorName = decorator.name as TypeHintDecorator;
            const typeHint = DECORATOR_TYPE_HINTS[decoratorName];
            typeHints.push({ decorator: decoratorName, type: typeHint });
          }
        }

        // Check for conflicts
        if (typeHints.length < 2) return;

        const firstHint = typeHints[0];
        if (!firstHint) return;

        for (let i = 1; i < typeHints.length; i++) {
          const hint = typeHints[i];
          if (!hint) continue;

          if (hint.type !== firstHint.type) {
            context.report({
              node: node.key,
              messageId: "conflictingDecorators",
              data: {
                decorator1: firstHint.decorator,
                type1: firstHint.type,
                decorator2: hint.decorator,
                type2: hint.type,
              },
            });
            // Only report once per field
            break;
          }
        }
      },
    };
  },
});
