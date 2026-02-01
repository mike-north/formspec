/**
 * Code generation for FormSpec type metadata.
 *
 * Generates a TypeScript file that patches decorated classes with
 * their extracted type metadata, enabling runtime schema generation
 * without requiring a TypeScript transformer.
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
 * Type metadata format (matches @formspec/transformer output).
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

        results.push({
          name: className,
          sourcePath: relativePath.replace(/\.tsx?$/, ""),
          typeMetadata,
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
      const propType = checker.getTypeOfSymbolAtLocation(
        prop,
        prop.valueDeclaration ?? prop.declarations?.[0] ?? ({} as ts.Node)
      );
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
    " * This file patches decorated classes with type metadata",
    " * to enable runtime schema generation.",
    " *",
    " * Import this file once in your application entry point:",
    " *   import './__formspec_types__';",
    " */",
    "",
    "/* eslint-disable @typescript-eslint/no-explicit-any */",
    "",
  ];

  // Generate imports
  for (const cls of classes) {
    // Compute absolute source path, then relative from output dir
    const absoluteSourcePath = path.resolve(baseDir, cls.sourcePath);
    const importPath = getRelativeImportPath(outputDir, absoluteSourcePath);
    lines.push(`import { ${cls.name} } from "${importPath}";`);
  }

  lines.push("");
  lines.push("// Patch classes with type metadata");

  // Generate patches
  for (const cls of classes) {
    const metadataJson = JSON.stringify(cls.typeMetadata, null, 2)
      .split("\n")
      .map((line, i) => (i === 0 ? line : "  " + line))
      .join("\n");

    lines.push(`(${cls.name} as any).__formspec_types__ = ${metadataJson};`);
    lines.push("");
  }

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

  const output = generateCodegenOutput(classes, options.output, baseDir);

  // Ensure output directory exists
  const outputDir = path.dirname(options.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(options.output, output);
  console.log(`\nGenerated: ${options.output}`);
}
