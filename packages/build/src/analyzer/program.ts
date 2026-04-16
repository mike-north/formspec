/**
 * TypeScript program setup for static analysis.
 *
 * Creates a TypeScript program with type checker from a source file,
 * using the project's tsconfig.json for compiler options.
 */

import * as ts from "typescript";
import * as path from "node:path";
import type { FieldNode, Provenance, TypeDefinition, TypeNode } from "@formspec/core/internals";
import type { ConstraintSemanticDiagnostic } from "@formspec/analysis/internal";
import {
  analyzeDeclarationRootInfo,
  analyzeClassToIR,
  createAnalyzerMetadataPolicy,
  getAnalyzableObjectLikePropertyName,
  analyzeInterfaceToIR,
  isResolvableObjectLikeAliasTypeNode,
  analyzeTypeAliasToIR,
  type DeclarationRootInfo,
  type DiscriminatorResolutionOptions,
  type IRClassAnalysis,
  resolveTypeNode,
} from "./class-analyzer.js";
import type { ExtensionRegistry } from "../extensions/index.js";
import type { MetadataPolicyInput } from "@formspec/core";

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

export type AnalyzeNamedTypeToIRDetailedResult =
  | { readonly ok: true; readonly analysis: IRClassAnalysis }
  | {
      readonly ok: false;
      readonly diagnostics: readonly ConstraintSemanticDiagnostic[];
    };

/**
 * Resolves a source file and checker from an existing TypeScript program.
 *
 * @param program - Existing TypeScript program supplied by the host
 * @param filePath - Absolute or relative path to the TypeScript source file
 * @returns Program context with checker and source file
 */
export function createProgramContextFromProgram(
  program: ts.Program,
  filePath: string
): ProgramContext {
  const absolutePath = path.resolve(filePath);
  const sourceFile = program.getSourceFile(absolutePath) ?? program.getSourceFile(filePath);

  if (!sourceFile) {
    throw new Error(`Could not find source file in provided program: ${absolutePath}`);
  }

  return {
    program,
    checker: program.getTypeChecker(),
    sourceFile,
  };
}

/**
 * Creates a TypeScript program for analyzing a source file.
 *
 * Looks for tsconfig.json in the file's directory or parent directories.
 * Falls back to default compiler options if no config is found.
 *
 * @param filePath - Absolute path to the TypeScript source file
 * @param additionalFiles - Optional additional files to include in the program
 *   (e.g., the FormSpec config file for symbol-based custom type detection).
 *   Duplicates are silently removed.
 * @returns Program context with checker and source file
 */
export function createProgramContext(
  filePath: string,
  additionalFiles?: readonly string[]
): ProgramContext {
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
    // Include the target file and any additional files in the program.
    // Use Set to eliminate duplicates.
    const normalizedAdditional = (additionalFiles ?? []).map((f) => path.resolve(f));
    fileNames = [...new Set([...parsed.fileNames, absolutePath, ...normalizedAdditional])];
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
    const normalizedAdditional = (additionalFiles ?? []).map((f) => path.resolve(f));
    fileNames = [...new Set([absolutePath, ...normalizedAdditional])];
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

function getResolvedObjectRootType(
  rootType: TypeNode,
  typeRegistry: Record<string, TypeDefinition>
): Extract<TypeNode, { kind: "object" }> | null {
  if (rootType.kind === "object") {
    return rootType;
  }

  if (rootType.kind !== "reference") {
    return null;
  }

  const definition = typeRegistry[rootType.name];
  return definition?.type.kind === "object" ? definition.type : null;
}

function createResolvedObjectAliasAnalysis(
  name: string,
  rootType: TypeNode,
  typeRegistry: Record<string, TypeDefinition>,
  rootInfo: DeclarationRootInfo,
  diagnostics: readonly ConstraintSemanticDiagnostic[]
): IRClassAnalysis | null {
  const resolvedRootType = getResolvedObjectRootType(rootType, typeRegistry);
  if (resolvedRootType === null) {
    return null;
  }

  const fields: FieldNode[] = resolvedRootType.properties.map((property) => ({
    kind: "field",
    name: property.name,
    ...(property.metadata !== undefined && { metadata: property.metadata }),
    type: property.type,
    required: !property.optional,
    constraints: property.constraints,
    annotations: property.annotations,
    provenance: property.provenance,
  }));

  return {
    name,
    ...(rootInfo.metadata !== undefined && { metadata: rootInfo.metadata }),
    fields,
    fieldLayouts: fields.map(() => ({})),
    typeRegistry,
    ...(rootInfo.annotations.length > 0 && { annotations: [...rootInfo.annotations] }),
    ...(diagnostics.length > 0 && { diagnostics: [...diagnostics] }),
    instanceMethods: [],
    staticMethods: [],
  };
}

function containsTypeReferenceInObjectLikeAlias(typeNode: ts.TypeNode): boolean {
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return containsTypeReferenceInObjectLikeAlias(typeNode.type);
  }

  if (ts.isTypeReferenceNode(typeNode)) {
    return true;
  }

  return (
    ts.isIntersectionTypeNode(typeNode) &&
    typeNode.types.some((member) => containsTypeReferenceInObjectLikeAlias(member))
  );
}

function collectFallbackAliasMemberPropertyNames(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker
): readonly string[] | null {
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return collectFallbackAliasMemberPropertyNames(typeNode.type, checker);
  }

  if (ts.isTypeLiteralNode(typeNode)) {
    const propertyNames: string[] = [];
    for (const member of typeNode.members) {
      if (!ts.isPropertySignature(member)) {
        continue;
      }

      const propertyName = getAnalyzableObjectLikePropertyName(member.name);
      if (propertyName !== null) {
        propertyNames.push(propertyName);
      }
    }

    return propertyNames;
  }

  if (ts.isTypeReferenceNode(typeNode)) {
    return checker
      .getTypeFromTypeNode(typeNode)
      .getProperties()
      .map((property) => property.getName());
  }

  return null;
}

function findFallbackAliasDuplicatePropertyNames(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker
): readonly string[] {
  if (!ts.isIntersectionTypeNode(typeNode)) {
    return [];
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const member of typeNode.types) {
    const propertyNames = collectFallbackAliasMemberPropertyNames(member, checker);
    if (propertyNames === null) {
      continue;
    }

    for (const propertyName of propertyNames) {
      if (seen.has(propertyName)) {
        duplicates.add(propertyName);
      } else {
        seen.add(propertyName);
      }
    }
  }

  return [...duplicates].sort();
}

/**
 * Analyzes a named type (class, interface, or type alias) from a TypeScript
 * source file and returns an `IRClassAnalysis`.
 *
 * Tries each declaration kind in order: class → interface → type alias.
 * Throws if the name is not found or if the type alias analysis fails.
 *
 * @param filePath - Absolute or relative path to the TypeScript source file (resolved internally)
 * @param typeName - Name of the class, interface, or type alias to analyze
 * @param extensionRegistry - Optional extension registry for custom type handling
 * @returns IR analysis result
 */
export function analyzeNamedTypeToIR(
  filePath: string,
  typeName: string,
  extensionRegistry?: ExtensionRegistry,
  metadataPolicy?: MetadataPolicyInput,
  discriminatorOptions?: DiscriminatorResolutionOptions
): IRClassAnalysis {
  const ctx = createProgramContext(filePath);
  return analyzeNamedTypeToIRFromProgramContext(
    ctx,
    filePath,
    typeName,
    extensionRegistry,
    metadataPolicy,
    discriminatorOptions
  );
}

/**
 * Analyzes a named type from an existing program context and returns either an
 * `IRClassAnalysis` or structured diagnostics instead of throwing.
 */
export function analyzeNamedTypeToIRFromProgramContextDetailed(
  ctx: ProgramContext,
  filePath: string,
  typeName: string,
  extensionRegistry?: ExtensionRegistry,
  metadataPolicy?: MetadataPolicyInput,
  discriminatorOptions?: DiscriminatorResolutionOptions
): AnalyzeNamedTypeToIRDetailedResult {
  const analysisFilePath = path.resolve(filePath);

  const classDecl = findClassByName(ctx.sourceFile, typeName);
  if (classDecl !== null) {
    return {
      ok: true,
      analysis: analyzeClassToIR(
        classDecl,
        ctx.checker,
        analysisFilePath,
        extensionRegistry,
        metadataPolicy,
        discriminatorOptions
      ),
    };
  }

  const interfaceDecl = findInterfaceByName(ctx.sourceFile, typeName);
  if (interfaceDecl !== null) {
    return {
      ok: true,
      analysis: analyzeInterfaceToIR(
        interfaceDecl,
        ctx.checker,
        analysisFilePath,
        extensionRegistry,
        metadataPolicy,
        discriminatorOptions
      ),
    };
  }

  const typeAlias = findTypeAliasByName(ctx.sourceFile, typeName);
  if (typeAlias !== null) {
    const result = analyzeTypeAliasToIR(
      typeAlias,
      ctx.checker,
      analysisFilePath,
      extensionRegistry,
      metadataPolicy,
      discriminatorOptions
    );
    if (result.ok) {
      return { ok: true, analysis: result.analysis };
    }

    const fallbackEligible =
      result.kind === "not-object-like" &&
      isResolvableObjectLikeAliasTypeNode(typeAlias.type) &&
      containsTypeReferenceInObjectLikeAlias(typeAlias.type);
    if (!fallbackEligible) {
      return {
        ok: false,
        diagnostics: [
          makeProgramDiagnostic(
            result.kind === "duplicate-properties"
              ? "DUPLICATE_ROOT_PROPERTIES"
              : "UNSUPPORTED_ROOT_TYPE",
            result.error,
            makeNodeProvenance(typeAlias, analysisFilePath)
          ),
        ],
      };
    }

    const duplicatePropertyNames = findFallbackAliasDuplicatePropertyNames(
      typeAlias.type,
      ctx.checker
    );
    if (duplicatePropertyNames.length > 0) {
      const sourceFile = typeAlias.getSourceFile();
      const { line } = sourceFile.getLineAndCharacterOfPosition(typeAlias.getStart());
      return {
        ok: false,
        diagnostics: [
          makeProgramDiagnostic(
            "DUPLICATE_ROOT_PROPERTIES",
            `Type alias "${typeAlias.name.text}" at line ${String(line + 1)} contains duplicate property names across object-like members: ${duplicatePropertyNames.join(", ")}`,
            makeNodeProvenance(typeAlias, analysisFilePath)
          ),
        ],
      };
    }

    const rootInfo = analyzeDeclarationRootInfo(
      typeAlias,
      ctx.checker,
      analysisFilePath,
      extensionRegistry,
      metadataPolicy
    );
    const diagnostics: ConstraintSemanticDiagnostic[] = [...rootInfo.diagnostics];
    const typeRegistry: Record<string, TypeDefinition> = {};
    const rootType = resolveTypeNode(
      ctx.checker.getTypeAtLocation(typeAlias),
      ctx.checker,
      analysisFilePath,
      typeRegistry,
      new Set<ts.Type>(),
      typeAlias,
      createAnalyzerMetadataPolicy(metadataPolicy, discriminatorOptions),
      extensionRegistry,
      diagnostics
    );
    const fallbackAnalysis = createResolvedObjectAliasAnalysis(
      typeAlias.name.text,
      rootType,
      typeRegistry,
      rootInfo,
      diagnostics
    );
    if (fallbackAnalysis !== null) {
      return { ok: true, analysis: fallbackAnalysis };
    }

    return {
      ok: false,
      diagnostics: [
        makeProgramDiagnostic(
          "UNSUPPORTED_ROOT_TYPE",
          result.error,
          makeNodeProvenance(typeAlias, analysisFilePath)
        ),
      ],
    };
  }

  return {
    ok: false,
    diagnostics: [
      makeProgramDiagnostic(
        "TYPE_NOT_FOUND",
        `Type "${typeName}" not found as a class, interface, or type alias in ${analysisFilePath}`,
        makeFileProvenance(analysisFilePath)
      ),
    ],
  };
}

/**
 * Analyzes a named type from an existing program context and returns an `IRClassAnalysis`.
 */
export function analyzeNamedTypeToIRFromProgramContext(
  ctx: ProgramContext,
  filePath: string,
  typeName: string,
  extensionRegistry?: ExtensionRegistry,
  metadataPolicy?: MetadataPolicyInput,
  discriminatorOptions?: DiscriminatorResolutionOptions
): IRClassAnalysis {
  const result = analyzeNamedTypeToIRFromProgramContextDetailed(
    ctx,
    filePath,
    typeName,
    extensionRegistry,
    metadataPolicy,
    discriminatorOptions
  );
  if (result.ok) {
    return result.analysis;
  }

  throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
}

function makeProgramDiagnostic(
  code: string,
  message: string,
  primaryLocation: Provenance
): ConstraintSemanticDiagnostic {
  return {
    code,
    message,
    severity: "error",
    primaryLocation,
    relatedLocations: [],
  };
}

function makeNodeProvenance(node: ts.Node, filePath: string): Provenance {
  const sourceFile = node.getSourceFile();
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return {
    surface: "tsdoc",
    file: filePath,
    line: position.line + 1,
    column: position.character,
    length: node.getWidth(),
  };
}

function makeFileProvenance(filePath: string): Provenance {
  return {
    surface: "tsdoc",
    file: filePath,
    line: 1,
    column: 0,
  };
}
