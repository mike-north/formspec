#!/usr/bin/env node
/**
 * FormSpec CLI - Generate JSON Schema and FormSpec from TypeScript
 *
 * Usage:
 *   formspec analyze <file> [className] [-o <outDir>]
 *
 * Examples:
 *   # Analyze a class with decorators
 *   formspec analyze ./src/forms.ts InstallmentPlan -o ./generated
 *
 *   # Analyze all FormSpec exports in a file (chain DSL)
 *   formspec analyze ./src/forms.ts -o ./generated
 *
 *   # Analyze both classes and FormSpec exports
 *   formspec analyze ./src/forms.ts MyClass -o ./generated
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
 * Parses command line arguments.
 */
function parseArgs(args: string[]): CliOptions {
  const [command, ...rest] = args;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command !== "analyze") {
    console.error(`Unknown command: ${command}`);
    console.error('Use "formspec analyze" to generate schemas');
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
    console.error('Usage: formspec analyze <file> [className] [-o <outDir>]');
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

USAGE:
  formspec analyze <file> [className] [options]

ARGUMENTS:
  <file>        Path to TypeScript source file
  [className]   Optional class name to analyze (if omitted, analyzes FormSpec exports)

OPTIONS:
  -o, --output <dir>    Output directory (default: ./generated)
  -c, --compiled <path> Path to compiled JS file (auto-detected if omitted)
  -h, --help            Show this help message

EXAMPLES:
  # Analyze a class with decorators
  formspec analyze ./src/forms.ts InstallmentPlan -o ./generated

  # Analyze all FormSpec exports (chain DSL)
  formspec analyze ./src/forms.ts -o ./generated

  # Analyze both a class and FormSpec exports
  formspec analyze ./src/forms.ts MyClass -o ./generated

OUTPUT STRUCTURE:
  For a class:
    {outDir}/{className}/
    ├── schema.json           # JSON Schema for class fields
    ├── ux_spec.json          # FormSpec UX spec
    ├── instance_methods/
    │   └── {method}/
    │       ├── params.schema.json
    │       ├── params.ux_spec.json
    │       └── return_type.schema.json
    └── static_methods/
        └── ...

  For FormSpec exports:
    {outDir}/formspecs/
    └── {exportName}/
        ├── schema.json
        └── ux_spec.json
`);
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  console.log(`Analyzing: ${options.filePath}`);
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
    const compiledPath =
      options.compiledPath ?? resolveCompiledPath(options.filePath);

    // Step 3: Load all FormSpec exports from compiled module
    let loadedFormSpecs = new Map();
    try {
      const { formSpecs } = await loadFormSpecs(compiledPath);
      loadedFormSpecs = formSpecs;
      console.log(`✓ Loaded ${formSpecs.size} FormSpec export(s) from module`);
    } catch (error) {
      console.warn(
        `⚠ Could not load compiled module (${compiledPath}):`,
        error instanceof Error ? error.message : error
      );
      console.warn("  Method parameter FormSpecs will use static analysis only");
    }

    // Step 4: If className specified, analyze the class
    if (options.className) {
      const classDecl = findClassByName(ctx.sourceFile, options.className);

      if (!classDecl) {
        console.error(`Error: Class "${options.className}" not found in ${options.filePath}`);
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
        { outDir: options.outDir }
      );

      console.log(`✓ Wrote ${classResult.files.length} file(s) to ${classResult.dir}`);
    }

    // Step 5: Write standalone FormSpec exports (chain DSL)
    if (loadedFormSpecs.size > 0) {
      const formSpecResult = writeFormSpecSchemas(loadedFormSpecs, {
        outDir: options.outDir,
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
