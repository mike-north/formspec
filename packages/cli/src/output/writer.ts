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

interface ClassSchemaFilePaths {
  classDir: string;
  schemaPath: string;
  uiSchemaPath: string;
}

interface MethodSchemaFilePaths {
  methodDir: string;
  paramsSchemaPath?: string;
  paramsUiSchemaPath?: string;
  returnTypePath: string;
}

interface FormSpecSchemaFilePaths {
  exportDir: string;
  schemaPath: string;
  uiSchemaPath: string;
}

function getClassSchemaFilePaths(className: string, outDir: string): ClassSchemaFilePaths {
  const classDir = path.join(outDir, className);
  return {
    classDir,
    schemaPath: path.join(classDir, "schema.json"),
    uiSchemaPath: path.join(classDir, "ui_schema.json"),
  };
}

function getMethodSchemaFilePaths(method: MethodSchemas, parentDir: string): MethodSchemaFilePaths {
  const methodDir = path.join(parentDir, method.name);
  return {
    methodDir,
    paramsSchemaPath: method.params ? path.join(methodDir, "params.schema.json") : undefined,
    paramsUiSchemaPath: method.params?.uiSchema
      ? path.join(methodDir, "params.ui_schema.json")
      : undefined,
    returnTypePath: path.join(methodDir, "return_type.schema.json"),
  };
}

function getFormSpecSchemaFilePaths(name: string, outDir: string): FormSpecSchemaFilePaths {
  const exportDir = path.join(path.join(outDir, "formspecs"), name);
  return {
    exportDir,
    schemaPath: path.join(exportDir, "schema.json"),
    uiSchemaPath: path.join(exportDir, "ui_schema.json"),
  };
}

/**
 * Computes the file layout for a class without writing anything.
 */
function planClassSchemaFiles(
  className: string,
  instanceMethods: readonly MethodSchemas[],
  staticMethods: readonly MethodSchemas[],
  options: WriteOptions
): ClassWriteResult {
  const { outDir } = options;
  const classPaths = getClassSchemaFilePaths(className, outDir);
  const files = [
    classPaths.schemaPath,
    classPaths.uiSchemaPath,
    ...planMethodSchemaFiles(instanceMethods, path.join(classPaths.classDir, "instance_methods")),
    ...planMethodSchemaFiles(staticMethods, path.join(classPaths.classDir, "static_methods")),
  ];

  return { dir: classPaths.classDir, files };
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
  const classPaths = getClassSchemaFilePaths(className, outDir);
  const files: string[] = [];

  // Ensure class directory exists
  ensureDir(classPaths.classDir);

  // Write class schema
  writeJson(classPaths.schemaPath, classSchemas.jsonSchema, indent);
  files.push(classPaths.schemaPath);

  // Write class UI Schema
  writeJson(classPaths.uiSchemaPath, classSchemas.uiSchema, indent);
  files.push(classPaths.uiSchemaPath);

  // Write instance methods
  if (instanceMethods.length > 0) {
    const instanceDir = path.join(classPaths.classDir, "instance_methods");
    ensureDir(instanceDir);

    for (const method of instanceMethods) {
      const methodFiles = writeMethodSchemas(method, instanceDir, indent);
      files.push(...methodFiles);
    }
  }

  // Write static methods
  if (staticMethods.length > 0) {
    const staticDir = path.join(classPaths.classDir, "static_methods");
    ensureDir(staticDir);

    for (const method of staticMethods) {
      const methodFiles = writeMethodSchemas(method, staticDir, indent);
      files.push(...methodFiles);
    }
  }

  return { dir: classPaths.classDir, files };
}

function planMethodSchemaFiles(methods: readonly MethodSchemas[], parentDir: string): string[] {
  return methods.flatMap((method) => {
    const methodPaths = getMethodSchemaFilePaths(method, parentDir);
    const files: string[] = [];

    if (methodPaths.paramsSchemaPath) {
      files.push(methodPaths.paramsSchemaPath);
    }

    if (methodPaths.paramsUiSchemaPath) {
      files.push(methodPaths.paramsUiSchemaPath);
    }

    files.push(methodPaths.returnTypePath);

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
  const methodPaths = getMethodSchemaFilePaths(method, parentDir);
  ensureDir(methodPaths.methodDir);
  const files: string[] = [];

  // Write params schema
  if (method.params && methodPaths.paramsSchemaPath) {
    writeJson(methodPaths.paramsSchemaPath, method.params.jsonSchema, indent);
    files.push(methodPaths.paramsSchemaPath);

    // Write params UI Schema if available (from FormSpec)
    if (method.params.uiSchema && methodPaths.paramsUiSchemaPath) {
      writeJson(methodPaths.paramsUiSchemaPath, method.params.uiSchema, indent);
      files.push(methodPaths.paramsUiSchemaPath);
    }
  }

  // Write return type schema
  writeJson(methodPaths.returnTypePath, method.returnType, indent);
  files.push(methodPaths.returnTypePath);

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
  formSpecs: ReadonlyMap<string, FormSpecSchemas>,
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
    const formSpecPaths = getFormSpecSchemaFilePaths(name, outDir);
    ensureDir(formSpecPaths.exportDir);

    // Write JSON Schema
    writeJson(formSpecPaths.schemaPath, schemas.jsonSchema, indent);
    files.push(formSpecPaths.schemaPath);

    // Write UI Schema
    writeJson(formSpecPaths.uiSchemaPath, schemas.uiSchema, indent);
    files.push(formSpecPaths.uiSchemaPath);
  }

  return { dir: formspecsDir, files };
}

/**
 * Computes the file layout for standalone FormSpec exports without writing anything.
 */
function planFormSpecSchemaFiles(
  formSpecs: ReadonlyMap<string, FormSpecSchemas>,
  options: WriteOptions
): FormSpecWriteResult {
  const { outDir } = options;
  const formspecsDir = path.join(outDir, "formspecs");
  const files: string[] = [];

  for (const name of formSpecs.keys()) {
    const formSpecPaths = getFormSpecSchemaFilePaths(name, outDir);
    files.push(formSpecPaths.schemaPath);
    files.push(formSpecPaths.uiSchemaPath);
  }

  return { dir: formspecsDir, files };
}

export { planClassSchemaFiles, planFormSpecSchemaFiles };

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
