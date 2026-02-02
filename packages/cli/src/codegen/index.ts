/**
 * Code generation for FormSpec type metadata.
 *
 * Generates a TypeScript file that patches decorated classes with
 * their extracted type metadata, enabling runtime schema generation
 * as an alternative to a TypeScript transformer.
 *
 * Usage:
 *   formspec codegen ./src/forms.ts -o ./src/__formspec_types__.ts
 *
 * Then in your code:
 *   import './__formspec_types__';  // Patches all decorated classes
 *   import { UserForm } from './forms';
 *   import { toFormSpec } from '@formspec/decorators';
 *   const spec = toFormSpec(UserForm);
 */

import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";

/**
 * Type metadata format used by @formspec/decorators.
 *
 * Represents the runtime type information for a field that TypeScript
 * normally erases at compile time.
 */
export interface TypeMetadata {
  /** Base type: "string", "number", "boolean", "enum", "array", "object", "unknown" */
  type: string;
  /** For enum types, the possible literal values */
  values?: unknown[];
  /** For array types, metadata about the array element type */
  itemType?: TypeMetadata;
  /** For object types, metadata about each property */
  properties?: Record<string, TypeMetadata>;
  /** Whether the field accepts null */
  nullable?: boolean;
  /** Whether the field is optional (T | undefined or ?: modifier) */
  optional?: boolean;
}

/**
 * Information about a decorated class found during codegen analysis.
 *
 * Used to track which classes need type metadata patches and where
 * they are located in the source tree.
 */
export interface DecoratedClassInfo {
  /** Class name as it appears in the source file */
  name: string;
  /** Import path to the source file (relative to output, without extension) */
  sourcePath: string;
  /** Type metadata for all decorated properties in the class */
  typeMetadata: Record<string, TypeMetadata>;
  /** Whether the class is exported from its source file */
  isExported: boolean;
}

/**
 * Options for code generation.
 */
export interface CodegenOptions {
  /** Source files to analyze (glob patterns supported) */
  files: string[];
  /** Output file path */
  output: string;
  /** Base directory for relative imports */
  baseDir?: string;
}

/**
 * Finds all decorated classes in the given source files.
 */
export function findDecoratedClasses(
  files: string[],
  baseDir: string
): DecoratedClassInfo[] {
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    experimentalDecorators: true,
    strict: true,
  });

  const checker = program.getTypeChecker();
  const results: DecoratedClassInfo[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (!files.some((f) => path.resolve(f) === sourceFile.fileName)) continue;

    ts.forEachChild(sourceFile, (node) => {
      if (ts.isClassDeclaration(node) && hasDecoratedProperties(node)) {
        const className = node.name?.text;
        if (!className) return;

        const typeMetadata = extractTypeMetadata(node, checker);
        const relativePath = path.relative(baseDir, sourceFile.fileName);
        const exported = isClassExported(node, sourceFile);

        results.push({
          name: className,
          sourcePath: relativePath.replace(/\.tsx?$/, ""),
          typeMetadata,
          isExported: exported,
        });
      }
    });
  }

  return results;
}

/**
 * Checks if a class has any decorated properties.
 */
function hasDecoratedProperties(node: ts.ClassDeclaration): boolean {
  return node.members.some((member) => {
    if (!ts.isPropertyDeclaration(member)) return false;
    const decorators = ts.getDecorators(member);
    return decorators !== undefined && decorators.length > 0;
  });
}

/**
 * Checks if a class is exported from its source file.
 *
 * A class is considered exported if:
 * 1. It has the 'export' modifier directly (export class Foo {})
 * 2. It has 'export default' modifiers (export default class Foo {})
 * 3. It's referenced in a named export declaration (export { Foo })
 */
function isClassExported(
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile
): boolean {
  const className = classNode.name?.text;
  if (!className) return false;

  // Check for direct export modifier (export class Foo or export default class Foo)
  const modifiers = ts.getModifiers(classNode);
  if (modifiers) {
    const hasExport = modifiers.some(
      (mod) => mod.kind === ts.SyntaxKind.ExportKeyword
    );
    if (hasExport) return true;
  }

  // Check for named exports (export { Foo } or export { Foo as Bar })
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause) {
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          // Check if this export refers to our class
          // element.name is the exported name, element.propertyName is the local name (if renamed)
          const localName = element.propertyName?.text ?? element.name.text;
          if (localName === className) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Extracts type metadata for all properties in a class.
 */
function extractTypeMetadata(
  classNode: ts.ClassDeclaration,
  checker: ts.TypeChecker
): Record<string, TypeMetadata> {
  const metadata: Record<string, TypeMetadata> = {};

  for (const member of classNode.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    if (!member.name || !ts.isIdentifier(member.name)) continue;

    const symbol = checker.getSymbolAtLocation(member.name);
    if (!symbol) continue;

    const type = checker.getTypeOfSymbolAtLocation(symbol, member);
    const fieldName = member.name.text;
    const isOptional = !!(symbol.flags & ts.SymbolFlags.Optional);

    const typeInfo = convertTypeToMetadata(type, checker);
    if (isOptional) {
      typeInfo.optional = true;
    }
    metadata[fieldName] = typeInfo;
  }

  return metadata;
}

/**
 * Converts a TypeScript type to serializable metadata.
 */
function convertTypeToMetadata(
  type: ts.Type,
  checker: ts.TypeChecker,
  visited: Set<ts.Type> = new Set()
): TypeMetadata {
  // Cycle detection for object types only
  const isObjectType = (type.flags & ts.TypeFlags.Object) !== 0;
  if (isObjectType) {
    if (visited.has(type)) {
      return { type: "unknown" };
    }
    visited.add(type);
  }

  // Handle union types
  if (type.isUnion()) {
    const types = type.types;
    const nonNullTypes = types.filter(
      (t) => !(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
    );
    const hasNull = types.some((t) => t.flags & ts.TypeFlags.Null);

    // Boolean union (true | false)
    const isBooleanUnion =
      nonNullTypes.length === 2 &&
      nonNullTypes.every((t) => t.flags & ts.TypeFlags.BooleanLiteral);

    if (isBooleanUnion) {
      const result: TypeMetadata = { type: "boolean" };
      if (hasNull) result.nullable = true;
      return result;
    }

    // String literal union = enum
    const allStringLiterals = nonNullTypes.every((t) => t.isStringLiteral());
    if (allStringLiterals && nonNullTypes.length > 0) {
      const result: TypeMetadata = {
        type: "enum",
        values: nonNullTypes.map((t) => (t as ts.StringLiteralType).value),
      };
      if (hasNull) result.nullable = true;
      return result;
    }

    // Number literal union = enum
    const allNumberLiterals = nonNullTypes.every((t) => t.isNumberLiteral());
    if (allNumberLiterals && nonNullTypes.length > 0) {
      const result: TypeMetadata = {
        type: "enum",
        values: nonNullTypes.map((t) => (t as ts.NumberLiteralType).value),
      };
      if (hasNull) result.nullable = true;
      return result;
    }

    // Nullable single type
    if (nonNullTypes.length === 1 && nonNullTypes[0]) {
      const result = convertTypeToMetadata(nonNullTypes[0], checker, visited);
      if (hasNull) result.nullable = true;
      return result;
    }

    return { type: "unknown" };
  }

  // Primitives
  if (type.flags & ts.TypeFlags.String) return { type: "string" };
  if (type.flags & ts.TypeFlags.Number) return { type: "number" };
  if (type.flags & ts.TypeFlags.Boolean) return { type: "boolean" };

  // String literal
  if (type.isStringLiteral()) {
    return { type: "enum", values: [type.value] };
  }

  // Number literal
  if (type.isNumberLiteral()) {
    return { type: "enum", values: [type.value] };
  }

  // Arrays
  if (checker.isArrayType(type)) {
    const typeArgs = (type as ts.TypeReference).typeArguments;
    return {
      type: "array",
      itemType: typeArgs?.[0]
        ? convertTypeToMetadata(typeArgs[0], checker, visited)
        : { type: "unknown" },
    };
  }

  // Objects
  if (type.flags & ts.TypeFlags.Object) {
    const properties: Record<string, TypeMetadata> = {};
    for (const prop of type.getProperties()) {
      // Skip properties without declarations (can't determine type safely)
      const declaration = prop.valueDeclaration ?? prop.declarations?.[0];
      if (!declaration) continue;

      const propType = checker.getTypeOfSymbolAtLocation(prop, declaration);
      const propOptional = !!(prop.flags & ts.SymbolFlags.Optional);
      const propMeta = convertTypeToMetadata(propType, checker, visited);
      if (propOptional) propMeta.optional = true;
      properties[prop.name] = propMeta;
    }

    if (Object.keys(properties).length > 0) {
      return { type: "object", properties };
    }
    return { type: "object" };
  }

  return { type: "unknown" };
}

/**
 * Generates the codegen output file content.
 */
export function generateCodegenOutput(
  classes: DecoratedClassInfo[],
  outputPath: string,
  baseDir: string
): string {
  const outputDir = path.dirname(path.resolve(outputPath));
  const lines: string[] = [
    "/**",
    " * Auto-generated by FormSpec CLI.",
    " * DO NOT EDIT - changes will be overwritten.",
    " *",
    " * This file provides:",
    " * - Type metadata patches for runtime schema generation",
    " * - Inferred schema types (e.g., UserFormSchema)",
    " * - Type-safe FormSpec accessors (e.g., getUserFormFormSpec())",
    " *",
    " * Usage:",
    " *   import { UserFormSchema, getUserFormFormSpec } from './__formspec_types__';",
    " *",
    " *   const data: UserFormSchema = { name: 'Alice', country: 'us' };",
    " *   const spec = getUserFormFormSpec();",
    " */",
    "",
    "/* eslint-disable @typescript-eslint/no-explicit-any */",
    "",
  ];

  // Generate imports
  lines.push(`import { toFormSpec } from "@formspec/decorators";`);
  for (const cls of classes) {
    // Compute absolute source path, then relative from output dir
    const absoluteSourcePath = path.resolve(baseDir, cls.sourcePath);
    const importPath = getRelativeImportPath(outputDir, absoluteSourcePath);
    lines.push(`import { ${cls.name} } from "${importPath}";`);
  }

  lines.push("");
  lines.push("// =============================================================================");
  lines.push("// Type Metadata Patches");
  lines.push("// =============================================================================");
  lines.push("");

  // Generate patches
  for (const cls of classes) {
    const metadataJson = JSON.stringify(cls.typeMetadata, null, 2)
      .split("\n")
      .map((line, i) => (i === 0 ? line : "  " + line))
      .join("\n");

    lines.push(`(${cls.name} as any).__formspec_types__ = ${metadataJson};`);
    lines.push("");
  }

  lines.push("// =============================================================================");
  lines.push("// Inferred Schema Types");
  lines.push("// =============================================================================");
  lines.push("");

  // Generate schema types
  for (const cls of classes) {
    lines.push(generateSchemaType(cls));
    lines.push("");
  }

  lines.push("// =============================================================================");
  lines.push("// Type-Safe FormSpec Accessors");
  lines.push("// =============================================================================");
  lines.push("");

  // Generate typed accessors
  for (const cls of classes) {
    lines.push(generateTypedAccessor(cls));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Converts TypeMetadata to a TypeScript type string.
 */
function metadataToTypeString(metadata: TypeMetadata): string {
  const baseType = metadataToBaseTypeString(metadata);

  // Handle nullable and optional modifiers
  if (metadata.nullable && metadata.optional) {
    return `${baseType} | null | undefined`;
  }
  if (metadata.nullable) {
    return `${baseType} | null`;
  }
  if (metadata.optional) {
    return `${baseType} | undefined`;
  }
  return baseType;
}

/**
 * Checks if a property key needs to be quoted in TypeScript object types.
 *
 * Property keys need quoting if they:
 * - Contain characters invalid in JavaScript identifiers (spaces, hyphens, etc.)
 * - Are reserved JavaScript/TypeScript keywords (class, function, etc.)
 *
 * @param key - The property name to check
 * @returns true if the key requires quotes, false otherwise
 */
function needsPropertyQuoting(key: string): boolean {
  // Valid JS identifier: starts with letter/underscore/$, followed by alphanumeric/_/$
  const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
  if (!validIdentifier.test(key)) {
    return true;
  }
  // Reserved words that need quoting (comprehensive list including ES6+)
  const reservedWords = new Set([
    // Keywords
    "break", "case", "catch", "continue", "debugger", "default", "delete",
    "do", "else", "finally", "for", "function", "if", "in", "instanceof",
    "new", "return", "switch", "this", "throw", "try", "typeof", "var",
    "void", "while", "with", "class", "const", "enum", "export", "extends",
    "import", "super", "implements", "interface", "let", "package", "private",
    "protected", "public", "static", "yield",
    // ES6+ keywords
    "async", "await",
    // Literal values (not technically keywords but best to quote)
    "null", "true", "false",
    // Accessor keywords
    "get", "set",
    // Strict mode reserved
    "arguments", "eval",
  ]);
  return reservedWords.has(key);
}

/**
 * Escapes a property key for safe use in TypeScript type definitions.
 *
 * Wraps keys in double quotes if they need quoting, using JSON.stringify
 * for robust escaping of special characters.
 *
 * @param key - The property name to escape
 * @returns The escaped key, quoted if necessary
 */
function escapePropertyKey(key: string): string {
  if (needsPropertyQuoting(key)) {
    return JSON.stringify(key);
  }
  return key;
}

/**
 * Converts TypeMetadata to base type string (without null/optional modifiers).
 */
function metadataToBaseTypeString(metadata: TypeMetadata): string {
  switch (metadata.type) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "enum":
      if (metadata.values && metadata.values.length > 0) {
        return metadata.values
          .map((v) => (typeof v === "string" ? JSON.stringify(v) : String(v)))
          .join(" | ");
      }
      return "string";
    case "array":
      if (metadata.itemType) {
        const itemType = metadataToTypeString(metadata.itemType);
        // Wrap union types in parentheses for array
        if (itemType.includes("|")) {
          return `(${itemType})[]`;
        }
        return `${itemType}[]`;
      }
      return "unknown[]";
    case "object":
      if (metadata.properties && Object.keys(metadata.properties).length > 0) {
        const props = Object.entries(metadata.properties)
          .map(([key, propMeta]) => {
            const optional = propMeta.optional ? "?" : "";
            return `${escapePropertyKey(key)}${optional}: ${metadataToTypeString(propMeta)}`;
          })
          .join("; ");
        return `{ ${props} }`;
      }
      return "Record<string, unknown>";
    default:
      return "unknown";
  }
}

/**
 * Generates a TypeScript schema type for a class.
 */
function generateSchemaType(cls: DecoratedClassInfo): string {
  const props = Object.entries(cls.typeMetadata)
    .map(([fieldName, metadata]) => {
      const optional = metadata.optional ? "?" : "";
      const typeStr = metadataToTypeString(metadata);
      return `  ${escapePropertyKey(fieldName)}${optional}: ${typeStr};`;
    })
    .join("\n");

  return `export type ${cls.name}Schema = {\n${props}\n};`;
}

/**
 * Maps TypeMetadata type strings to FormSpec field type strings.
 *
 * TypeMetadata uses generic type names (string, number), while FormSpec
 * uses more specific field type names (text, number, enum).
 *
 * @param type - The TypeMetadata type string
 * @returns The corresponding FormSpec field type
 */
function metadataTypeToFieldType(type: string): string {
  switch (type) {
    case "string":
      return "text";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "enum":
      return "enum";
    case "array":
      return "array";
    case "object":
      return "object";
    default:
      return "text";
  }
}

/**
 * Generates typed FormSpec accessor for a class.
 *
 * Creates three exports:
 * 1. Element tuple type (e.g., UserFormElements) - Exact readonly array type
 *    representing each field with its literal types preserved
 * 2. FormSpec result type (e.g., UserFormFormSpec) - Type alias wrapping the elements
 * 3. Accessor function (e.g., getUserFormFormSpec()) - Returns FormSpec with full
 *    type information for autocomplete and type checking
 *
 * These types enable the same level of type inference as the Chain DSL.
 *
 * @param cls - The decorated class information
 * @returns TypeScript code defining the accessor function and types
 */
function generateTypedAccessor(cls: DecoratedClassInfo): string {
  const lines: string[] = [];

  // Generate the element type as a tuple
  const elementTypes = Object.entries(cls.typeMetadata).map(
    ([fieldName, metadata]) => {
      const fieldType = metadataTypeToFieldType(metadata.type);
      const required = !metadata.optional;

      let elementType = `{ readonly _field: "${fieldType}"; readonly id: "${fieldName}"; readonly required: ${required}`;

      // Add options for enum types
      if (metadata.type === "enum" && metadata.values) {
        const optionValues = metadata.values
          .map((v) => (typeof v === "string" ? JSON.stringify(v) : String(v)))
          .join(", ");
        elementType += `; readonly options: readonly [${optionValues}]`;
      }

      elementType += " }";
      return elementType;
    }
  );

  // Export element tuple type
  lines.push(
    `export type ${cls.name}Elements = readonly [\n  ${elementTypes.join(",\n  ")}\n];`
  );
  lines.push("");

  // Export typed FormSpec result type
  lines.push(
    `export type ${cls.name}FormSpec = { readonly elements: ${cls.name}Elements };`
  );
  lines.push("");

  // Export typed accessor function
  lines.push(`/**`);
  lines.push(` * Type-safe FormSpec accessor for ${cls.name}.`);
  lines.push(` * Returns the same result as toFormSpec(${cls.name}) but with full type information.`);
  lines.push(` */`);
  lines.push(
    `export function get${cls.name}FormSpec(): ${cls.name}FormSpec {`
  );
  lines.push(`  return toFormSpec(${cls.name}) as unknown as ${cls.name}FormSpec;`);
  lines.push(`}`);

  return lines.join("\n");
}

/**
 * Gets a relative import path from output to source.
 */
function getRelativeImportPath(outputDir: string, sourcePath: string): string {
  // sourcePath is already relative to baseDir
  let relativePath = path.relative(outputDir, sourcePath);

  // Ensure it starts with ./ or ../
  if (!relativePath.startsWith(".")) {
    relativePath = "./" + relativePath;
  }

  // Use forward slashes for imports
  relativePath = relativePath.replace(/\\/g, "/");

  // Add .js extension for ESM compatibility
  return relativePath + ".js";
}

/**
 * Runs the code generation.
 */
export function runCodegen(options: CodegenOptions): void {
  const baseDir = options.baseDir ?? path.dirname(options.output);
  const absoluteFiles = options.files.map((f) => path.resolve(f));

  console.log(`Scanning ${absoluteFiles.length} file(s) for decorated classes...`);

  const classes = findDecoratedClasses(absoluteFiles, baseDir);

  if (classes.length === 0) {
    console.log("No decorated classes found.");
    return;
  }

  console.log(`Found ${classes.length} decorated class(es):`);
  for (const cls of classes) {
    const fieldCount = Object.keys(cls.typeMetadata).length;
    console.log(`  - ${cls.name} (${fieldCount} field(s))`);
  }

  // Check for unexported classes and warn
  const unexported = classes.filter((cls) => !cls.isExported);
  if (unexported.length > 0) {
    console.warn(
      `\n⚠️  Warning: The following decorated classes are not exported from their source files:`
    );
    for (const cls of unexported) {
      console.warn(`   - ${cls.name} (${cls.sourcePath})`);
    }
    console.warn(
      `\n   The generated code will fail to compile because it cannot import these classes.`
    );
    console.warn(`   To fix this, add 'export' to the class declaration:`);
    console.warn(`     export class ${unexported[0]?.name} { ... }\n`);
  }

  const output = generateCodegenOutput(classes, options.output, baseDir);

  // Ensure output directory exists
  const outputDir = path.dirname(options.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(options.output, output);
  console.log(`\nGenerated: ${options.output}`);
}
