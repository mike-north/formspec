/**
 * Method schema generator.
 *
 * Generates schemas for method parameters and return types:
 * - Parameters using FormSpec (InferSchema<typeof X>) → runtime generation
 * - Parameters with regular types → static type conversion
 * - Return types → static type conversion
 */

import type * as ts from "typescript";
import type { MethodInfo, ParameterInfo } from "../analyzer/class-analyzer.js";
import { convertType, type JsonSchema } from "../analyzer/type-converter.js";
import type { FormSpecSchemas } from "../runtime/formspec-loader.js";

/**
 * Generated schemas for a method.
 */
export interface MethodSchemas {
  /** Method name */
  name: string;
  /** Parameter schemas (from FormSpec or static analysis) */
  params: MethodParamsSchemas | null;
  /** Return type schema */
  returnType: JsonSchema;
}

/**
 * Parameter schemas for a method.
 */
export interface MethodParamsSchemas {
  /** JSON Schema for parameters */
  jsonSchema: JsonSchema;
  /** UI Schema / FormSpec for parameters (if available) */
  uxSpec: object | null;
  /** Name of the FormSpec export used (if any) */
  formSpecExport: string | null;
}

/**
 * Generates schemas for a method's parameters and return type.
 *
 * If a parameter references a FormSpec via `InferSchema<typeof X>`,
 * the schemas are taken from the loaded FormSpec at runtime.
 * Otherwise, schemas are generated from static type analysis.
 *
 * @param method - The method information from static analysis
 * @param checker - TypeScript type checker
 * @param loadedFormSpecs - Map of FormSpec export names to their schemas
 * @returns Generated method schemas
 */
export function generateMethodSchemas(
  method: MethodInfo,
  checker: ts.TypeChecker,
  loadedFormSpecs: Map<string, FormSpecSchemas>
): MethodSchemas {
  // Generate return type schema from static analysis
  const returnType = convertType(method.returnType, checker).jsonSchema;

  // Handle parameters
  const params = generateParamsSchemas(method.parameters, checker, loadedFormSpecs);

  return {
    name: method.name,
    params,
    returnType,
  };
}

/**
 * Generates schemas for method parameters.
 */
function generateParamsSchemas(
  parameters: ParameterInfo[],
  checker: ts.TypeChecker,
  loadedFormSpecs: Map<string, FormSpecSchemas>
): MethodParamsSchemas | null {
  if (parameters.length === 0) {
    return null;
  }

  // Check if any parameter uses InferSchema<typeof X>
  for (const param of parameters) {
    if (param.formSpecExportName) {
      const formSpec = loadedFormSpecs.get(param.formSpecExportName);
      if (formSpec) {
        // Use runtime-generated schemas from FormSpec
        // Cast JSONSchema7 to our JsonSchema type (structurally compatible)
        return {
          jsonSchema: formSpec.jsonSchema as unknown as JsonSchema,
          uxSpec: formSpec.uiSchema,
          formSpecExport: param.formSpecExportName,
        };
      }

      // FormSpec not found - fall back to static analysis
      console.warn(
        `Warning: FormSpec export "${param.formSpecExportName}" not found, using static analysis`
      );
    }
  }

  // Generate from static type analysis
  if (parameters.length === 1 && parameters[0]) {
    // Single parameter - use its type directly
    const param = parameters[0];
    const jsonSchema = convertType(param.type, checker).jsonSchema;
    return {
      jsonSchema,
      uxSpec: null,
      formSpecExport: null,
    };
  }

  // Multiple parameters - create object schema
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const param of parameters) {
    const paramSchema = convertType(param.type, checker).jsonSchema;
    properties[param.name] = paramSchema;
    // Only non-optional parameters should be marked as required
    if (!param.optional) {
      required.push(param.name);
    }
  }

  return {
    jsonSchema: {
      type: "object",
      properties,
      required,
    },
    uxSpec: null,
    formSpecExport: null,
  };
}

/**
 * Collects all FormSpec export names referenced by methods.
 *
 * Use this to determine which exports to load at runtime.
 *
 * @param methods - Array of method infos
 * @returns Set of FormSpec export names
 */
export function collectFormSpecReferences(
  methods: MethodInfo[]
): Set<string> {
  const references = new Set<string>();

  for (const method of methods) {
    for (const param of method.parameters) {
      if (param.formSpecExportName) {
        references.add(param.formSpecExportName);
      }
    }
  }

  return references;
}
