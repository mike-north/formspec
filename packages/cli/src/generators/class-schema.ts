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
  type JsonSchema,
  type FormSpecField,
} from "../analyzer/type-converter.js";

/**
 * Generated schemas for a class.
 */
export interface ClassSchemas {
  /** JSON Schema for validation */
  jsonSchema: JsonSchema;
  /** FormSpec/UI Schema for rendering */
  uxSpec: {
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
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  const uxElements: FormSpecField[] = [];

  for (const field of analysis.fields) {
    // Generate JSON Schema for field
    const { jsonSchema: baseSchema } = convertType(field.type, checker);
    const fieldSchema = applyDecoratorsToSchema(baseSchema, field.decorators);
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
    uxElements.push(formSpecField);
  }

  // Build complete JSON Schema
  const jsonSchema: JsonSchema = {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };

  // Build FormSpec/UI Schema
  const uxSpec = {
    elements: uxElements,
  };

  return { jsonSchema, uxSpec };
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
): JsonSchema {
  const { jsonSchema: baseSchema } = convertType(field.type, checker);
  return applyDecoratorsToSchema(baseSchema, field.decorators);
}
