/**
 * Method schema generator.
 *
 * Generates schemas for method parameters and return types, routing through
 * the canonical IR pipeline (TypeScript type → TypeNode → JSON Schema 2020-12).
 */

import type * as ts from "typescript";
import type { MethodInfo, ParameterInfo } from "../analyzer/class-analyzer.js";
import { resolveTypeNode } from "../analyzer/class-analyzer.js";
import type { TypeDefinition } from "@formspec/core";
import { generateJsonSchemaFromIR, type JsonSchema2020 } from "../json-schema/ir-generator.js";
import { IR_VERSION } from "@formspec/core";

/**
 * Runtime-loaded FormSpec schemas, compatible with the CLI's FormSpecSchemas type.
 */
export interface LoadedFormSpecSchemas {
  /** The FormSpec export name */
  name: string;
  /** Generated JSON Schema */
  jsonSchema: unknown;
  /** Generated UI Schema (FormSpec/JSON Forms) */
  uiSchema: unknown;
}

/**
 * Generated schemas for a method.
 */
export interface MethodSchemas {
  /** Method name */
  name: string;
  /** Parameter schemas (from FormSpec or static analysis) */
  params: MethodParamsSchemas | null;
  /** Return type schema */
  returnType: JsonSchema2020;
}

/**
 * Parameter schemas for a method.
 */
export interface MethodParamsSchemas {
  /** JSON Schema for parameters */
  jsonSchema: JsonSchema2020;
  /** UI Schema / FormSpec for parameters (if available) */
  uiSchema: object | null;
  /** Name of the FormSpec export used (if any) */
  formSpecExport: string | null;
}

/**
 * Resolves a TypeScript type to a JSON Schema 2020-12 sub-schema via the IR.
 */
function typeToJsonSchema(type: ts.Type, checker: ts.TypeChecker): JsonSchema2020 {
  const typeRegistry: Record<string, TypeDefinition> = {};
  const visiting = new Set<ts.Type>();
  const typeNode = resolveTypeNode(type, checker, "", typeRegistry, visiting);

  const fieldProvenance = { surface: "tsdoc" as const, file: "", line: 0, column: 0 };

  // Build a minimal FormIR wrapping a single field to reuse the IR generator.
  const ir = {
    kind: "form-ir" as const,
    irVersion: IR_VERSION,
    elements: [
      {
        kind: "field" as const,
        name: "__result",
        type: typeNode,
        required: true,
        constraints: [],
        annotations: [],
        provenance: fieldProvenance,
      },
    ],
    typeRegistry,
    provenance: fieldProvenance,
  };

  const schema = generateJsonSchemaFromIR(ir);
  // Extract the single field's sub-schema from the wrapper.
  const fieldSchema = schema.properties?.["__result"];
  if (fieldSchema) {
    // If there are $defs, attach them to the field schema for completeness.
    if (schema.$defs && Object.keys(schema.$defs).length > 0) {
      return { ...fieldSchema, $defs: schema.$defs };
    }
    return fieldSchema;
  }
  return { type: "object" };
}

/**
 * Generates schemas for a method's parameters and return type.
 *
 * If a parameter references a FormSpec via `InferSchema<typeof X>`,
 * the schemas are taken from the loaded FormSpec at runtime.
 * Otherwise, schemas are generated from static type analysis via the IR.
 *
 * @param method - The method information from static analysis
 * @param checker - TypeScript type checker
 * @param loadedFormSpecs - Map of FormSpec export names to their schemas
 * @returns Generated method schemas
 */
export function generateMethodSchemas(
  method: MethodInfo,
  checker: ts.TypeChecker,
  loadedFormSpecs: Map<string, LoadedFormSpecSchemas>
): MethodSchemas {
  // Generate return type schema via IR
  const returnType = typeToJsonSchema(method.returnType, checker);

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
  loadedFormSpecs: Map<string, LoadedFormSpecSchemas>
): MethodParamsSchemas | null {
  if (parameters.length === 0) {
    return null;
  }

  // Check if any parameter uses InferSchema<typeof X>
  for (const param of parameters) {
    if (param.formSpecExportName) {
      const formSpec = loadedFormSpecs.get(param.formSpecExportName);
      if (formSpec) {
        return {
          jsonSchema: formSpec.jsonSchema as JsonSchema2020,
          uiSchema: formSpec.uiSchema as object | null,
          formSpecExport: param.formSpecExportName,
        };
      }

      // FormSpec not found - fall back to static analysis
      console.warn(
        `Warning: FormSpec export "${param.formSpecExportName}" not found, using static analysis`
      );
    }
  }

  // Generate from static type analysis via IR
  if (parameters.length === 1 && parameters[0]) {
    const param = parameters[0];
    const jsonSchema = typeToJsonSchema(param.type, checker);
    return {
      jsonSchema,
      uiSchema: null,
      formSpecExport: null,
    };
  }

  // Multiple parameters - create object schema
  const properties: Record<string, JsonSchema2020> = {};
  const required: string[] = [];

  for (const param of parameters) {
    const paramSchema = typeToJsonSchema(param.type, checker);
    properties[param.name] = paramSchema;
    if (!param.optional) {
      required.push(param.name);
    }
  }

  return {
    jsonSchema: {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    },
    uiSchema: null,
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
export function collectFormSpecReferences(methods: MethodInfo[]): Set<string> {
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
