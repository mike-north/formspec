#!/usr/bin/env node
/**
 * FormSpec CLI - Generate JSON Schema and FormSpec from TypeScript
 *
 * Usage:
 *   formspec generate <file> [className] [-o <outDir>]
 *
 * Examples:
 *   # Generate schemas from a class with decorators
 *   formspec generate ./src/forms.ts InstallmentPlan -o ./generated
 *
 *   # Generate schemas from all FormSpec exports in a file (chain DSL)
 *   formspec generate ./src/forms.ts -o ./generated
 *
 *   # Generate schemas from both classes and FormSpec exports
 *   formspec generate ./src/forms.ts MyClass -o ./generated
 */

import { createProgramContext, findClassByName } from "./analyzer/program.js";
import { analyzeClass } from "./analyzer/class-analyzer.js";
import { generateClassSchemas } from "./generators/class-schema.js";
import {
  generateMethodSchemas,
  collectFormSpecReferences,
} from "./generators/method-schema.js";
import {
  loadFormSpecs,
  loadNamedFormSpecs,
  resolveCompiledPath,
} from "./runtime/formspec-loader.js";
import {
  writeClassSchemas,
  writeFormSpecSchemas,
} from "./output/writer.js";
import { runCodegen } from "./codegen/index.js";

/**
 * CLI options parsed from arguments.
 */
interface CliOptions {
  command: string;
  filePath: string;
  className: string | undefined;
  outDir: string;
  compiledPath: string | undefined;
}

/**
 * Codegen-specific CLI options.
 */
interface CodegenCliOptions {
  command: "codegen";
  files: string[];
  output: string;
}

/**
 * Parses codegen command arguments.
 */
function parseCodegenArgs(args: string[]): CodegenCliOptions {
  const files: string[] = [];
  let output = "./__formspec_types__.ts";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "-o" || arg === "--output") {
      const nextArg = args[++i];
      if (nextArg) output = nextArg;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    } else {
      files.push(arg);
    }
  }

  if (files.length === 0) {
    console.error("Error: No source files provided");
    console.error("Usage: formspec codegen <files...> [-o <output>]");
    process.exit(1);
  }

  return { command: "codegen", files, output };
}

/**
 * Parses command line arguments.
 */
function parseArgs(args: string[]): CliOptions | CodegenCliOptions {
  const [command, ...rest] = args;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  // Handle codegen command
  if (command === "codegen") {
    return parseCodegenArgs(rest);
  }

  // Accept both "generate" (primary) and "analyze" (alias for backwards compatibility)
  if (command !== "generate" && command !== "analyze") {
    console.error(`Unknown command: ${command}`);
    console.error('Use "formspec generate" or "formspec codegen"');
    process.exit(1);
  }

  let filePath: string | undefined;
  let className: string | undefined;
  let outDir = "./generated";
  let compiledPath: string | undefined;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg) continue;

    if (arg === "-o" || arg === "--output") {
      const nextArg = rest[++i];
      if (nextArg) outDir = nextArg;
    } else if (arg === "--compiled" || arg === "-c") {
      const nextArg = rest[++i];
      if (nextArg) compiledPath = nextArg;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    } else if (!filePath) {
      filePath = arg;
    } else if (!className) {
      className = arg;
    }
  }

  if (!filePath) {
    console.error("Error: No file path provided");
    console.error('Usage: formspec generate <file> [className] [-o <outDir>]');
    process.exit(1);
  }

  return {
    command,
    filePath,
    className,
    outDir,
    compiledPath,
  };
}

/**
 * Prints help message.
 */
function printHelp(): void {
  console.log(`
FormSpec CLI - Generate JSON Schema and FormSpec from TypeScript

COMMANDS:
  generate    Generate JSON Schema and UI Schema files from TypeScript
  codegen     Generate type metadata file for runtime schema generation

USAGE:
  formspec generate <file> [className] [options]
  formspec codegen <files...> [-o <output>]

GENERATE COMMAND:
  Arguments:
    <file>        Path to TypeScript source file
    [className]   Optional class name (if omitted, generates from FormSpec exports only)

  Options:
    -o, --output <dir>    Output directory (default: ./generated)
    -c, --compiled <path> Path to compiled JS file (auto-detected if omitted)

  Examples:
    formspec generate ./src/forms.ts InstallmentPlan -o ./generated
    formspec generate ./src/forms.ts -o ./generated

CODEGEN COMMAND:
  Generate a TypeScript file that patches decorated classes with type metadata.
  This enables runtime schema generation without needing a TypeScript transformer.

  Arguments:
    <files...>    TypeScript source files to analyze

  Options:
    -o, --output <file>   Output file (default: ./__formspec_types__.ts)

  Examples:
    formspec codegen ./src/forms.ts -o ./src/__formspec_types__.ts
    formspec codegen ./src/**/*.ts -o ./src/__formspec_types__.ts

  Usage in code:
    // Import once at application entry point
    import './__formspec_types__';

    // Then use toFormSpec() normally
    import { UserForm } from './forms';
    import { toFormSpec } from '@formspec/decorators';
    const spec = toFormSpec(UserForm);

ALIASES:
  formspec analyze      Same as 'generate' (for backwards compatibility)
`);
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Handle codegen command
  if (options.command === "codegen") {
    const codegenOptions = options as CodegenCliOptions;
    runCodegen({
      files: codegenOptions.files,
      output: codegenOptions.output,
    });
    return;
  }

  // Handle generate command
  const generateOptions = options as CliOptions;
  console.log(`Generating schemas from: ${generateOptions.filePath}`);
  if (generateOptions.className) {
    console.log(`Class: ${generateOptions.className}`);
  }
  console.log(`Output: ${generateOptions.outDir}`);
  console.log();

  try {
    // Step 1: Static analysis with TypeScript
    const ctx = createProgramContext(generateOptions.filePath);
    console.log("✓ Created TypeScript program");

    // Step 2: Resolve compiled JS path for runtime loading
    const compiledPath =
      generateOptions.compiledPath ?? resolveCompiledPath(generateOptions.filePath);

    // Step 3: Load all FormSpec exports from compiled module
    let loadedFormSpecs = new Map();
    try {
      const { formSpecs } = await loadFormSpecs(compiledPath);
      loadedFormSpecs = formSpecs;
      console.log(`✓ Loaded ${formSpecs.size} FormSpec export(s) from module`);
    } catch {
      // This is not an error - runtime loading is only needed for:
      // 1. Chain DSL FormSpec exports (formspec(...))
      // 2. Method parameters using InferSchema<typeof X>
      // Static class analysis works without compiled output
    }

    // Step 4: If className specified, analyze the class
    if (!generateOptions.className && loadedFormSpecs.size === 0) {
      // No class name and no FormSpec exports - warn the user
      console.warn("⚠️  No class name specified and no FormSpec exports found.");
      console.warn("   For decorated classes, specify the class name:");
      console.warn(`     formspec generate ${generateOptions.filePath} <ClassName> -o ${generateOptions.outDir}`);
      console.warn("   For chain DSL, export a FormSpec from your file:");
      console.warn("     export const MyForm = formspec(...);");
      console.warn();
      process.exit(1);
    }

    if (generateOptions.className) {
      const classDecl = findClassByName(ctx.sourceFile, generateOptions.className);

      if (!classDecl) {
        console.error(`Error: Class "${generateOptions.className}" not found in ${generateOptions.filePath}`);
        process.exit(1);
      }

      // Analyze class
      const analysis = analyzeClass(classDecl, ctx.checker);
      console.log(`✓ Analyzed class "${analysis.name}" with ${analysis.fields.length} field(s)`);
      console.log(`  Instance methods: ${analysis.instanceMethods.length}`);
      console.log(`  Static methods: ${analysis.staticMethods.length}`);

      // Collect FormSpec references from methods
      const allMethods = [...analysis.instanceMethods, ...analysis.staticMethods];
      const formSpecRefs = collectFormSpecReferences(allMethods);

      if (formSpecRefs.size > 0) {
        console.log(`  FormSpec refs: ${Array.from(formSpecRefs).join(", ")}`);

        // Load specific FormSpecs if not already loaded
        const missing = Array.from(formSpecRefs).filter(
          (name) => !loadedFormSpecs.has(name)
        );
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
      const classSchemas = generateClassSchemas(analysis, ctx.checker);

      // Generate method schemas
      const instanceMethodSchemas = analysis.instanceMethods.map((m) =>
        generateMethodSchemas(m, ctx.checker, loadedFormSpecs)
      );
      const staticMethodSchemas = analysis.staticMethods.map((m) =>
        generateMethodSchemas(m, ctx.checker, loadedFormSpecs)
      );

      // Write class output
      const classResult = writeClassSchemas(
        analysis.name,
        classSchemas,
        instanceMethodSchemas,
        staticMethodSchemas,
        { outDir: generateOptions.outDir }
      );

      console.log(`✓ Wrote ${classResult.files.length} file(s) to ${classResult.dir}`);
    }

    // Step 5: Write standalone FormSpec exports (chain DSL)
    if (loadedFormSpecs.size > 0) {
      const formSpecResult = writeFormSpecSchemas(loadedFormSpecs, {
        outDir: generateOptions.outDir,
      });

      if (formSpecResult.files.length > 0) {
        console.log(
          `✓ Wrote ${formSpecResult.files.length} FormSpec file(s) to ${formSpecResult.dir}`
        );
      }
    }

    console.log();
    console.log("Done!");
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run CLI
main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
