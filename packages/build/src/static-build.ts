import * as ts from "typescript";
import {
  createProgramContext,
  createProgramContextFromProgram,
  type ProgramContext,
} from "./analyzer/program.js";

/**
 * Supported compiler context for static build-time analysis workflows.
 *
 * This context gives consumers access to the TypeScript program, checker, and
 * source file used to discover declarations before invoking FormSpec schema
 * generation helpers.
 *
 * @public
 */
export interface StaticBuildContext {
  /** Host-owned or FormSpec-created TypeScript program. */
  readonly program: ts.Program;
  /** TypeScript checker for symbol and type analysis. */
  readonly checker: ts.TypeChecker;
  /** Source file used as the entry module for export resolution. */
  readonly sourceFile: ts.SourceFile;
}

function toStaticBuildContext(context: ProgramContext): StaticBuildContext {
  return context;
}

/**
 * Creates a supported static build context for a source file.
 *
 * @param filePath - Entry TypeScript source file used for export resolution
 * @returns Reusable build context containing the program, checker, and source file
 *
 * @public
 */
export function createStaticBuildContext(filePath: string): StaticBuildContext {
  return toStaticBuildContext(createProgramContext(filePath));
}

/**
 * Creates a supported static build context from an existing host-owned program.
 *
 * @param program - Existing TypeScript program supplied by the caller
 * @param filePath - Entry TypeScript source file used for export resolution
 * @returns Reusable build context containing the program, checker, and source file
 *
 * @public
 */
export function createStaticBuildContextFromProgram(
  program: ts.Program,
  filePath: string
): StaticBuildContext {
  return toStaticBuildContext(createProgramContextFromProgram(program, filePath));
}

function getModuleSymbol(context: StaticBuildContext): ts.Symbol | undefined {
  const sourceFileWithSymbol = context.sourceFile as ts.SourceFile & { symbol?: ts.Symbol };
  return context.checker.getSymbolAtLocation(context.sourceFile) ?? sourceFileWithSymbol.symbol;
}

function isSchemaSourceDeclaration(
  declaration: ts.Declaration
): declaration is ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration {
  return (
    ts.isClassDeclaration(declaration) ||
    ts.isInterfaceDeclaration(declaration) ||
    ts.isTypeAliasDeclaration(declaration)
  );
}

/**
 * Resolves an export from the context source file, following aliases and re-exports.
 *
 * @param context - Static build context created for the entry source file
 * @param exportName - Export name to resolve. Defaults to `"default"`.
 * @returns Resolved symbol for the export, or `null` when it cannot be found
 *
 * @public
 */
export function resolveModuleExport(
  context: StaticBuildContext,
  exportName = "default"
): ts.Symbol | null {
  const moduleSymbol = getModuleSymbol(context);
  if (moduleSymbol === undefined) {
    return null;
  }

  const exportSymbol =
    context.checker
      .getExportsOfModule(moduleSymbol)
      .find((candidate) => candidate.name === exportName) ?? null;
  if (exportSymbol === null) {
    return null;
  }

  return exportSymbol.flags & ts.SymbolFlags.Alias
    ? context.checker.getAliasedSymbol(exportSymbol)
    : exportSymbol;
}

/**
 * Resolves the declaration behind an export from the context source file,
 * following aliases and re-exports. This helper is intentionally limited to
 * declaration kinds accepted by declaration-driven schema generation.
 *
 * @param context - Static build context created for the entry source file
 * @param exportName - Export name to resolve. Defaults to `"default"`.
 * @returns Resolved class, interface, or type-alias declaration for the export,
 * or `null` when the export does not resolve to one of those schema-source kinds
 *
 * @public
 */
export function resolveModuleExportDeclaration(
  context: StaticBuildContext,
  exportName = "default"
): ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration | null {
  const declaration = resolveModuleExport(context, exportName)?.declarations?.[0] ?? null;
  return declaration !== null && isSchemaSourceDeclaration(declaration) ? declaration : null;
}
