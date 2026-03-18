/**
 * Rule: prefer-custom-decorator
 *
 * When a project has symbols with FormSpecExtendsBrand<'Field'> type,
 * flags direct usage of @Field from @formspec/decorators.
 *
 * TODO: Full implementation requires type-checker integration to detect
 * FormSpecExtendsBrand symbols in scope. Currently implemented as a
 * configurable rule that accepts a list of decorator names that should
 * be preferred over @Field.
 *
 * Config example:
 *   "@formspec/prefer-custom-decorator": ["warn", { prefer: { "Field": "MyCustomField" } }]
 */

import { ESLintUtils } from "@typescript-eslint/utils";
import { getFormSpecDecorators } from "../utils/decorator-utils.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type MessageIds = "preferCustomDecorator";

export interface PreferCustomDecoratorOptions {
  prefer: Record<string, string>;
}

export const preferCustomDecorator = createRule<[PreferCustomDecoratorOptions], MessageIds>({
  name: "prefer-custom-decorator",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Suggests using a custom decorator instead of a built-in FormSpec decorator when a project-specific alternative exists",
    },
    messages: {
      preferCustomDecorator:
        "Prefer @{{preferred}} over @{{builtin}}. This project provides a custom decorator that extends the built-in.",
    },
    schema: [
      {
        type: "object",
        properties: {
          prefer: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
        required: ["prefer"],
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ prefer: {} }],
  create(context, [options]) {
    const preferMap = options.prefer;
    const builtinNames = new Set(Object.keys(preferMap));

    if (builtinNames.size === 0) return {};

    return {
      PropertyDefinition(node) {
        const decorators = getFormSpecDecorators(node);
        if (decorators.length === 0) return;

        for (const decorator of decorators) {
          if (builtinNames.has(decorator.name)) {
            const preferred = preferMap[decorator.name];
            if (!preferred) continue;

            context.report({
              node: decorator.node,
              messageId: "preferCustomDecorator",
              data: {
                builtin: decorator.name,
                preferred,
              },
            });
          }
        }
      },
    };
  },
});
