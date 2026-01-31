/**
 * Rule: min-max-valid-range
 *
 * Ensures @Min value is less than or equal to @Max value when both are present.
 *
 * Valid:
 *   @Min(0)
 *   @Max(100)
 *   value!: number;
 *
 *   @Min(5)
 *   @Max(5)  // Equal is OK
 *   value!: number;
 *
 * Invalid:
 *   @Min(100)
 *   @Max(50)  // Min > Max
 *   value!: number;
 */

import { ESLintUtils } from "@typescript-eslint/utils";
import { findDecorator, getDecoratorLiteralArg } from "../utils/decorator-utils.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds = "minGreaterThanMax" | "minItemsGreaterThanMaxItems";

export const minMaxValidRange = createRule<[], MessageIds>({
  name: "min-max-valid-range",
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensures @Min/@Max and @MinItems/@MaxItems have valid ranges",
    },
    messages: {
      minGreaterThanMax:
        "@Min({{min}}) is greater than @Max({{max}}). Min must be less than or equal to Max.",
      minItemsGreaterThanMaxItems:
        "@MinItems({{min}}) is greater than @MaxItems({{max}}). MinItems must be less than or equal to MaxItems.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      PropertyDefinition(node) {
        // Check @Min/@Max
        const minDecorator = findDecorator(node, "Min");
        const maxDecorator = findDecorator(node, "Max");

        if (minDecorator && maxDecorator) {
          const minValue = getDecoratorLiteralArg(minDecorator);
          const maxValue = getDecoratorLiteralArg(maxDecorator);

          if (
            typeof minValue === "number" &&
            typeof maxValue === "number" &&
            minValue > maxValue
          ) {
            context.report({
              node: minDecorator.node,
              messageId: "minGreaterThanMax",
              data: {
                min: String(minValue),
                max: String(maxValue),
              },
            });
          }
        }

        // Check @MinItems/@MaxItems
        const minItemsDecorator = findDecorator(node, "MinItems");
        const maxItemsDecorator = findDecorator(node, "MaxItems");

        if (minItemsDecorator && maxItemsDecorator) {
          const minValue = getDecoratorLiteralArg(minItemsDecorator);
          const maxValue = getDecoratorLiteralArg(maxItemsDecorator);

          if (
            typeof minValue === "number" &&
            typeof maxValue === "number" &&
            minValue > maxValue
          ) {
            context.report({
              node: minItemsDecorator.node,
              messageId: "minItemsGreaterThanMaxItems",
              data: {
                min: String(minValue),
                max: String(maxValue),
              },
            });
          }
        }
      },
    };
  },
});
