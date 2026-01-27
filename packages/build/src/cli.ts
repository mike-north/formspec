#!/usr/bin/env node
/**
 * FormSpec CLI - Generate JSON Schema and UI Schema from form definitions
 *
 * Usage:
 *   formspec-build <input-file> [options]
 *
 * Options:
 *   -o, --out-dir <dir>   Output directory (default: ./generated)
 *   -n, --name <name>     Base name for output files (default: derived from input)
 *   -h, --help            Show help
 *
 * Example:
 *   formspec-build src/forms/product.ts -o ./schemas -n product
 */

import * as path from "node:path";
import { pathToFileURL } from "node:url";

interface CliOptions {
  inputFile: string;
  outDir: string;
  name: string;
}

function printHelp(): void {
  console.log(`
FormSpec Build CLI - Generate JSON Schema and UI Schema

Usage:
  formspec-build <input-file> [options]

Options:
  -o, --out-dir <dir>   Output directory (default: ./generated)
  -n, --name <name>     Base name for output files (default: derived from input)
  -h, --help            Show this help message

Example:
  formspec-build src/forms/product.ts -o ./schemas -n product

The input file should export a FormSpec as its default export or as 'form':
  // product-form.ts
  import { formspec, field } from "formspec";
  export default formspec(field.text("name"));
  // or: export const form = formspec(field.text("name"));
`);
}

function parseArgs(args: string[]): CliOptions | null {
  const positional: string[] = [];
  let outDir = "./generated";
  let name = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;

    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    }

    if (arg === "-o" || arg === "--out-dir") {
      const nextArg = args[i + 1];
      if (!nextArg) {
        console.error("Error: --out-dir requires a value");
        return null;
      }
      outDir = nextArg;
      i++;
      continue;
    }

    if (arg === "-n" || arg === "--name") {
      const nextArg = args[i + 1];
      if (!nextArg) {
        console.error("Error: --name requires a value");
        return null;
      }
      name = nextArg;
      i++;
      continue;
    }

    if (arg.startsWith("-")) {
      console.error(`Error: Unknown option: ${arg}`);
      return null;
    }

    positional.push(arg);
  }

  if (positional.length === 0) {
    console.error("Error: No input file specified");
    printHelp();
    return null;
  }

  const inputFile = positional[0];
  if (!inputFile) {
    console.error("Error: No input file specified");
    return null;
  }

  // Default name from input file
  if (!name) {
    name = path.basename(inputFile, path.extname(inputFile));
  }

  return { inputFile, outDir, name };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (!options) {
    process.exit(1);
  }

  const { inputFile, outDir, name } = options;

  // Resolve input file path
  const absoluteInput = path.resolve(process.cwd(), inputFile);

  try {
    // Dynamically import the input file
    // Use file URL for cross-platform compatibility (Windows paths need file:// URLs)
    const fileUrl = pathToFileURL(absoluteInput).href;
    const module = (await import(fileUrl)) as Record<string, unknown>;

    // Look for the form export
    const form = module["default"] ?? module["form"];

    if (
      !form ||
      typeof form !== "object" ||
      !("elements" in form)
    ) {
      console.error(
        "Error: Input file must export a FormSpec as default export or as 'form'"
      );
      console.error("Example:");
      console.error('  export default formspec(field.text("name"));');
      console.error("  // or");
      console.error('  export const form = formspec(field.text("name"));');
      process.exit(1);
    }

    // Import writeSchemas dynamically to avoid circular deps
    const { writeSchemas } = await import("./index.js");

    const { jsonSchemaPath, uiSchemaPath } = writeSchemas(
      form as Parameters<typeof writeSchemas>[0],
      { outDir, name }
    );

    console.log("Generated:");
    console.log(`  ${jsonSchemaPath}`);
    console.log(`  ${uiSchemaPath}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("Error:", error);
    }
    process.exit(1);
  }
}

void main();
