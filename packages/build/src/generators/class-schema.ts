/**
 * Class schema generator.
 *
 * Generates JSON Schema and FormSpec/UI Schema from statically analyzed
 * class fields and decorators.
 */

import type * as ts from "typescript";
import type { ClassAnalysis, FieldInfo } from "../analyzer/class-analyzer.js";
import {
  convertType,
  applyDecoratorsToSchema,
  createFormSpecField,
  type FormSpecField,
} from "../analyzer/type-converter.js";
import type { ExtendedJSONSchema7 } from "../json-schema/types.js";
import { createProgramContext, findClassByName } from "../analyzer/program.js";
import { analyzeClass } from "../analyzer/class-analyzer.js";

/**
 * Generated schemas for a class.
 */
export interface ClassSchemas {
  /** JSON Schema for validation */
  jsonSchema: ExtendedJSONSchema7;
  /** FormSpec/UI Schema for rendering */
  uiSchema: {
    elements: FormSpecField[];
  };
}

/**
 * Generates JSON Schema and FormSpec from a class analysis.
 *
 * Uses static type information and decorator metadata to build
 * complete schema definitions for a class's fields.
 *
 * @param analysis - The class analysis result
 * @param checker - TypeScript type checker
 * @returns Generated JSON Schema and FormSpec
 */
export function generateClassSchemas(
  analysis: ClassAnalysis,
  checker: ts.TypeChecker
): ClassSchemas {
  const properties: Record<string, ExtendedJSONSchema7> = {};
  const required: string[] = [];
  const uiElements: FormSpecField[] = [];

  for (const field of analysis.fields) {
    // Generate JSON Schema for field
    const { jsonSchema: baseSchema } = convertType(field.type, checker);
    const fieldSchema = applyDecoratorsToSchema(baseSchema, field.decorators, field);
    properties[field.name] = fieldSchema;

    // Track required fields
    if (!field.optional) {
      required.push(field.name);
    }

    // Generate FormSpec field
    const formSpecField = createFormSpecField(
      field.name,
      field.type,
      field.decorators,
      field.optional,
      checker
    );
    uiElements.push(formSpecField);
  }

  // Build complete JSON Schema
  const jsonSchema: ExtendedJSONSchema7 = {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };

  // Build FormSpec/UI Schema
  const uiSchema = {
    elements: uiElements,
  };

  return { jsonSchema, uiSchema };
}

/**
 * Generates JSON Schema for a single field.
 *
 * Useful for generating schemas for method return types
 * or individual field extraction.
 *
 * @param field - The field information
 * @param checker - TypeScript type checker
 * @returns JSON Schema for the field's type
 */
export function generateFieldSchema(
  field: FieldInfo,
  checker: ts.TypeChecker
): ExtendedJSONSchema7 {
  const { jsonSchema: baseSchema } = convertType(field.type, checker);
  return applyDecoratorsToSchema(baseSchema, field.decorators, field);
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
  /** JSON Schema for validation */
  jsonSchema: ExtendedJSONSchema7;
  /** FormSpec/UI Schema for rendering */
  uiSchema: { elements: FormSpecField[] };
}

/**
 * Generates JSON Schema and FormSpec/UI Schema from a decorated TypeScript class.
 *
 * This is a high-level entry point that handles the entire pipeline:
 * creating a TypeScript program, finding the class, analyzing it,
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
 * @returns Generated JSON Schema and FormSpec/UI Schema
 */
export function generateSchemasFromClass(
  options: GenerateFromClassOptions
): GenerateFromClassResult {
  const ctx = createProgramContext(options.filePath);
  const classDecl = findClassByName(ctx.sourceFile, options.className);

  if (!classDecl) {
    throw new Error(`Class "${options.className}" not found in ${options.filePath}`);
  }

  const analysis = analyzeClass(classDecl, ctx.checker);
  return generateClassSchemas(analysis, ctx.checker);
}
