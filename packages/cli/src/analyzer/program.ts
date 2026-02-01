/**
 * TypeScript program setup for static analysis.
 *
 * Creates a TypeScript program with type checker from a source file,
 * using the project's tsconfig.json for compiler options.
 */

import * as ts from "typescript";
import * as path from "node:path";

/**
 * Result of creating a TypeScript program for analysis.
 */
export interface ProgramContext {
  /** The TypeScript program */
  program: ts.Program;
  /** Type checker for resolving types */
  checker: ts.TypeChecker;
  /** The source file being analyzed */
  sourceFile: ts.SourceFile;
}

/**
 * Creates a TypeScript program for analyzing a source file.
 *
 * Looks for tsconfig.json in the file's directory or parent directories.
 * Falls back to default compiler options if no config is found.
 *
 * @param filePath - Absolute path to the TypeScript source file
 * @returns Program context with checker and source file
 */
export function createProgramContext(filePath: string): ProgramContext {
  const absolutePath = path.resolve(filePath);
  const fileDir = path.dirname(absolutePath);

  // Find tsconfig.json
  const configPath = ts.findConfigFile(fileDir, ts.sys.fileExists, "tsconfig.json");

  let compilerOptions: ts.CompilerOptions;
  let fileNames: string[];

  if (configPath) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      throw new Error(`Error reading tsconfig.json: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n")}`);
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath)
    );

    if (parsed.errors.length > 0) {
      const errorMessages = parsed.errors
        .map(e => ts.flattenDiagnosticMessageText(e.messageText, "\n"))
        .join("\n");
      throw new Error(`Error parsing tsconfig.json: ${errorMessages}`);
    }

    compilerOptions = parsed.options;
    // Include the target file in the program
    fileNames = parsed.fileNames.includes(absolutePath)
      ? parsed.fileNames
      : [...parsed.fileNames, absolutePath];
  } else {
    // Fallback to default options
    compilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      declaration: true,
      experimentalDecorators: true, // Required for legacy TypeScript decorators
    };
    fileNames = [absolutePath];
  }

  const program = ts.createProgram(fileNames, compilerOptions);
  const sourceFile = program.getSourceFile(absolutePath);

  if (!sourceFile) {
    throw new Error(`Could not find source file: ${absolutePath}`);
  }

  return {
    program,
    checker: program.getTypeChecker(),
    sourceFile,
  };
}

/**
 * Finds a class declaration by name in a source file.
 *
 * @param sourceFile - The source file to search
 * @param className - Name of the class to find
 * @returns The class declaration node, or null if not found
 */
export function findClassByName(
  sourceFile: ts.SourceFile,
  className: string
): ts.ClassDeclaration | null {
  let result: ts.ClassDeclaration | null = null;

  function visit(node: ts.Node): void {
    if (result) return;

    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      result = node;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
}
