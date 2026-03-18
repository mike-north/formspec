/**
 * Decorator extractor for parsing decorator AST nodes.
 *
 * Extracts decorator names and arguments from class field decorators,
 * supporting the FormSpec decorator DSL (@Field, @Minimum, @Maximum, etc.).
 *
 * Also supports branded type resolution via the TypeScript type checker
 * to detect custom decorators created with `extendDecorator` and
 * `customDecorator` from `@formspec/decorators`.
 */

import * as ts from "typescript";
import { type FormSpecDecoratorName } from "@formspec/core";

/**
 * Extracted decorator information.
 */
export interface DecoratorInfo {
  /** Decorator name (e.g., "Field", "Minimum") */
  name: string;
  /** Decorator arguments as literal values */
  args: DecoratorArg[];
  /** Raw AST node for the decorator (undefined for synthetic JSDoc constraint entries) */
  node: ts.Decorator | undefined;
  /** Resolved brand information from the type checker (populated by analyzeField) */
  resolved?: ResolvedDecorator;
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
 * Result of resolving a decorator via the type checker.
 */
export interface ResolvedDecorator {
  /** Decorator name as it appears in source */
  name: string;
  /** If this extends a built-in, the built-in name (e.g., "Field") */
  extendsBuiltin?: string;
  /** If this belongs to a CLI extension namespace, the namespace name */
  extensionName?: string;
  /** Whether this is a known FormSpec decorator (built-in or factory-created) */
  isFormSpec: boolean;
  /** Whether this is a marker (zero-arg) decorator */
  isMarker: boolean;
}

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
  const modifiers = ts.canHaveDecorators(member) ? ts.getDecorators(member) : undefined;

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
      // For namespaced decorators like @formspec.Field()
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
 * Supports literals, arrays, object literals, and RegExp.
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
    if (node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
      return -Number(node.operand.text);
    }
    if (node.operator === ts.SyntaxKind.PlusToken && ts.isNumericLiteral(node.operand)) {
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
    const obj: Record<string, DecoratorArg> = {};
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

  // RegExp literal: extract the source pattern string
  if (ts.isRegularExpressionLiteral(node)) {
    const regexText = node.text;
    // RegExp literal format is /pattern/flags
    const lastSlash = regexText.lastIndexOf("/");
    if (lastSlash > 0) {
      return regexText.substring(1, lastSlash);
    }
    return regexText;
  }

  // new RegExp("pattern") — extract pattern from constructor call
  if (ts.isNewExpression(node)) {
    if (
      ts.isIdentifier(node.expression) &&
      node.expression.text === "RegExp" &&
      node.arguments &&
      node.arguments.length > 0
    ) {
      const firstArg = node.arguments[0];
      if (firstArg && ts.isStringLiteral(firstArg)) {
        return firstArg.text;
      }
    }
  }

  // Identifier - could be an enum member or constant
  // We can't resolve it statically, return null
  if (ts.isIdentifier(node)) {
    return null;
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
 *
 * This metadata object provides additional information about each decorator's
 * expected argument types. The keys are constrained to match FormSpecDecoratorName.
 */
export const FORMSPEC_DECORATORS: Record<FormSpecDecoratorName, { argTypes: readonly string[] }> = {
  // Display metadata
  Field: { argTypes: ["object"] },

  // Grouping
  Group: { argTypes: ["string"] },

  // Conditional display
  ShowWhen: { argTypes: ["object"] },

  // Enum options
  EnumOptions: { argTypes: ["array"] },

  // Numeric constraints
  Minimum: { argTypes: ["number"] },
  Maximum: { argTypes: ["number"] },
  ExclusiveMinimum: { argTypes: ["number"] },
  ExclusiveMaximum: { argTypes: ["number"] },

  // String constraints
  MinLength: { argTypes: ["number"] },
  MaxLength: { argTypes: ["number"] },
  Pattern: { argTypes: ["string"] },
} as const;

/**
 * Checks if a file path belongs to the @formspec/decorators package.
 *
 * Matches both installed node_modules paths and local monorepo paths.
 */
function isFormSpecDecoratorsPath(fileName: string): boolean {
  // Normalize separators for cross-platform matching
  const normalized = fileName.replace(/\\/g, "/");
  return (
    normalized.includes("node_modules/@formspec/decorators") ||
    normalized.includes("/packages/decorators/")
  );
}

/**
 * Resolves a decorator via the TypeScript type checker to determine
 * if it is a FormSpec decorator (built-in, extended, or custom).
 *
 * This enables detection of:
 * 1. Direct imports of built-in decorators from `@formspec/decorators`
 * 2. Extended decorators created via `extendDecorator(...).as(...)`
 * 3. Custom decorators created via `customDecorator(...).as(...)` or `.marker(...)`
 *
 * @param decorator - The decorator AST node
 * @param checker - TypeScript type checker
 * @returns Resolved decorator information, or null if not resolvable
 */
export function resolveDecorator(
  decorator: ts.Decorator,
  checker: ts.TypeChecker
): ResolvedDecorator | null {
  const expr = decorator.expression;

  // Get the identifier to resolve
  let targetNode: ts.Node;
  let name: string;

  if (ts.isIdentifier(expr)) {
    // Simple marker decorator: @Decorator
    targetNode = expr;
    name = expr.text;
  } else if (ts.isCallExpression(expr)) {
    // Parameterized decorator: @Decorator(args)
    if (ts.isIdentifier(expr.expression)) {
      targetNode = expr.expression;
      name = expr.expression.text;
    } else {
      return null;
    }
  } else {
    return null;
  }

  // Check if it's a known built-in by name
  if (name in FORMSPEC_DECORATORS) {
    // Verify it actually comes from @formspec/decorators by checking the symbol
    const symbol = checker.getSymbolAtLocation(targetNode);
    if (symbol) {
      const declarations = symbol.declarations;
      if (declarations && declarations.length > 0) {
        const decl = declarations[0];
        if (decl) {
          const sourceFile = decl.getSourceFile();
          const fileName = sourceFile.fileName;
          if (isFormSpecDecoratorsPath(fileName)) {
            return {
              name,
              isFormSpec: true,
              isMarker: !ts.isCallExpression(expr),
            };
          }
        }
      }
    }
  }

  // Try to resolve branded types for custom/extended decorators
  const resolvedSymbol = checker.getSymbolAtLocation(targetNode);
  if (!resolvedSymbol) return null;

  const type = checker.getTypeOfSymbol(resolvedSymbol);
  const props = type.getProperties();

  let extendsBuiltin: string | undefined;
  let extensionName: string | undefined;
  let isMarker = false;

  for (const prop of props) {
    // __String is a branded string type; cast is safe for read-only string operations
    const escapedName = prop.getEscapedName() as string;

    // TypeScript represents unique symbol properties as __@<name>@<uniqueId>
    // in escaped names. The <name> portion may be either the Symbol description
    // (e.g., "formspec.extends") or the const variable name (e.g., "FORMSPEC_EXTENDS"),
    // depending on how the symbol is declared and resolved by the type checker.
    // We check for both patterns to handle all cases.
    if (
      escapedName.startsWith("__@") &&
      (escapedName.includes("formspec.extends") || escapedName.includes("FORMSPEC_EXTENDS"))
    ) {
      const propType = checker.getTypeOfSymbol(prop);
      if (propType.isStringLiteral()) {
        extendsBuiltin = propType.value;
      }
    }

    if (
      escapedName.startsWith("__@") &&
      (escapedName.includes("formspec.extension") || escapedName.includes("FORMSPEC_EXTENSION"))
    ) {
      const propType = checker.getTypeOfSymbol(prop);
      if (propType.isStringLiteral()) {
        extensionName = propType.value;
      }
    }

    if (
      escapedName.startsWith("__@") &&
      (escapedName.includes("formspec.marker") || escapedName.includes("FORMSPEC_MARKER"))
    ) {
      isMarker = true;
    }
  }

  if (extendsBuiltin) {
    return {
      name,
      extendsBuiltin,
      isFormSpec: true,
      isMarker: false,
    };
  }

  if (extensionName) {
    return {
      name,
      extensionName,
      isFormSpec: true,
      isMarker,
    };
  }

  if (isMarker) {
    return {
      name,
      isFormSpec: true,
      isMarker: true,
    };
  }

  return null;
}
