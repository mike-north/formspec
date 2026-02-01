/**
 * Output writer for creating the schema folder structure.
 *
 * Creates directories and writes JSON files for:
 * - Class schema and UI Schema
 * - Instance method schemas
 * - Static method schemas
 * - Standalone FormSpec exports (chain DSL)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ClassSchemas } from "../generators/class-schema.js";
import type { MethodSchemas } from "../generators/method-schema.js";
import type { FormSpecSchemas } from "../runtime/formspec-loader.js";

/**
 * Options for writing output files.
 */
export interface WriteOptions {
  /** Output directory path */
  outDir: string;
  /** JSON indentation (default: 2) */
  indent?: number;
}

/**
 * Result of writing a class's schemas.
 */
export interface ClassWriteResult {
  /** Path to the class output directory */
  dir: string;
  /** Files that were written */
  files: string[];
}

/**
 * Result of writing standalone FormSpec schemas.
 */
export interface FormSpecWriteResult {
  /** Path to the output directory */
  dir: string;
  /** Files that were written */
  files: string[];
}

/**
 * Writes all schemas for a class to the output directory.
 *
 * Creates the following structure:
 * ```
 * {outDir}/{className}/
 * ├── schema.json
 * ├── ux_spec.json
 * ├── instance_methods/
 * │   └── {methodName}/
 * │       ├── params.schema.json
 * │       ├── params.ux_spec.json (if FormSpec-based)
 * │       └── return_type.schema.json
 * └── static_methods/
 *     └── {methodName}/
 *         └── ...
 * ```
 *
 * @param className - Name of the class
 * @param classSchemas - Generated class schemas
 * @param instanceMethods - Instance method schemas
 * @param staticMethods - Static method schemas
 * @param options - Write options
 * @returns Write result with paths
 */
export function writeClassSchemas(
  className: string,
  classSchemas: ClassSchemas,
  instanceMethods: MethodSchemas[],
  staticMethods: MethodSchemas[],
  options: WriteOptions
): ClassWriteResult {
  const { outDir, indent = 2 } = options;
  const classDir = path.join(outDir, className);
  const files: string[] = [];

  // Ensure class directory exists
  ensureDir(classDir);

  // Write class schema
  const schemaPath = path.join(classDir, "schema.json");
  writeJson(schemaPath, classSchemas.jsonSchema, indent);
  files.push(schemaPath);

  // Write class UI Schema
  const uxSpecPath = path.join(classDir, "ux_spec.json");
  writeJson(uxSpecPath, classSchemas.uxSpec, indent);
  files.push(uxSpecPath);

  // Write instance methods
  if (instanceMethods.length > 0) {
    const instanceDir = path.join(classDir, "instance_methods");
    ensureDir(instanceDir);

    for (const method of instanceMethods) {
      const methodFiles = writeMethodSchemas(method, instanceDir, indent);
      files.push(...methodFiles);
    }
  }

  // Write static methods
  if (staticMethods.length > 0) {
    const staticDir = path.join(classDir, "static_methods");
    ensureDir(staticDir);

    for (const method of staticMethods) {
      const methodFiles = writeMethodSchemas(method, staticDir, indent);
      files.push(...methodFiles);
    }
  }

  return { dir: classDir, files };
}

/**
 * Writes schemas for a single method.
 *
 * @param method - Method schemas
 * @param parentDir - Parent directory (instance_methods or static_methods)
 * @param indent - JSON indentation
 * @returns Array of written file paths
 */
function writeMethodSchemas(
  method: MethodSchemas,
  parentDir: string,
  indent: number
): string[] {
  const methodDir = path.join(parentDir, method.name);
  ensureDir(methodDir);
  const files: string[] = [];

  // Write params schema
  if (method.params) {
    const paramsSchemaPath = path.join(methodDir, "params.schema.json");
    writeJson(paramsSchemaPath, method.params.jsonSchema, indent);
    files.push(paramsSchemaPath);

    // Write params UI Schema if available (from FormSpec)
    if (method.params.uxSpec) {
      const paramsUxPath = path.join(methodDir, "params.ux_spec.json");
      writeJson(paramsUxPath, method.params.uxSpec, indent);
      files.push(paramsUxPath);
    }
  }

  // Write return type schema
  const returnPath = path.join(methodDir, "return_type.schema.json");
  writeJson(returnPath, method.returnType, indent);
  files.push(returnPath);

  return files;
}

/**
 * Writes standalone FormSpec schemas (chain DSL exports).
 *
 * Creates the following structure:
 * ```
 * {outDir}/formspecs/
 * └── {exportName}/
 *     ├── schema.json
 *     └── ux_spec.json
 * ```
 *
 * @param formSpecs - Map of FormSpec export names to their schemas
 * @param options - Write options
 * @returns Write result with paths
 */
export function writeFormSpecSchemas(
  formSpecs: Map<string, FormSpecSchemas>,
  options: WriteOptions
): FormSpecWriteResult {
  const { outDir, indent = 2 } = options;
  const formspecsDir = path.join(outDir, "formspecs");
  const files: string[] = [];

  if (formSpecs.size === 0) {
    return { dir: formspecsDir, files };
  }

  ensureDir(formspecsDir);

  for (const [name, schemas] of formSpecs) {
    const exportDir = path.join(formspecsDir, name);
    ensureDir(exportDir);

    // Write JSON Schema
    const schemaPath = path.join(exportDir, "schema.json");
    writeJson(schemaPath, schemas.jsonSchema, indent);
    files.push(schemaPath);

    // Write UI Schema
    const uxSpecPath = path.join(exportDir, "ux_spec.json");
    writeJson(uxSpecPath, schemas.uiSchema, indent);
    files.push(uxSpecPath);
  }

  return { dir: formspecsDir, files };
}

/**
 * Ensures a directory exists, creating it if necessary.
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Writes a JSON object to a file.
 */
function writeJson(filePath: string, data: unknown, indent: number): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, indent) + "\n");
}
