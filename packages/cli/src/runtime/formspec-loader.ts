/**
 * FormSpec loader for dynamic import and runtime access.
 *
 * Loads compiled TypeScript modules and extracts:
 * - Exported FormSpec constants (chain DSL)
 * - Specific exports by name (for method parameters)
 *
 * Uses the @formspec/build package to generate schemas from FormSpec objects.
 */

import { generateJsonSchema, generateUiSchema } from "@formspec/build";
import type { JSONSchema7, UISchema } from "@formspec/build";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * A FormSpec object (duck-typed for runtime detection).
 */
interface FormSpecLike {
  elements: unknown[];
}

/**
 * Result of loading and generating schemas from a FormSpec.
 */
export interface FormSpecSchemas {
  /** The FormSpec export name */
  name: string;
  /** Generated JSON Schema */
  jsonSchema: JSONSchema7;
  /** Generated UI Schema (FormSpec/JSON Forms) */
  uiSchema: UISchema;
}

/**
 * Result of loading all FormSpecs from a module.
 */
export interface ModuleFormSpecs {
  /** All FormSpec exports found in the module */
  formSpecs: Map<string, FormSpecSchemas>;
  /** The raw module for accessing other exports */
  module: Record<string, unknown>;
}

/**
 * Checks if a value is a FormSpec object.
 *
 * Uses duck typing since the actual FormSpec type may come from
 * different package versions.
 */
export function isFormSpec(value: unknown): value is FormSpecLike {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // FormSpec objects have an 'elements' array property
  const elements = obj["elements"];
  if (!Array.isArray(elements)) {
    return false;
  }

  // Each element should have a _type property
  return elements.every(
    (el) => el !== null && typeof el === "object" && "_type" in el
  );
}

/**
 * Loads a module and extracts all FormSpec exports.
 *
 * This handles both:
 * - Chain DSL: `export const MyForm = formspec(...)`
 * - Method parameters: exports referenced by `InferSchema<typeof X>`
 *
 * @param filePath - Path to the compiled JavaScript file
 * @returns Map of export names to their generated schemas
 */
export async function loadFormSpecs(filePath: string): Promise<ModuleFormSpecs> {
  const absolutePath = path.resolve(filePath);

  // Convert to file URL for ESM import
  const fileUrl = pathToFileURL(absolutePath).href;

  // Dynamic import
  const module = (await import(fileUrl)) as Record<string, unknown>;

  const formSpecs = new Map<string, FormSpecSchemas>();

  // Find all FormSpec exports
  for (const [name, value] of Object.entries(module)) {
    if (isFormSpec(value)) {
      try {
        // Use @formspec/build generators
        // The types expect FormSpec<readonly FormElement[]>
        // but we're duck-typing at runtime
        const jsonSchema = generateJsonSchema(value as never);
        const uiSchema = generateUiSchema(value as never);

        formSpecs.set(name, {
          name,
          jsonSchema,
          uiSchema,
        });
      } catch (error) {
        console.warn(
          `Warning: Failed to generate schemas for export "${name}":`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  return { formSpecs, module };
}

/**
 * Loads specific FormSpec exports by name.
 *
 * Use this when you know which exports to load (e.g., from static analysis
 * of `InferSchema<typeof X>` patterns in method parameters).
 *
 * @param filePath - Path to the compiled JavaScript file
 * @param exportNames - Names of exports to load
 * @returns Map of found FormSpecs with their schemas
 */
export async function loadNamedFormSpecs(
  filePath: string,
  exportNames: string[]
): Promise<Map<string, FormSpecSchemas>> {
  const { formSpecs, module } = await loadFormSpecs(filePath);
  const result = new Map<string, FormSpecSchemas>();

  for (const name of exportNames) {
    // Check if we already have it from the full scan
    const existing = formSpecs.get(name);
    if (existing) {
      result.set(name, existing);
      continue;
    }

    // Try to access it directly from the module
    const value = module[name];
    if (value && isFormSpec(value)) {
      try {
        const jsonSchema = generateJsonSchema(value as never);
        const uiSchema = generateUiSchema(value as never);
        result.set(name, { name, jsonSchema, uiSchema });
      } catch (error) {
        console.warn(
          `Warning: Failed to generate schemas for "${name}":`,
          error instanceof Error ? error.message : error
        );
      }
    } else if (value) {
      console.warn(
        `Warning: Export "${name}" exists but is not a valid FormSpec object`
      );
    } else {
      console.warn(`Warning: Export "${name}" not found in module`);
    }
  }

  return result;
}

/**
 * Resolves the compiled JS path from a TS source path.
 *
 * This handles common TypeScript output patterns:
 * - ./src/*.ts → ./dist/*.js
 * - ./src/*.ts → ./build/*.js
 * - ./src/*.ts → ./src/*.js (in-place compilation)
 *
 * @param tsPath - Path to the TypeScript source file
 * @param outDir - Optional explicit output directory
 * @returns Path to the expected compiled JS file
 */
export function resolveCompiledPath(tsPath: string, outDir?: string): string {
  const absolutePath = path.resolve(tsPath);
  const ext = path.extname(absolutePath);

  // Already a JS file
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
    return absolutePath;
  }

  // Replace .ts/.tsx/.mts extension with .js
  const basePath = absolutePath.replace(/\.(ts|tsx|mts)$/, ".js");

  if (outDir) {
    // If outDir is specified, replace src dir with outDir
    const fileName = path.basename(basePath);
    const dirName = path.dirname(absolutePath);

    // Try to find 'src' in the path and replace with outDir
    const srcIndex = dirName.lastIndexOf(path.sep + "src");
    if (srcIndex !== -1) {
      const baseDir = dirName.substring(0, srcIndex);
      const subPath = dirName.substring(srcIndex + 4); // +4 for '/src'
      return path.join(baseDir, outDir, subPath, fileName);
    }

    // Fallback: just use outDir relative to file's directory
    return path.join(path.dirname(absolutePath), outDir, fileName);
  }

  // Return basePath (actual existence check happens at import time)
  // Future enhancement: could check fs.existsSync for common patterns
  return basePath;
}
