import * as ts from "typescript";
import {
  checkSyntheticTagApplications,
  lowerTagApplicationToSyntheticCall,
} from "./compiler-signatures.js";
import { parseCommentBlock, type CommentSpan } from "./comment-syntax.js";
import {
  getCommentTagSemanticContext,
  type CommentSemanticContextOptions,
} from "./cursor-context.js";
import { extractPathTarget } from "./path-target.js";
import { getHostType, getLastLeadingDocCommentRange, getSubjectType } from "./source-bindings.js";
import {
  computeFormSpecTextHash,
  serializeParsedCommentTag,
  type FormSpecAnalysisCommentSnapshot,
  type FormSpecAnalysisDiagnostic,
  type FormSpecAnalysisFileSnapshot,
} from "./semantic-protocol.js";
import {
  getFormSpecPerformanceNow,
  optionalMeasure,
  type FormSpecPerformanceRecorder,
} from "./perf-tracing.js";
import { resolveDeclarationPlacement, resolvePathTargetType } from "./ts-binding.js";
import type { ExtensionTagSource, FormSpecPlacement } from "./tag-registry.js";

/**
 * Options used when building a serializable, editor-oriented snapshot for a
 * TypeScript source file.
 */
export interface BuildFormSpecAnalysisFileSnapshotOptions {
  readonly checker: ts.TypeChecker;
  readonly extensions?: readonly ExtensionTagSource[];
  readonly now?: () => Date;
  readonly performance?: FormSpecPerformanceRecorder;
}

const SYNTHETIC_TYPE_NODE_BUILDER_FLAGS =
  ts.NodeBuilderFlags.NoTruncation |
  ts.NodeBuilderFlags.UseStructuralFallback |
  ts.NodeBuilderFlags.IgnoreErrors |
  ts.NodeBuilderFlags.InTypeAlias;

const SYNTHETIC_TYPE_PRINT_SOURCE_FILE = ts.createSourceFile(
  "/virtual/formspec-standalone-type.ts",
  "",
  ts.ScriptTarget.ES2022,
  false,
  ts.ScriptKind.TS
);

const SYNTHETIC_TYPE_PRINTER = ts.createPrinter({ removeComments: true });
function spanFromPos(start: number, end: number): CommentSpan {
  return { start, end };
}

function typeToString(type: ts.Type | undefined, checker: ts.TypeChecker): string | null {
  if (type === undefined) {
    return null;
  }

  return checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
}

function supportingDeclarationsForType(type: ts.Type | undefined): readonly string[] {
  if (type === undefined) {
    return [];
  }

  const symbol = type.aliasSymbol ?? type.getSymbol();
  const declarations = symbol?.declarations ?? [];
  return declarations
    .map((declaration) =>
      declaration.getSourceFile().text.slice(declaration.getFullStart(), declaration.getEnd())
    )
    .filter((declarationText) => declarationText.trim().length > 0);
}

function renderStandaloneTypeSyntax(
  type: ts.Type | undefined,
  checker: ts.TypeChecker
): string | null {
  if (type === undefined) {
    return null;
  }

  const typeNode = checker.typeToTypeNode(type, undefined, SYNTHETIC_TYPE_NODE_BUILDER_FLAGS);
  if (typeNode === undefined) {
    return null;
  }

  const rendered = SYNTHETIC_TYPE_PRINTER.printNode(
    ts.EmitHint.Unspecified,
    typeNode,
    SYNTHETIC_TYPE_PRINT_SOURCE_FILE
  ).trim();
  return rendered === "" ? null : rendered;
}

function requiresSupportingDeclarationsForStandaloneTypeSyntax(typeText: string | null): boolean {
  if (typeText === null) {
    return true;
  }

  const sourceFile = ts.createSourceFile(
    "/virtual/formspec-standalone-type-analysis.ts",
    `type __FormSpecStandalone = ${typeText};`,
    ts.ScriptTarget.ES2022,
    false,
    ts.ScriptKind.TS
  );
  const statement = sourceFile.statements[0];
  if (statement === undefined || !ts.isTypeAliasDeclaration(statement)) {
    return true;
  }

  let requiresDeclarations = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isTypeReferenceNode(node) ||
      ts.isExpressionWithTypeArguments(node) ||
      ts.isImportTypeNode(node) ||
      ts.isTypeQueryNode(node)
    ) {
      requiresDeclarations = true;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(statement.type);
  return requiresDeclarations;
}

function dedupeSupportingDeclarations(declarations: readonly string[]): readonly string[] {
  return [...new Set(declarations)];
}

function getSyntheticTargetForTag(tag: ReturnType<typeof parseCommentBlock>["tags"][number]) {
  if (tag.target === null) {
    return null;
  }

  switch (tag.target.kind) {
    case "path":
    case "member":
    case "variant":
      return {
        kind: tag.target.kind,
        text: tag.target.rawText,
      } as const;
    case "ambiguous":
      return {
        kind: "path" as const,
        text: tag.target.rawText,
      };
    default: {
      const exhaustive: never = tag.target.kind;
      return exhaustive;
    }
  }
}

function getDeclaredSubjectType(
  node: ts.Node,
  checker: ts.TypeChecker,
  subjectType: ts.Type
): ts.Type {
  if (
    (ts.isPropertyDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isParameter(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isTypeAliasDeclaration(node)) &&
    node.type !== undefined
  ) {
    return checker.getTypeFromTypeNode(node.type);
  }

  return subjectType;
}

function getArgumentExpression(
  argumentText: string,
  valueLabels: readonly string[],
  capabilityTargets: readonly string[]
): string | null {
  const trimmed = argumentText.trim();
  if (trimmed === "") {
    return null;
  }

  if (valueLabels.some((label) => label.includes("number") || label.includes("integer"))) {
    return trimmed;
  }
  if (valueLabels.some((label) => label.includes("boolean"))) {
    return trimmed === "true" || trimmed === "false" ? trimmed : null;
  }
  if (valueLabels.some((label) => label.includes("json"))) {
    try {
      return JSON.stringify(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  if (valueLabels.some((label) => label.includes("condition"))) {
    return "undefined as unknown as FormSpecCondition";
  }
  if (capabilityTargets.length > 0 || valueLabels.some((label) => label.includes("string"))) {
    return JSON.stringify(trimmed);
  }

  return JSON.stringify(trimmed);
}

function diagnosticSeverity(code: string): FormSpecAnalysisDiagnostic["severity"] {
  switch (code) {
    case "INVALID_TAG_ARGUMENT":
    case "INVALID_TAG_PLACEMENT":
    case "TYPE_MISMATCH":
    case "UNKNOWN_PATH_TARGET":
      return "error";
    default:
      return "warning";
  }
}

function diagnosticCategory(code: string): FormSpecAnalysisDiagnostic["category"] {
  switch (code) {
    case "INVALID_TAG_ARGUMENT":
      return "value-parsing";
    case "INVALID_TAG_PLACEMENT":
      return "tag-recognition";
    case "TYPE_MISMATCH":
      return "type-compatibility";
    case "UNKNOWN_PATH_TARGET":
      return "target-resolution";
    case "MISSING_SOURCE_FILE":
      return "infrastructure";
    default:
      return "constraint-validation";
  }
}

function createAnalysisDiagnostic(
  code: string,
  message: string,
  range: CommentSpan,
  data: FormSpecAnalysisDiagnostic["data"],
  // Related locations are reserved for cross-source diagnostics once the
  // snapshot builder starts threading multi-location provenance through the
  // transport surface.
  relatedLocations: readonly FormSpecAnalysisDiagnostic["relatedLocations"][number][] = []
): FormSpecAnalysisDiagnostic {
  return {
    code,
    category: diagnosticCategory(code),
    message,
    range,
    severity: diagnosticSeverity(code),
    relatedLocations,
    data,
  };
}

function buildTagDiagnostics(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  placement: FormSpecPlacement | null,
  hostType: ts.Type | undefined,
  subjectType: ts.Type | undefined,
  commentTags: ReturnType<typeof parseCommentBlock>["tags"],
  semanticOptions: CommentSemanticContextOptions,
  performance: FormSpecPerformanceRecorder | undefined
): FormSpecAnalysisDiagnostic[] {
  if (placement === null || subjectType === undefined) {
    return [];
  }

  const declaredSubjectType = getDeclaredSubjectType(node, checker, subjectType);
  const diagnostics: FormSpecAnalysisDiagnostic[] = [];
  const standaloneHostTypeText = optionalMeasure(
    performance,
    "analysis.renderStandaloneHostType",
    undefined,
    () => renderStandaloneTypeSyntax(hostType, checker)
  );
  const standaloneSubjectTypeText = optionalMeasure(
    performance,
    "analysis.renderStandaloneSubjectType",
    undefined,
    () => renderStandaloneTypeSyntax(subjectType, checker)
  );
  const hostTypeNeedsDeclarations =
    requiresSupportingDeclarationsForStandaloneTypeSyntax(standaloneHostTypeText);
  const subjectTypeNeedsDeclarations =
    requiresSupportingDeclarationsForStandaloneTypeSyntax(standaloneSubjectTypeText);
  const hostTypeText = standaloneHostTypeText ?? typeToString(hostType, checker) ?? "unknown";
  const subjectTypeText =
    standaloneSubjectTypeText ?? typeToString(subjectType, checker) ?? "unknown";
  const supportingDeclarations = dedupeSupportingDeclarations([
    ...(hostTypeNeedsDeclarations ? supportingDeclarationsForType(hostType) : []),
    ...(subjectTypeNeedsDeclarations ? supportingDeclarationsForType(subjectType) : []),
  ]);
  const syntheticApplications: {
    readonly tag: (typeof commentTags)[number];
    readonly target: ReturnType<typeof getSyntheticTargetForTag>;
    readonly pathTargetResolution: ReturnType<typeof resolvePathTargetType> | null;
    readonly options: {
      readonly tagName: string;
      readonly placement: FormSpecPlacement;
      readonly hostType: string;
      readonly subjectType: string;
      readonly supportingDeclarations: readonly string[];
      readonly target?: ReturnType<typeof getSyntheticTargetForTag>;
      readonly argumentExpression?: string;
      readonly extensions?: readonly ExtensionTagSource[];
    };
  }[] = [];

  for (const tag of commentTags) {
    const semantic = getCommentTagSemanticContext(tag, semanticOptions);
    if (semantic.tagDefinition === null) {
      continue;
    }

    const target = getSyntheticTargetForTag(tag);
    const pathTargetResolution =
      tag.target?.kind === "path" || tag.target?.kind === "ambiguous"
        ? tag.target.path === null
          ? null
          : resolvePathTargetType(declaredSubjectType, checker, tag.target.path.segments)
        : null;
    const argumentExpression = getArgumentExpression(
      tag.argumentText,
      semantic.valueLabels,
      semantic.compatiblePathTargets
    );

    try {
      const syntheticOptions = {
        tagName: tag.normalizedTagName,
        placement,
        hostType: hostTypeText,
        subjectType: subjectTypeText,
        supportingDeclarations,
        ...(target === null ? {} : { target }),
        ...(argumentExpression === null ? {} : { argumentExpression }),
        ...(semanticOptions.extensions === undefined
          ? {}
          : { extensions: semanticOptions.extensions }),
      } as const;
      lowerTagApplicationToSyntheticCall(syntheticOptions);
      syntheticApplications.push({
        tag,
        target,
        pathTargetResolution,
        options: syntheticOptions,
      });
    } catch (error) {
      diagnostics.push(
        createAnalysisDiagnostic(
          "INVALID_TAG_PLACEMENT",
          error instanceof Error ? error.message : String(error),
          tag.fullSpan,
          {
            tagName: tag.normalizedTagName,
            placement,
            ...(target === null ? {} : { targetKind: target.kind, targetText: target.text }),
          }
        )
      );
    }
  }

  const batchResults = optionalMeasure(
    performance,
    "analysis.syntheticCheckBatch",
    {
      tagCount: syntheticApplications.length,
    },
    () =>
      checkSyntheticTagApplications({
        applications: syntheticApplications.map((application) => application.options),
        ...(performance === undefined ? {} : { performance }),
      })
  );

  for (const [index, result] of batchResults.entries()) {
    const application = syntheticApplications[index];
    if (application === undefined) {
      continue;
    }

    for (const diagnostic of result.diagnostics) {
      const code =
        application.target !== null && diagnostic.message.includes("not assignable")
          ? application.target.kind === "path" &&
            application.pathTargetResolution?.kind === "missing-property"
            ? "UNKNOWN_PATH_TARGET"
            : "TYPE_MISMATCH"
          : diagnostic.message.includes("Expected")
            ? "INVALID_TAG_ARGUMENT"
            : diagnostic.message.includes("No overload")
              ? "INVALID_TAG_PLACEMENT"
              : "TYPE_MISMATCH";
      diagnostics.push(
        createAnalysisDiagnostic(code, diagnostic.message, application.tag.fullSpan, {
          tagName: application.tag.normalizedTagName,
          placement,
          typescriptDiagnosticCode: diagnostic.code,
          ...(application.target === null
            ? {}
            : {
                targetKind: application.target.kind,
                targetText: application.target.text,
              }),
          ...(application.pathTargetResolution?.kind === "missing-property"
            ? { missingPathSegment: application.pathTargetResolution.segment }
            : {}),
        })
      );
    }
  }

  return diagnostics;
}

function deserializeSnapshotTagsForDiagnostics(
  snapshot: FormSpecAnalysisCommentSnapshot
): ReturnType<typeof parseCommentBlock>["tags"] {
  return snapshot.tags.map((tag) => ({
    rawTagName: tag.rawTagName,
    normalizedTagName: tag.normalizedTagName,
    recognized: tag.recognized,
    fullSpan: tag.fullSpan,
    tagNameSpan: tag.tagNameSpan,
    payloadSpan: tag.payloadSpan,
    colonSpan: tag.target?.colonSpan ?? null,
    target:
      tag.target === null
        ? null
        : {
            rawText: tag.target.rawText,
            valid: tag.target.valid,
            kind: tag.target.kind,
            fullSpan: tag.target.fullSpan,
            colonSpan: tag.target.colonSpan,
            span: tag.target.span,
            path: extractPathTarget(`:${tag.target.rawText}`)?.path ?? null,
          },
    argumentSpan: tag.argumentSpan,
    argumentText: tag.argumentText,
  }));
}

function buildCommentSnapshot(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  extensions: readonly ExtensionTagSource[] | undefined,
  performance: FormSpecPerformanceRecorder | undefined
): FormSpecAnalysisCommentSnapshot | null {
  return optionalMeasure(
    performance,
    "analysis.buildCommentSnapshot",
    {
      nodeKind: ts.SyntaxKind[node.kind],
    },
    () => {
      const docComment = getLastLeadingDocCommentRange(node, sourceFile);
      if (docComment === null) {
        return null;
      }

      const commentText = sourceFile.text.slice(docComment.pos, docComment.end);
      const parsed = parseCommentBlock(commentText, {
        offset: docComment.pos,
        ...(extensions === undefined ? {} : { extensions }),
      });
      if (parsed.tags.length === 0) {
        return null;
      }

      const placement = resolveDeclarationPlacement(node);
      const subjectType = getSubjectType(node, checker);
      const hostType = getHostType(node, checker);
      const semanticOptions: CommentSemanticContextOptions = {
        checker,
        ...(subjectType === undefined ? {} : { subjectType }),
        ...(placement === null ? {} : { placement }),
        ...(extensions === undefined ? {} : { extensions }),
      };

      const tags = parsed.tags.map((tag) =>
        serializeParsedCommentTag(tag, getCommentTagSemanticContext(tag, semanticOptions))
      );

      return {
        commentSpan: spanFromPos(docComment.pos, docComment.end),
        declarationSpan: spanFromPos(node.getStart(sourceFile), node.getEnd()),
        placement,
        subjectType: typeToString(subjectType, checker),
        hostType: typeToString(hostType, checker),
        tags,
      };
    }
  );
}

/**
 * Builds a transport-safe snapshot of every FormSpec-bearing doc comment in a
 * source file, including semantic hover/completion context and file-local
 * diagnostics.
 */
export function buildFormSpecAnalysisFileSnapshot(
  sourceFile: ts.SourceFile,
  options: BuildFormSpecAnalysisFileSnapshotOptions
): FormSpecAnalysisFileSnapshot {
  const startedAt = getFormSpecPerformanceNow();
  const comments: FormSpecAnalysisCommentSnapshot[] = [];
  const diagnostics: FormSpecAnalysisDiagnostic[] = [];

  const visit = (node: ts.Node): void => {
    const placement = resolveDeclarationPlacement(node);
    if (placement !== null) {
      const snapshot = buildCommentSnapshot(
        node,
        sourceFile,
        options.checker,
        options.extensions,
        options.performance
      );
      if (snapshot !== null) {
        comments.push(snapshot);

        const subjectType = getSubjectType(node, options.checker);
        const hostType = getHostType(node, options.checker);
        diagnostics.push(
          ...optionalMeasure(
            options.performance,
            "analysis.buildTagDiagnostics",
            {
              placement,
              tagCount: snapshot.tags.length,
            },
            () =>
              buildTagDiagnostics(
                node,
                sourceFile,
                options.checker,
                placement,
                hostType,
                subjectType,
                deserializeSnapshotTagsForDiagnostics(snapshot),
                {
                  checker: options.checker,
                  ...(subjectType === undefined ? {} : { subjectType }),
                  placement,
                  ...(options.extensions === undefined ? {} : { extensions: options.extensions }),
                },
                options.performance
              )
          )
        );
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  const snapshot = {
    filePath: sourceFile.fileName,
    sourceHash: computeFormSpecTextHash(sourceFile.text),
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    comments,
    diagnostics,
  };

  options.performance?.record({
    name: "analysis.buildFileSnapshot",
    durationMs: getFormSpecPerformanceNow() - startedAt,
    detail: {
      filePath: sourceFile.fileName,
      commentCount: comments.length,
      diagnosticCount: diagnostics.length,
    },
  });

  return snapshot;
}
