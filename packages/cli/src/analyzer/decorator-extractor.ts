/**
 * Decorator extractor for parsing decorator AST nodes.
 *
 * Extracts decorator names and arguments from class field decorators,
 * supporting the FormSpec decorator DSL (@Label, @Min, @Max, etc.).
 */

import * as ts from "typescript";

/**
 * Extracted decorator information.
 */
export interface DecoratorInfo {
  /** Decorator name (e.g., "Label", "Min") */
  name: string;
  /** Decorator arguments as literal values */
  args: DecoratorArg[];
  /** Raw AST node for the decorator */
  node: ts.Decorator;
}

/**
 * A decorator argument value.
 * Can be a primitive, array, or object literal.
 */
export type DecoratorArg =
  | string
  | number
  | boolean
  | null
  | DecoratorArg[]
  | { [key: string]: DecoratorArg };

/**
 * Extracts decorators from a class member (property or method).
 *
 * @param member - The class member to extract decorators from
 * @returns Array of extracted decorator info
 */
export function extractDecorators(
  member: ts.PropertyDeclaration | ts.MethodDeclaration
): DecoratorInfo[] {
  const decorators: DecoratorInfo[] = [];

  // TC39 decorators are in the modifiers array
  const modifiers = ts.canHaveDecorators(member)
    ? ts.getDecorators(member)
    : undefined;

  if (!modifiers) return decorators;

  for (const decorator of modifiers) {
    const info = parseDecorator(decorator);
    if (info) {
      decorators.push(info);
    }
  }

  return decorators;
}

/**
 * Parses a single decorator node.
 */
function parseDecorator(decorator: ts.Decorator): DecoratorInfo | null {
  const expr = decorator.expression;

  // Simple decorator: @Decorator
  if (ts.isIdentifier(expr)) {
    return {
      name: expr.text,
      args: [],
      node: decorator,
    };
  }

  // Call expression: @Decorator(args)
  if (ts.isCallExpression(expr)) {
    const callee = expr.expression;

    // Get decorator name
    let name: string | null = null;
    if (ts.isIdentifier(callee)) {
      name = callee.text;
    } else if (ts.isPropertyAccessExpression(callee)) {
      // For namespaced decorators like @formspec.Label()
      name = callee.name.text;
    }

    if (!name) return null;

    // Extract arguments
    const args = expr.arguments.map(extractArgValue);

    return {
      name,
      args,
      node: decorator,
    };
  }

  return null;
}

/**
 * Extracts the value from an expression node.
 * Supports literals, arrays, and object literals.
 */
function extractArgValue(node: ts.Expression): DecoratorArg {
  // String literal
  if (ts.isStringLiteral(node)) {
    return node.text;
  }

  // Numeric literal
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }

  // Boolean literals (true/false are identifiers in TS AST)
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  // Null literal
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }

  // Prefix unary expression (for negative numbers)
  if (ts.isPrefixUnaryExpression(node)) {
    if (
      node.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(node.operand)
    ) {
      return -Number(node.operand.text);
    }
    if (
      node.operator === ts.SyntaxKind.PlusToken &&
      ts.isNumericLiteral(node.operand)
    ) {
      return Number(node.operand.text);
    }
  }

  // Array literal
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((el) => {
      if (ts.isSpreadElement(el)) {
        // Can't evaluate spread at compile time
        return null;
      }
      return extractArgValue(el);
    });
  }

  // Object literal
  if (ts.isObjectLiteralExpression(node)) {
    const obj: { [key: string]: DecoratorArg } = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const key = getPropertyName(prop.name);
        if (key) {
          obj[key] = extractArgValue(prop.initializer);
        }
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        // { foo } shorthand - we can't resolve the value
        const key = prop.name.text;
        obj[key] = null;
      }
    }
    return obj;
  }

  // Template literal (simple case)
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  // Identifier - could be an enum member or constant
  // We return null since we can't resolve it statically
  if (ts.isIdentifier(node)) {
    // Return the identifier name for potential later resolution
    return `__identifier:${node.text}`;
  }

  // For other expressions, return null
  return null;
}

/**
 * Gets the property name from a property name node.
 */
function getPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  if (ts.isStringLiteral(name)) {
    return name.text;
  }
  if (ts.isNumericLiteral(name)) {
    return name.text;
  }
  // Computed property names can't be resolved statically
  return null;
}

/**
 * Known FormSpec decorators and their expected argument types.
 */
export const FORMSPEC_DECORATORS = {
  // Metadata decorators
  Label: { argTypes: ["string"] },
  Placeholder: { argTypes: ["string"] },
  Description: { argTypes: ["string"] },

  // Numeric constraints
  Min: { argTypes: ["number"] },
  Max: { argTypes: ["number"] },
  Step: { argTypes: ["number"] },

  // Array constraints
  MinItems: { argTypes: ["number"] },
  MaxItems: { argTypes: ["number"] },

  // String constraints
  MinLength: { argTypes: ["number"] },
  MaxLength: { argTypes: ["number"] },
  Pattern: { argTypes: ["string"] },

  // Enum options
  EnumOptions: { argTypes: ["array"] },

  // Conditional display
  ShowWhen: { argTypes: ["object"] },

  // Grouping
  Group: { argTypes: ["string"] },

  // Type hints (may be removed once CLI handles type inference)
  Boolean: { argTypes: [] },
} as const;

/**
 * Checks if a decorator name is a known FormSpec decorator.
 */
export function isFormSpecDecorator(name: string): boolean {
  return name in FORMSPEC_DECORATORS;
}
