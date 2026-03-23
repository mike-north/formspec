/**
 * Factory for creating ESLint rules that validate custom JSDoc constraint tags.
 *
 * Extension authors can use this factory to create rules for their own
 * constraint tags (e.g., `@MaxSigFig`, `@MyPattern`) without duplicating the
 * JSDoc parsing and error-reporting boilerplate.
 *
 * @example
 * ```typescript
 * import { createConstraintRule } from "@formspec/eslint-plugin/base";
 *
 * export const maxSigFigRule = createConstraintRule({
 *   tagName: "MaxSigFig",
 *   applicableTypes: ["number"],
 *   validateValue: (value) => {
 *     const n = Number(value);
 *     if (Number.isNaN(n)) return `@MaxSigFig value must be a number, got "${value}"`;
 *     if (n < 1) return `@MaxSigFig must be at least 1, got ${String(n)}`;
 *     return null;
 *   },
 * });
 * ```
 */

import { ESLintUtils, AST_NODE_TYPES } from "@typescript-eslint/utils";
import type { RuleModule } from "@typescript-eslint/utils/ts-eslint";
import { getArbitraryJSDocTag } from "../utils/jsdoc-utils.js";
import { getPropertyType, getFieldTypeCategory } from "../utils/type-utils.js";
import type { FieldTypeCategory } from "../utils/type-utils.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

/**
 * Options for the `createConstraintRule` factory.
 */
export interface ConstraintRuleOptions {
  /**
   * The JSDoc tag name to validate (without the `@` prefix).
   *
   * @example "MaxSigFig", "CustomPattern", "RequiredFormat"
   */
  tagName: string;

  /**
   * The TypeScript field type categories that this tag is valid on.
   *
   * Valid categories: `"string"`, `"number"`, `"boolean"`, `"array"`,
   * `"object"`, `"union"`, `"unknown"`.
   *
   * If the tag is found on a field whose category is not in this list, the
   * rule reports a `typeMismatch` error.
   *
   * Pass an empty array (`[]`) to skip type checking entirely — the tag is
   * valid on any field type.
   */
  applicableTypes: FieldTypeCategory[];

  /**
   * Optional value validator. Called with the trimmed raw string value parsed
   * from the JSDoc comment. Return an error message string if the value is
   * invalid, or `null` if it is valid.
   *
   * @example
   * ```typescript
   * validateValue: (value) => {
   *   const n = Number(value);
   *   if (Number.isNaN(n)) return `Value must be numeric, got "${value}"`;
   *   return null;
   * }
   * ```
   */
  validateValue?: (value: string) => string | null;
}

type MessageIds = "typeMismatch" | "invalidValue";

/**
 * Creates an ESLint rule that validates a custom JSDoc constraint tag.
 *
 * The generated rule checks two things:
 *
 * 1. **Type compatibility**: if `applicableTypes` is non-empty, the tag must
 *    be on a field whose TypeScript type category is in the list.
 * 2. **Value validity**: if `validateValue` is provided, the tag's raw string
 *    value must pass the validator.
 *
 * When the type check fails, value validation is skipped for that tag.
 *
 * @param options - Configuration for the generated rule
 * @returns A typed `@typescript-eslint` rule module
 */
export function createConstraintRule(options: ConstraintRuleOptions): RuleModule<MessageIds, []> {
  const { tagName, applicableTypes, validateValue } = options;

  const applicableTypesLabel = applicableTypes.length > 0 ? applicableTypes.join(", ") : "(any)";

  return createRule<[], MessageIds>({
    name: `constraint-rule/${tagName}`,
    meta: {
      type: "problem",
      docs: {
        description: `Validates the @${tagName} JSDoc constraint tag`,
      },
      messages: {
        typeMismatch: `@${tagName} cannot be used on a {{actualType}} field. Applicable types: ${applicableTypesLabel}`,
        invalidValue: `@${tagName} has an invalid value: {{error}}`,
      },
      schema: [],
    },
    defaultOptions: [],
    create(context) {
      const services = ESLintUtils.getParserServices(context);
      const checker = services.program.getTypeChecker();

      return {
        PropertyDefinition(node) {
          const matching = getArbitraryJSDocTag(tagName, node, context.sourceCode);
          if (matching.length === 0) return;

          // Type check: only run when applicableTypes is non-empty
          if (applicableTypes.length > 0) {
            const type = getPropertyType(node, services);
            if (type) {
              const fieldTypeCategory = getFieldTypeCategory(type, checker);

              if (!applicableTypes.includes(fieldTypeCategory)) {
                const actualType = checker.typeToString(type);
                const fieldName =
                  node.key.type === AST_NODE_TYPES.Identifier ? node.key.name : "<computed>";

                for (const tag of matching) {
                  context.report({
                    loc: tag.comment.loc,
                    messageId: "typeMismatch",
                    data: {
                      tagName,
                      actualType,
                      fieldName,
                    },
                  });
                }
                // Skip value validation when the type is already wrong
                return;
              }
            }
          }

          // Value validation
          if (validateValue) {
            for (const tag of matching) {
              const error = validateValue(tag.value);
              if (error !== null) {
                context.report({
                  loc: tag.comment.loc,
                  messageId: "invalidValue",
                  data: { error },
                });
              }
            }
          }
        },
      };
    },
  });
}
