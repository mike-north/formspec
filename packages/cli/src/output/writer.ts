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
import type { ClassSchemas } from "@formspec/build";
import type { MethodSchemas } from "@formspec/build/internals";
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
 * Computes the file layout for a class without writing anything.
 */
export function planClassSchemaFiles(
  className: string,
  instanceMethods: readonly MethodSchemas[],
  staticMethods: readonly MethodSchemas[],
  options: WriteOptions
): ClassWriteResult {
  const { outDir } = options;
  const classDir = path.join(outDir, className);
  const files = [
    path.join(classDir, "schema.json"),
    path.join(classDir, "ui_schema.json"),
    ...planMethodSchemaFiles(instanceMethods, path.join(classDir, "instance_methods")),
    ...planMethodSchemaFiles(staticMethods, path.join(classDir, "static_methods")),
  ];

  return { dir: classDir, files };
}

/**
 * Writes all schemas for a class to the output directory.
 *
 * Creates the following structure:
 * ```
 * {outDir}/{className}/
 * ├── schema.json
 * ├── ui_schema.json
 * ├── instance_methods/
 * │   └── {methodName}/
 * │       ├── params.schema.json
 * │       ├── params.ui_schema.json (if FormSpec-based)
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
  const uiSchemaPath = path.join(classDir, "ui_schema.json");
  writeJson(uiSchemaPath, classSchemas.uiSchema, indent);
  files.push(uiSchemaPath);

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

function planMethodSchemaFiles(
  methods: readonly MethodSchemas[],
  parentDir: string
): string[] {
  return methods.flatMap((method) => {
    const methodDir = path.join(parentDir, method.name);
    const files = [path.join(methodDir, "return_type.schema.json")];

    if (method.params) {
      files.unshift(path.join(methodDir, "params.schema.json"));

      if (method.params.uiSchema) {
        files.push(path.join(methodDir, "params.ui_schema.json"));
      }
    }

    return files;
  });
}

/**
 * Writes schemas for a single method.
 *
 * @param method - Method schemas
 * @param parentDir - Parent directory (instance_methods or static_methods)
 * @param indent - JSON indentation
 * @returns Array of written file paths
 */
function writeMethodSchemas(method: MethodSchemas, parentDir: string, indent: number): string[] {
  const methodDir = path.join(parentDir, method.name);
  ensureDir(methodDir);
  const files: string[] = [];

  // Write params schema
  if (method.params) {
    const paramsSchemaPath = path.join(methodDir, "params.schema.json");
    writeJson(paramsSchemaPath, method.params.jsonSchema, indent);
    files.push(paramsSchemaPath);

    // Write params UI Schema if available (from FormSpec)
    if (method.params.uiSchema) {
      const paramsUiSchemaPath = path.join(methodDir, "params.ui_schema.json");
      writeJson(paramsUiSchemaPath, method.params.uiSchema, indent);
      files.push(paramsUiSchemaPath);
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
 *     └── ui_schema.json
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
    const uiSchemaPath = path.join(exportDir, "ui_schema.json");
    writeJson(uiSchemaPath, schemas.uiSchema, indent);
    files.push(uiSchemaPath);
  }

  return { dir: formspecsDir, files };
}

/**
 * Computes the file layout for standalone FormSpec exports without writing anything.
 */
export function planFormSpecSchemaFiles(
  formSpecs: ReadonlyMap<string, FormSpecSchemas>,
  options: WriteOptions
): FormSpecWriteResult {
  const { outDir } = options;
  const formspecsDir = path.join(outDir, "formspecs");
  const files: string[] = [];

  for (const name of formSpecs.keys()) {
    const exportDir = path.join(formspecsDir, name);
    files.push(path.join(exportDir, "schema.json"));
    files.push(path.join(exportDir, "ui_schema.json"));
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
