/**
 * Class schema generator.
 *
 * Generates JSON Schema 2020-12 and JSON Forms UI Schema from statically
 * analyzed class/interface/type alias declarations, routing through the
 * canonical FormIR pipeline.
 */

import type { UISchema } from "../ui-schema/types.js";
import {
  createProgramContext,
  findClassByName,
  findInterfaceByName,
  findTypeAliasByName,
} from "../analyzer/program.js";
import {
  analyzeClassToIR,
  analyzeInterfaceToIR,
  analyzeTypeAliasToIR,
  type IRClassAnalysis,
} from "../analyzer/class-analyzer.js";
import { canonicalizeTSDoc, type TSDocSource } from "../canonicalize/index.js";
import { generateJsonSchemaFromIR, type JsonSchema2020 } from "../json-schema/ir-generator.js";
import { generateUiSchemaFromIR } from "../ui-schema/ir-generator.js";

/**
 * Generated schemas for a class.
 */
export interface ClassSchemas {
  /** JSON Schema 2020-12 for validation */
  jsonSchema: JsonSchema2020;
  /** JSON Forms UI Schema for rendering */
  uiSchema: UISchema;
}

/**
 * Generates JSON Schema 2020-12 and UI Schema from an IR class analysis.
 *
 * Routes through the canonical IR pipeline:
 *   IRClassAnalysis → canonicalizeTSDoc → FormIR → JSON Schema / UI Schema
 *
 * @param analysis - The IR analysis result (from analyzeClassToIR, analyzeInterfaceToIR, or analyzeTypeAliasToIR)
 * @param source - Optional source file metadata for provenance
 * @returns Generated JSON Schema and UI Schema
 */
export function generateClassSchemas(
  analysis: IRClassAnalysis,
  source?: TSDocSource
): ClassSchemas {
  const ir = canonicalizeTSDoc(analysis, source);
  return {
    jsonSchema: generateJsonSchemaFromIR(ir),
    uiSchema: generateUiSchemaFromIR(ir),
  };
}

/**
 * Options for generating schemas from a decorated class.
 */
export interface GenerateFromClassOptions {
  /** Path to the TypeScript source file */
  filePath: string;
  /** Class name to analyze */
  className: string;
}

/**
 * Result of generating schemas from a decorated class.
 */
export interface GenerateFromClassResult {
  /** JSON Schema 2020-12 for validation */
  jsonSchema: JsonSchema2020;
  /** JSON Forms UI Schema for rendering */
  uiSchema: UISchema;
}

/**
 * Generates JSON Schema and UI Schema from a decorated TypeScript class.
 *
 * This is a high-level entry point that handles the entire pipeline:
 * creating a TypeScript program, finding the class, analyzing it to IR,
 * and generating schemas — all in one call.
 *
 * @example
 * ```typescript
 * const result = generateSchemasFromClass({
 *   filePath: "./src/forms.ts",
 *   className: "UserForm",
 * });
 * console.log(result.jsonSchema);
 * ```
 *
 * @param options - File path, class name, and optional compiler options
 * @returns Generated JSON Schema and UI Schema
 */
export function generateSchemasFromClass(
  options: GenerateFromClassOptions
): GenerateFromClassResult {
  const ctx = createProgramContext(options.filePath);
  const classDecl = findClassByName(ctx.sourceFile, options.className);

  if (!classDecl) {
    throw new Error(`Class "${options.className}" not found in ${options.filePath}`);
  }

  const analysis = analyzeClassToIR(classDecl, ctx.checker, options.filePath);
  return generateClassSchemas(analysis, { file: options.filePath });
}

/**
 * Options for generating schemas from a named type (class, interface, or type alias).
 */
export interface GenerateSchemasOptions {
  /** Path to the TypeScript source file */
  filePath: string;
  /** Name of the exported class, interface, or type alias to analyze */
  typeName: string;
}

/**
 * Generates JSON Schema and UI Schema from a named TypeScript
 * type — a decorated class, an interface with TSDoc tags, or a type alias.
 *
 * This is the recommended entry point. It automatically detects whether
 * the name resolves to a class, interface, or type alias and uses the
 * appropriate IR analysis pipeline.
 *
 * @example
 * ```typescript
 * const result = generateSchemas({
 *   filePath: "./src/config.ts",
 *   typeName: "DiscountConfig",
 * });
 * ```
 *
 * @param options - File path and type name
 * @returns Generated JSON Schema and UI Schema
 */
export function generateSchemas(options: GenerateSchemasOptions): GenerateFromClassResult {
  const ctx = createProgramContext(options.filePath);
  const source: TSDocSource = { file: options.filePath };

  // Try class first
  const classDecl = findClassByName(ctx.sourceFile, options.typeName);
  if (classDecl) {
    const analysis = analyzeClassToIR(classDecl, ctx.checker, options.filePath);
    return generateClassSchemas(analysis, source);
  }

  // Try interface
  const interfaceDecl = findInterfaceByName(ctx.sourceFile, options.typeName);
  if (interfaceDecl) {
    const analysis = analyzeInterfaceToIR(interfaceDecl, ctx.checker, options.filePath);
    return generateClassSchemas(analysis, source);
  }

  // Try type alias
  const typeAlias = findTypeAliasByName(ctx.sourceFile, options.typeName);
  if (typeAlias) {
    const result = analyzeTypeAliasToIR(typeAlias, ctx.checker, options.filePath);
    if (result.ok) {
      return generateClassSchemas(result.analysis, source);
    }
    throw new Error(result.error);
  }

  throw new Error(
    `Type "${options.typeName}" not found as a class, interface, or type alias in ${options.filePath}`
  );
}
