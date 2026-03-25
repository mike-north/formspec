#!/usr/bin/env node
/**
 * FormSpec CLI - Generate JSON Schema and JSON Forms UI Schema from TypeScript
 *
 * Usage:
 *   formspec generate <file> [className] [-o <outDir>]
 *
 * Examples:
 *   # Generate schemas from a class with JSDoc constraints
 *   formspec generate ./src/forms.ts InstallmentPlan -o ./generated
 *
 *   # Generate schemas from all FormSpec exports in a file (chain DSL)
 *   formspec generate ./src/forms.ts -o ./generated
 *
 *   # Generate schemas from both classes and FormSpec exports
 *   formspec generate ./src/forms.ts MyClass -o ./generated
 */

import {
  createProgramContext,
  findClassByName,
  analyzeClassToIR,
  generateClassSchemas,
  generateMethodSchemas,
  collectFormSpecReferences,
  canonicalizeTSDoc,
  canonicalizeChainDSL,
  validateIR,
} from "@formspec/build/internals";
import type { LoadedFormSpecSchemas, ValidationResult } from "@formspec/build/internals";
import type { FormIR } from "@formspec/core";
import {
  loadFormSpecs,
  loadNamedFormSpecs,
  resolveCompiledPath,
  isFormSpec,
  type FormSpecSchemas,
} from "./runtime/formspec-loader.js";
import { writeClassSchemas, writeFormSpecSchemas } from "./output/writer.js";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * CLI options parsed from arguments.
 */
interface CliOptions {
  command: string;
  filePath: string;
  className: string | undefined;
  outDir: string;
  compiledPath: string | undefined;
  /** Emit FormIR JSON alongside generated schemas. */
  emitIr: boolean;
  /** Run constraint validation only; do not write schema files. */
  validateOnly: boolean;
}

/**
 * Parses command line arguments.
 */
function parseArgs(args: string[]): CliOptions {
  const [command, ...rest] = args;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  // Accept both "generate" (primary) and "analyze" (alias for backwards compatibility)
  if (command !== "generate" && command !== "analyze") {
    console.error(`Unknown command: ${command}`);
    console.error('Use "formspec generate"');
    process.exit(1);
  }

  // Check for --help on subcommand
  if (rest.includes("--help") || rest.includes("-h")) {
    printGenerateHelp();
    process.exit(0);
  }

  let filePath: string | undefined;
  let className: string | undefined;
  let outDir = "./generated";
  let compiledPath: string | undefined;
  let emitIr = false;
  let validateOnly = false;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg) continue;

    if (arg === "-o" || arg === "--output") {
      const nextArg = rest[++i];
      if (nextArg) outDir = nextArg;
    } else if (arg === "--compiled" || arg === "-c") {
      const nextArg = rest[++i];
      if (nextArg) compiledPath = nextArg;
    } else if (arg === "--emit-ir") {
      emitIr = true;
    } else if (arg === "--validate-only") {
      validateOnly = true;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    } else if (!filePath) {
      filePath = arg;
    } else {
      className ??= arg;
    }
  }

  if (!filePath) {
    console.error("Error: No file path provided");
    console.error("Usage: formspec generate <file> [className] [-o <outDir>]");
    process.exit(1);
  }

  return {
    command,
    filePath,
    className,
    outDir,
    compiledPath,
    emitIr,
    validateOnly,
  };
}

/**
 * Prints help message.
 */
function printHelp(): void {
  console.log(`
FormSpec CLI - Generate JSON Schema and JSON Forms UI Schema from TypeScript

USAGE:
  formspec generate <file> [className] [options]

Use 'formspec generate --help' for more information.
`);
}

/**
 * Prints help for the generate command.
 */
function printGenerateHelp(): void {
  console.log(`
formspec generate - Generate JSON Schema and JSON Forms UI Schema files from TypeScript

USAGE:
  formspec generate <file> [className] [options]

ARGUMENTS:
  <file>        Path to TypeScript source file (.ts)
  [className]   Optional class name to analyze

OPTIONS:
  -o, --output <dir>    Output directory (default: ./generated)
  -c, --compiled <path> Path to compiled JS file (auto-detected if omitted)
  --emit-ir             Emit FormIR JSON alongside generated schemas
  --validate-only       Validate constraints only; do not write schema files
  -h, --help            Show this help message

OUTPUT FILES:
  - Class outputs include schema.json and ui_schema.json
  - When available, method parameter UI schemas are written as params.ui_schema.json
  - FormSpec export UI schemas are written as ui_schema.json

EXAMPLES:
  # Generate from a class with JSDoc constraints (static analysis only)
  formspec generate ./src/forms.ts UserForm -o ./generated

  # Generate from FormSpec exports (requires compiled JS)
  # First compile using your build tool (tsc, esbuild, swc, etc.)
  formspec generate ./src/forms.ts -o ./generated

HOW IT WORKS:
  The CLI performs static analysis of TypeScript source files using the
  TypeScript Compiler API. It reads JSDoc metadata and type information
  directly from the AST - no compiled output needed for class analysis.

  For FormSpec chain DSL exports (formspec(...)), the CLI needs to import
  the compiled JavaScript to generate schemas at runtime. Compile your
  TypeScript using your project's build process, or use the --compiled
  flag to specify the JS path explicitly.
`);
}

/**
 * Converts FormSpecSchemas to LoadedFormSpecSchemas for the build package API.
 */
function toLoadedSchemas(
  formSpecs: Map<string, FormSpecSchemas>
): Map<string, LoadedFormSpecSchemas> {
  const result = new Map<string, LoadedFormSpecSchemas>();
  for (const [name, schemas] of formSpecs) {
    result.set(name, {
      name: schemas.name,
      jsonSchema: schemas.jsonSchema,
      uiSchema: schemas.uiSchema,
    });
  }
  return result;
}

/**
 * Writes a FormIR JSON file to the output directory.
 */
function writeIrFile(ir: FormIR, name: string, outDir: string): void {
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, `${name}.ir.json`);
  fs.writeFileSync(filePath, JSON.stringify(ir, null, 2) + "\n");
  console.log(`✓ Wrote IR: ${filePath}`);
}

/**
 * Prints validation results and returns true if any error-severity diagnostics
 * were found (which should cause the CLI to exit non-zero).
 *
 * Warnings are always printed even when `result.valid` is true, since `valid`
 * only reflects the absence of error-severity diagnostics.
 */
function printValidationResult(result: ValidationResult, label: string): boolean {
  const diagnostics = result.diagnostics;

  if (diagnostics.length === 0) {
    console.log(`✓ ${label}: no constraint violations`);
    return false;
  }

  console.warn(`⚠️  ${label}: ${String(diagnostics.length)} diagnostic(s)`);
  for (const diag of diagnostics) {
    const severity = diag.severity === "error" ? "ERROR" : "WARN";
    console.warn(`  [${severity}] ${diag.message}`);
  }
  return diagnostics.some((d) => d.severity === "error");
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  console.log(`Generating schemas from: ${options.filePath}`);
  if (options.className) {
    console.log(`Class: ${options.className}`);
  }
  console.log(`Output: ${options.outDir}`);
  console.log();

  try {
    // Step 1: Static analysis with TypeScript
    const ctx = createProgramContext(options.filePath);
    console.log("✓ Created TypeScript program");

    // Step 2: Resolve compiled JS path for runtime loading
    const compiledPath = options.compiledPath ?? resolveCompiledPath(options.filePath);

    // Step 3: Load all FormSpec exports from compiled module.
    // Retain the raw module reference so Step 5 can access exports by name
    // without a second loadFormSpecs call.
    let loadedFormSpecs = new Map<string, FormSpecSchemas>();
    let rawModuleFromLoad: Record<string, unknown> | undefined;
    let loadError: string | undefined;
    try {
      const { formSpecs, module } = await loadFormSpecs(compiledPath);
      loadedFormSpecs = formSpecs;
      rawModuleFromLoad = module;
      console.log(`✓ Loaded ${String(formSpecs.size)} FormSpec export(s) from module`);
    } catch (error) {
      // Track load errors for better messaging later
      // Runtime loading is only needed for chain DSL exports and method parameters
      if (error instanceof Error && error.message.includes("Cannot find module")) {
        loadError = `Compiled file not found at: ${compiledPath}`;
      }
    }

    // Step 4: If className specified, analyze the class
    if (!options.className && loadedFormSpecs.size === 0) {
      // No class name and no FormSpec exports - provide context-aware error
      console.warn("⚠️  No class name specified and no FormSpec exports found.");
      console.warn();

      if (loadError) {
        // Compiled file doesn't exist - suggest building first
        console.warn("   For chain DSL forms, compile your TypeScript first:");
        console.warn(`     ${loadError}`);
        console.warn();
        console.warn("   Run your build tool (tsc, esbuild, swc, etc.) then try again.");
        console.warn("   Or use -c/--compiled to specify the JS path explicitly:");
        console.warn(
          `     npx formspec generate ${options.filePath} -c ./dist/forms.js -o ${options.outDir}`
        );
      } else {
        // Compiled file exists but no FormSpec exports found
        console.warn("   For classes with JSDoc constraints, specify the class name:");
        console.warn(
          `     npx formspec generate ${options.filePath} <ClassName> -o ${options.outDir}`
        );
        console.warn();
        console.warn("   For chain DSL, export a FormSpec from your file:");
        console.warn("     export const MyForm = formspec(...);");
      }
      console.warn();
      process.exit(1);
    }

    // Track whether any validation found errors (for --validate-only exit code)
    let hasValidationErrors = false;

    if (options.className) {
      const classDecl = findClassByName(ctx.sourceFile, options.className);

      if (!classDecl) {
        console.error(`Error: Class "${options.className}" not found in ${options.filePath}`);
        process.exit(1);
      }

      // Analyze class via IR pipeline
      const analysis = analyzeClassToIR(classDecl, ctx.checker, options.filePath);
      console.log(
        `✓ Analyzed class "${analysis.name}" with ${String(analysis.fields.length)} field(s)`
      );
      console.log(`  Instance methods: ${String(analysis.instanceMethods.length)}`);
      console.log(`  Static methods: ${String(analysis.staticMethods.length)}`);

      // Canonicalize to IR only when needed for --emit-ir or --validate-only.
      // This avoids an unnecessary canonicalization failure blocking normal
      // schema-generation runs.
      if (options.validateOnly || options.emitIr) {
        const ir = canonicalizeTSDoc(analysis, { file: options.filePath });

        const validationResult = validateIR(ir);
        const hadErrors = printValidationResult(validationResult, `Class "${analysis.name}"`);
        if (hadErrors) hasValidationErrors = true;

        if (options.emitIr) {
          writeIrFile(ir, analysis.name, options.outDir);
        }
      }

      if (!options.validateOnly) {
        // Collect FormSpec references from methods
        const allMethods = [...analysis.instanceMethods, ...analysis.staticMethods];
        const formSpecRefs = collectFormSpecReferences(allMethods);

        if (formSpecRefs.size > 0) {
          console.log(`  FormSpec refs: ${Array.from(formSpecRefs).join(", ")}`);

          // Load specific FormSpecs if not already loaded
          const missing = Array.from(formSpecRefs).filter((name) => !loadedFormSpecs.has(name));
          if (missing.length > 0) {
            try {
              const namedFormSpecs = await loadNamedFormSpecs(compiledPath, missing);
              for (const [name, schemas] of namedFormSpecs) {
                loadedFormSpecs.set(name, schemas);
              }
            } catch {
              // Already warned about module loading
            }
          }
        }

        // Generate class schemas
        const classSchemas = generateClassSchemas(analysis, { file: options.filePath });

        // Generate method schemas
        const loadedSchemasMap = toLoadedSchemas(loadedFormSpecs);
        const instanceMethodSchemas = analysis.instanceMethods.map((m) =>
          generateMethodSchemas(m, ctx.checker, loadedSchemasMap)
        );
        const staticMethodSchemas = analysis.staticMethods.map((m) =>
          generateMethodSchemas(m, ctx.checker, loadedSchemasMap)
        );

        // Write class output
        const classResult = writeClassSchemas(
          analysis.name,
          classSchemas,
          instanceMethodSchemas,
          staticMethodSchemas,
          { outDir: options.outDir }
        );

        console.log(`✓ Wrote ${String(classResult.files.length)} file(s) to ${classResult.dir}`);
      }
    }

    // Step 5: Process standalone FormSpec exports (chain DSL)
    if (loadedFormSpecs.size > 0) {
      // Validate and/or emit IR for chain DSL exports.
      // Reuse the module captured in Step 3 to avoid a redundant dynamic import.
      if (options.validateOnly || options.emitIr) {
        if (rawModuleFromLoad !== undefined) {
          for (const [name] of loadedFormSpecs) {
            const rawFormSpec = rawModuleFromLoad[name];
            // Use isFormSpec for a stronger duck-type check than the previous
            // object + "elements" check, and wrap each export individually so
            // one bad export emits a diagnostic instead of aborting the whole run.
            if (!isFormSpec(rawFormSpec)) continue;
            try {
              const chainIr = canonicalizeChainDSL(rawFormSpec as never);

              const validationResult = validateIR(chainIr);
              const hadErrors = printValidationResult(validationResult, `FormSpec "${name}"`);
              if (hadErrors) hasValidationErrors = true;

              if (options.emitIr) {
                writeIrFile(chainIr, name, options.outDir);
              }
            } catch (error) {
              console.warn(
                `⚠️  FormSpec "${name}": canonicalization failed — ${error instanceof Error ? error.message : String(error)}`
              );
              hasValidationErrors = true;
            }
          }
        }
      }

      if (!options.validateOnly) {
        const formSpecResult = writeFormSpecSchemas(loadedFormSpecs, {
          outDir: options.outDir,
        });

        if (formSpecResult.files.length > 0) {
          console.log(
            `✓ Wrote ${String(formSpecResult.files.length)} FormSpec file(s) to ${formSpecResult.dir}`
          );
        }
      }
    }

    console.log();

    if (options.validateOnly) {
      if (hasValidationErrors) {
        console.log("Validation failed: constraint violations found.");
        process.exit(1);
      } else {
        console.log("Validation passed: no constraint violations.");
      }
    } else {
      console.log("Done!");
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run CLI
void main();
