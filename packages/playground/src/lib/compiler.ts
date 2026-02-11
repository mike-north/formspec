/**
 * TypeScript compilation and FormSpec execution for the playground.
 *
 * This module handles:
 * 1. Transpiling TypeScript to JavaScript using the TypeScript compiler
 * 2. Executing the transpiled code to extract the FormSpec object
 * 3. Generating JSON Schema and UI Schema from the FormSpec
 * 4. Validating FormSpec against constraints
 */

import type { FormSpec, FormElement } from "@formspec/core";
import * as dsl from "@formspec/dsl";
import { buildFormSchemas, type JSONSchema7, type UISchema } from "@formspec/build/browser";
import { validateFormSpec, type ConstraintConfig } from "@formspec/constraints/browser";
import ts from "typescript";

export interface CompilationResult {
  success: true;
  formSpec: FormSpec<readonly FormElement[]>;
  jsonSchema: JSONSchema7;
  uiSchema: UISchema;
}

export interface CompilationError {
  success: false;
  errors: DiagnosticMessage[];
}

export interface DiagnosticMessage {
  message: string;
  line?: number;
  column?: number;
  severity: "error" | "warning";
}

export type CompileResult = CompilationResult | CompilationError;

export interface CompileOptions {
  /** Constraint configuration for validation */
  constraints?: ConstraintConfig;
}

/**
 * Compiles FormSpec TypeScript code and generates schemas.
 *
 * @param code - The TypeScript source code containing a FormSpec definition
 * @param options - Compilation options including constraints
 * @returns Compilation result with schemas or error messages
 */
export function compileFormSpec(code: string, options: CompileOptions = {}): CompileResult {
  // Step 1: Transpile TypeScript to JavaScript
  const transpileResult = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      strict: false, // Be lenient in playground
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
    reportDiagnostics: true,
  });

  // Check for transpilation errors
  if (transpileResult.diagnostics && transpileResult.diagnostics.length > 0) {
    const errors = transpileResult.diagnostics
      .filter((d) => d.category === ts.DiagnosticCategory.Error)
      .map((d): DiagnosticMessage => {
        const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
        const pos = d.file && d.start !== undefined
          ? d.file.getLineAndCharacterOfPosition(d.start)
          : undefined;
        return {
          message,
          line: pos ? pos.line + 1 : undefined,
          column: pos ? pos.character + 1 : undefined,
          severity: "error",
        };
      });

    if (errors.length > 0) {
      return { success: false, errors };
    }
  }

  // Step 2: Execute the transpiled code to get the FormSpec object
  try {
    const formSpec = executeCode(transpileResult.outputText);

    if (!formSpec || typeof formSpec !== "object" || !("elements" in formSpec)) {
      return {
        success: false,
        errors: [
          {
            message:
              "Code must export a FormSpec object as the default export. " +
              "Use: export default formspec(...)",
            severity: "error",
          },
        ],
      };
    }

    // Step 3: Generate schemas
    const { jsonSchema, uiSchema } = buildFormSchemas(formSpec as FormSpec<readonly FormElement[]>);

    // Step 4: Validate against constraints
    const constraintErrors: DiagnosticMessage[] = [];
    if (options.constraints) {
      const validationResult = validateFormSpec(
        formSpec as FormSpec<readonly FormElement[]>,
        { constraints: options.constraints }
      );

      for (const issue of validationResult.issues) {
        // Try to find line number by searching for the field name in source
        const lineInfo = issue.path ? findFieldLineNumber(code, issue.path) : undefined;
        constraintErrors.push({
          message: issue.message,
          line: lineInfo?.line,
          column: lineInfo?.column,
          severity: issue.severity,
        });
      }
    }

    // If there are constraint errors, return them
    if (constraintErrors.length > 0) {
      return {
        success: false,
        errors: constraintErrors,
      };
    }

    return {
      success: true,
      formSpec: formSpec as FormSpec<readonly FormElement[]>,
      jsonSchema,
      uiSchema,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      errors: [{ message: `Runtime error: ${message}`, severity: "error" }],
    };
  }
}

/**
 * Attempts to find the line number where a field is defined in the source code.
 */
function findFieldLineNumber(
  code: string,
  path: string
): { line: number; column: number } | undefined {
  // Extract field name from path (e.g., "name" from "[group:Contact]/name")
  const parts = path.split("/");
  const fieldName = parts[parts.length - 1];

  if (!fieldName || fieldName.startsWith("[")) {
    return undefined;
  }

  // Search for field.xxx("fieldName" pattern
  const patterns = [
    new RegExp(`field\\.\\w+\\s*\\(\\s*["']${escapeRegExp(fieldName)}["']`, "g"),
    new RegExp(`["']${escapeRegExp(fieldName)}["']`, "g"),
  ];

  const lines = code.split("\n");

  for (const pattern of patterns) {
    for (let i = 0; i < lines.length; i++) {
      const match = pattern.exec(lines[i] ?? "");
      if (match) {
        return { line: i + 1, column: match.index + 1 };
      }
      pattern.lastIndex = 0; // Reset regex
    }
  }

  return undefined;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Executes transpiled JavaScript code and extracts the default export.
 *
 * We create a sandboxed environment that provides the FormSpec DSL functions
 * as if they were imported from "@formspec/dsl".
 */
function executeCode(jsCode: string): unknown {
  // Mock require function that provides FormSpec DSL
  const mockRequire = (moduleName: string): unknown => {
    if (moduleName === "@formspec/dsl" || moduleName === "formspec") {
      return dsl;
    }
    throw new Error(`Module "${moduleName}" is not available in the playground`);
  };

  // Transform ES module imports to require calls
  // This is a simplified transform - handles common patterns
  let transformedCode = jsCode;

  // Handle: import { x, y } from "module"
  transformedCode = transformedCode.replace(
    /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];?/g,
    (_, imports: string, module: string) => {
      const importList = imports.split(",").map((s) => s.trim());
      const assignments = importList
        .map((imp) => {
          const parts = imp.split(/\s+as\s+/).map((s) => s.trim());
          const name = parts[0] ?? "";
          const varName = parts[1] ?? name;
          return `const ${varName} = __require("${module}").${name};`;
        })
        .join("\n");
      return assignments;
    },
  );

  // Handle: import * as x from "module"
  transformedCode = transformedCode.replace(
    /import\s*\*\s*as\s+(\w+)\s+from\s*["']([^"']+)["'];?/g,
    (_, alias: string, module: string) => `const ${alias} = __require("${module}");`,
  );

  // Handle: import x from "module" (default import)
  transformedCode = transformedCode.replace(
    /import\s+(\w+)\s+from\s*["']([^"']+)["'];?/g,
    (_, name: string, module: string) =>
      `const ${name} = __require("${module}").default ?? __require("${module}");`,
  );

  // Handle: export default x
  transformedCode = transformedCode.replace(
    /export\s+default\s+/g,
    "__exports.default = ",
  );

  // Handle: export { x }
  transformedCode = transformedCode.replace(
    /export\s*\{([^}]+)\};?/g,
    (_, exports: string) => {
      const exportList = exports.split(",").map((s) => s.trim());
      return exportList
        .map((exp) => {
          const parts = exp.split(/\s+as\s+/).map((s) => s.trim());
          const name = parts[0] ?? "";
          const exportName = parts[1] ?? name;
          return `__exports.${exportName} = ${name};`;
        })
        .join("\n");
    },
  );

  // Handle: export const x = ...
  transformedCode = transformedCode.replace(
    /export\s+(const|let|var)\s+(\w+)/g,
    (_, keyword: string, name: string) => `${keyword} ${name}; __exports.${name}`,
  );

  // Create the execution context
  const __exports: Record<string, unknown> = {};

  // Create the function with our mock module system
  // Using Function constructor to execute user-provided FormSpec code in a sandboxed context
  const wrappedCode = `
    "use strict";
    return (function(__require, __exports) {
      ${transformedCode}
      return __exports;
    })(__require, __exports);
  `;

  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- Intentional: executing user-provided FormSpec code
  const fn = new Function("__require", "__exports", wrappedCode) as (
    req: typeof mockRequire,
    exp: typeof __exports
  ) => Record<string, unknown>;
  const result = fn(mockRequire, __exports);
  return result.default ?? result;
}
