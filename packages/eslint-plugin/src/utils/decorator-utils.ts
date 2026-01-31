/**
 * Utility functions for working with decorator AST nodes.
 */

import { TSESTree, AST_NODE_TYPES } from "@typescript-eslint/utils";

/**
 * Information extracted from a decorator.
 */
export interface DecoratorInfo {
  /** The decorator name (e.g., "Min", "Label", "EnumOptions") */
  name: string;
  /** The arguments passed to the decorator */
  args: TSESTree.Expression[];
  /** The original decorator node */
  node: TSESTree.Decorator;
}

/**
 * FormSpec decorator names that imply specific field types.
 */
export const DECORATOR_TYPE_HINTS = {
  // Number field decorators
  Min: "number",
  Max: "number",
  // String/text field decorators
  Placeholder: "string",
  // Array field decorators
  MinItems: "array",
  MaxItems: "array",
  // Enum field decorators
  EnumOptions: "enum",
} as const;

export type TypeHintDecorator = keyof typeof DECORATOR_TYPE_HINTS;

/**
 * All known FormSpec decorator names.
 */
export const FORMSPEC_DECORATORS = new Set([
  "FormClass",
  "Label",
  "Optional",
  "Placeholder",
  "Min",
  "Max",
  "EnumOptions",
  "Group",
  "ShowWhen",
  "MinItems",
  "MaxItems",
]);

/**
 * Extracts decorator information from a Decorator AST node.
 *
 * Handles both:
 * - `@DecoratorName` (identifier)
 * - `@DecoratorName(args)` (call expression)
 *
 * @param decorator - The decorator AST node
 * @returns Decorator info or null if not a recognized pattern
 */
export function getDecoratorInfo(decorator: TSESTree.Decorator): DecoratorInfo | null {
  const expr = decorator.expression;

  // Case 1: @DecoratorName() - CallExpression
  if (expr.type === AST_NODE_TYPES.CallExpression) {
    const callee = expr.callee;
    if (callee.type === AST_NODE_TYPES.Identifier) {
      return {
        name: callee.name,
        args: expr.arguments as TSESTree.Expression[],
        node: decorator,
      };
    }
  }

  // Case 2: @DecoratorName - Identifier (no parentheses)
  if (expr.type === AST_NODE_TYPES.Identifier) {
    return {
      name: expr.name,
      args: [],
      node: decorator,
    };
  }

  return null;
}

/**
 * Finds all decorators on a property definition.
 *
 * @param node - The property definition node
 * @returns Array of decorator info objects for FormSpec decorators
 */
export function getFormSpecDecorators(
  node: TSESTree.PropertyDefinition
): DecoratorInfo[] {
  const decorators = node.decorators;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- decorators can be undefined
  if (!decorators || decorators.length === 0) {
    return [];
  }

  const result: DecoratorInfo[] = [];
  for (const decorator of decorators) {
    const info = getDecoratorInfo(decorator);
    if (info && FORMSPEC_DECORATORS.has(info.name)) {
      result.push(info);
    }
  }
  return result;
}

/**
 * Finds a specific decorator by name on a property.
 *
 * @param node - The property definition node
 * @param name - The decorator name to find
 * @returns The decorator info or null if not found
 */
export function findDecorator(
  node: TSESTree.PropertyDefinition,
  name: string
): DecoratorInfo | null {
  const decorators = getFormSpecDecorators(node);
  return decorators.find((d) => d.name === name) ?? null;
}

/**
 * Checks if a property has a specific decorator.
 *
 * @param node - The property definition node
 * @param name - The decorator name to check
 * @returns True if the decorator is present
 */
export function hasDecorator(node: TSESTree.PropertyDefinition, name: string): boolean {
  return findDecorator(node, name) !== null;
}

/**
 * Gets the first argument of a decorator as a literal value.
 *
 * @param decorator - The decorator info
 * @returns The literal value or null if not a literal
 */
export function getDecoratorLiteralArg(decorator: DecoratorInfo): unknown {
  const arg = decorator.args[0];
  if (!arg) {
    return null;
  }

  if (arg.type === AST_NODE_TYPES.Literal) {
    return arg.value;
  }

  return null;
}

/**
 * Gets the first argument of a decorator as an array of values.
 * Used for @EnumOptions(["a", "b", "c"]).
 *
 * @param decorator - The decorator info
 * @returns Array of values or null if not an array expression
 */
export function getDecoratorArrayArg(decorator: DecoratorInfo): unknown[] | null {
  const arg = decorator.args[0];
  if (!arg) {
    return null;
  }

  if (arg.type === AST_NODE_TYPES.ArrayExpression) {
    const values: unknown[] = [];
    for (const element of arg.elements) {
      if (!element) continue;

      if (element.type === AST_NODE_TYPES.Literal) {
        values.push(element.value);
      } else if (element.type === AST_NODE_TYPES.ObjectExpression) {
        // Handle { id: "x", label: "X" } objects
        const obj: Record<string, unknown> = {};
        for (const prop of element.properties) {
          if (
            prop.type === AST_NODE_TYPES.Property &&
            prop.key.type === AST_NODE_TYPES.Identifier &&
            prop.value.type === AST_NODE_TYPES.Literal
          ) {
            obj[prop.key.name] = prop.value.value;
          }
        }
        values.push(obj);
      }
    }
    return values;
  }

  return null;
}

/**
 * Gets the field reference from a @ShowWhen predicate.
 * @ShowWhen({ _predicate: "equals", field: "foo", value: "bar" })
 *
 * @param decorator - The ShowWhen decorator info
 * @returns The field name or null if not found
 */
export function getShowWhenField(decorator: DecoratorInfo): string | null {
  const arg = decorator.args[0];
  if (!arg) {
    return null;
  }

  if (arg.type === AST_NODE_TYPES.ObjectExpression) {
    for (const prop of arg.properties) {
      if (
        prop.type === AST_NODE_TYPES.Property &&
        prop.key.type === AST_NODE_TYPES.Identifier &&
        prop.key.name === "field" &&
        prop.value.type === AST_NODE_TYPES.Literal &&
        typeof prop.value.value === "string"
      ) {
        return prop.value.value;
      }
    }
  }

  return null;
}

/**
 * Gets the property name from a PropertyDefinition.
 *
 * @param node - The property definition node
 * @returns The property name or null if computed/symbol
 */
export function getPropertyName(node: TSESTree.PropertyDefinition): string | null {
  if (node.key.type === AST_NODE_TYPES.Identifier) {
    return node.key.name;
  }
  if (node.key.type === AST_NODE_TYPES.Literal && typeof node.key.value === "string") {
    return node.key.value;
  }
  return null;
}

/**
 * Gets all property names from a class definition.
 *
 * @param classNode - The class declaration/expression node
 * @returns Set of property names
 */
export function getClassPropertyNames(
  classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression
): Set<string> {
  const names = new Set<string>();
  for (const member of classNode.body.body) {
    if (member.type === AST_NODE_TYPES.PropertyDefinition) {
      const name = getPropertyName(member);
      if (name) {
        names.add(name);
      }
    }
  }
  return names;
}
