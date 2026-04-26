import * as path from "node:path";
import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from "@typescript-eslint/utils";
import type { ConstraintSemanticDiagnostic } from "@formspec/analysis/internal";
import {
  analyzeClassToIR,
  analyzeInterfaceToIR,
  analyzeTypeAliasToIR,
} from "@formspec/build/internals";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type SupportedNamedDeclaration =
  | TSESTree.ClassDeclaration
  | TSESTree.TSInterfaceDeclaration
  | TSESTree.TSTypeAliasDeclaration;

type MessageIds = "anonymousRecursiveType";

// Keep the code literal local to avoid widening `@formspec/build/internals`;
// report text comes from the analyzer diagnostic so message wording cannot drift.
const anonymousRecursiveTypeDiagnosticCode = "ANONYMOUS_RECURSIVE_TYPE";

function normalizeComparableFileName(fileName: string): string {
  if (fileName.startsWith("<") && fileName.endsWith(">")) {
    return fileName;
  }
  return path.normalize(path.resolve(fileName));
}

function getCurrentFileNames(
  sourceFileName: string,
  context: Readonly<{ filename: string; physicalFilename?: string }>
): ReadonlySet<string> {
  return new Set(
    [sourceFileName, context.filename, context.physicalFilename]
      .filter((fileName): fileName is string => fileName !== undefined && fileName.length > 0)
      .map(normalizeComparableFileName)
  );
}

type AnalyzerResult = ReturnType<typeof analyzeClassToIR> | ReturnType<typeof analyzeTypeAliasToIR>;

function diagnosticsFromAnalysisResult(
  result: AnalyzerResult
): readonly ConstraintSemanticDiagnostic[] {
  if ("ok" in result) {
    return result.ok ? (result.analysis.diagnostics ?? []) : [];
  }
  return result.diagnostics ?? [];
}

function diagnosticsFromAnalyzerCall(
  analyze: () => AnalyzerResult
): readonly ConstraintSemanticDiagnostic[] {
  try {
    return diagnosticsFromAnalysisResult(analyze());
  } catch {
    return [];
  }
}

/**
 * ESLint rule that surfaces analyzer diagnostics for anonymous recursive
 * object shapes so authors can extract them to named declarations before
 * schema generation.
 *
 * @public
 */
export const noAnonymousRecursiveType = createRule<[], MessageIds>({
  name: "type-compatibility/no-anonymous-recursive-type",
  meta: {
    type: "problem",
    docs: {
      description:
        "Reports anonymous recursive object shapes that must be extracted to a named type",
    },
    schema: [],
    messages: {
      anonymousRecursiveType: "{{message}}",
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    const reportedDiagnostics = new Set<string>();

    function getDiagnosticsForNamedDeclaration(
      node: SupportedNamedDeclaration
    ): readonly ConstraintSemanticDiagnostic[] {
      switch (node.type) {
        case AST_NODE_TYPES.ClassDeclaration: {
          const tsNode = services.esTreeNodeToTSNodeMap.get(node);
          return diagnosticsFromAnalyzerCall(() =>
            analyzeClassToIR(tsNode, checker, tsNode.getSourceFile().fileName)
          );
        }
        case AST_NODE_TYPES.TSInterfaceDeclaration: {
          const tsNode = services.esTreeNodeToTSNodeMap.get(node);
          return diagnosticsFromAnalyzerCall(() =>
            analyzeInterfaceToIR(tsNode, checker, tsNode.getSourceFile().fileName)
          );
        }
        case AST_NODE_TYPES.TSTypeAliasDeclaration: {
          const tsNode = services.esTreeNodeToTSNodeMap.get(node);
          return diagnosticsFromAnalyzerCall(() =>
            analyzeTypeAliasToIR(tsNode, checker, tsNode.getSourceFile().fileName)
          );
        }
      }
    }

    function reportAnonymousRecursiveTypes(node: SupportedNamedDeclaration): void {
      const tsNode = services.esTreeNodeToTSNodeMap.get(node);
      const currentFileNames = getCurrentFileNames(tsNode.getSourceFile().fileName, context);

      for (const diagnostic of getDiagnosticsForNamedDeclaration(node)) {
        if (diagnostic.code !== anonymousRecursiveTypeDiagnosticCode) {
          continue;
        }
        const diagnosticFile = normalizeComparableFileName(diagnostic.primaryLocation.file);
        if (!currentFileNames.has(diagnosticFile)) {
          continue;
        }
        const diagnosticKey = [
          diagnostic.code,
          diagnosticFile,
          diagnostic.primaryLocation.line,
          diagnostic.primaryLocation.column,
        ].join(":");
        if (reportedDiagnostics.has(diagnosticKey)) {
          continue;
        }
        reportedDiagnostics.add(diagnosticKey);

        context.report({
          loc: {
            line: diagnostic.primaryLocation.line,
            column: diagnostic.primaryLocation.column,
          },
          messageId: "anonymousRecursiveType",
          data: {
            message: diagnostic.message,
          },
        });
      }
    }

    return {
      [AST_NODE_TYPES.ClassDeclaration]: reportAnonymousRecursiveTypes,
      [AST_NODE_TYPES.TSInterfaceDeclaration]: reportAnonymousRecursiveTypes,
      [AST_NODE_TYPES.TSTypeAliasDeclaration]: reportAnonymousRecursiveTypes,
    };
  },
});
