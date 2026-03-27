/**
 * TypeScript program setup for static analysis.
 *
 * Creates a TypeScript program with type checker from a source file,
 * using the project's tsconfig.json for compiler options.
 */

import * as ts from "typescript";
import * as path from "node:path";
import {
  analyzeClassToIR,
  analyzeInterfaceToIR,
  analyzeTypeAliasToIR,
  type IRClassAnalysis,
} from "./class-analyzer.js";
import type { ExtensionRegistry } from "../extensions/index.js";

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

  // Find tsconfig.json - using ts.sys.fileExists which has `this: void` requirement
  const configPath = ts.findConfigFile(fileDir, ts.sys.fileExists.bind(ts.sys), "tsconfig.json");

  let compilerOptions: ts.CompilerOptions;
  let fileNames: string[];

  if (configPath) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile.bind(ts.sys));
    if (configFile.error) {
      throw new Error(
        `Error reading tsconfig.json: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n")}`
      );
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath)
    );

    if (parsed.errors.length > 0) {
      const errorMessages = parsed.errors
        .map((e) => ts.flattenDiagnosticMessageText(e.messageText, "\n"))
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
      skipLibCheck: true,
      declaration: true,
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
 * Generic AST node finder by name. Walks the source file tree and returns
 * the first node matching the predicate with the given name.
 */
function findNodeByName<T extends ts.Node>(
  sourceFile: ts.SourceFile,
  name: string,
  predicate: (node: ts.Node) => node is T,
  getName: (node: T) => string | undefined
): T | null {
  let result: T | null = null;

  function visit(node: ts.Node): void {
    if (result) return;

    if (predicate(node) && getName(node) === name) {
      result = node;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
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
  return findNodeByName(sourceFile, className, ts.isClassDeclaration, (n) => n.name?.text);
}

/**
 * Finds an interface declaration by name in a source file.
 *
 * @param sourceFile - The source file to search
 * @param interfaceName - Name of the interface to find
 * @returns The interface declaration node, or null if not found
 */
export function findInterfaceByName(
  sourceFile: ts.SourceFile,
  interfaceName: string
): ts.InterfaceDeclaration | null {
  return findNodeByName(sourceFile, interfaceName, ts.isInterfaceDeclaration, (n) => n.name.text);
}

/**
 * Finds a type alias declaration by name in a source file.
 *
 * @param sourceFile - The source file to search
 * @param aliasName - Name of the type alias to find
 * @returns The type alias declaration node, or null if not found
 */
export function findTypeAliasByName(
  sourceFile: ts.SourceFile,
  aliasName: string
): ts.TypeAliasDeclaration | null {
  return findNodeByName(sourceFile, aliasName, ts.isTypeAliasDeclaration, (n) => n.name.text);
}

/**
 * Analyzes a named type (class, interface, or type alias) from a TypeScript
 * source file and returns an `IRClassAnalysis`.
 *
 * Tries each declaration kind in order: class → interface → type alias.
 * Throws if the name is not found or if the type alias analysis fails.
 *
 * @param filePath - Absolute path to the TypeScript source file
 * @param typeName - Name of the class, interface, or type alias to analyze
 * @param extensionRegistry - Optional extension registry for custom type handling
 * @returns IR analysis result
 */
export function analyzeNamedTypeToIR(
  filePath: string,
  typeName: string,
  extensionRegistry?: ExtensionRegistry
): IRClassAnalysis {
  const ctx = createProgramContext(filePath);

  const classDecl = findClassByName(ctx.sourceFile, typeName);
  if (classDecl !== null) {
    return analyzeClassToIR(classDecl, ctx.checker, filePath, extensionRegistry);
  }

  const interfaceDecl = findInterfaceByName(ctx.sourceFile, typeName);
  if (interfaceDecl !== null) {
    return analyzeInterfaceToIR(interfaceDecl, ctx.checker, filePath, extensionRegistry);
  }

  const typeAlias = findTypeAliasByName(ctx.sourceFile, typeName);
  if (typeAlias !== null) {
    const result = analyzeTypeAliasToIR(typeAlias, ctx.checker, filePath, extensionRegistry);
    if (result.ok) {
      return result.analysis;
    }
    throw new Error(result.error);
  }

  throw new Error(
    `Type "${typeName}" not found as a class, interface, or type alias in ${filePath}`
  );
}
