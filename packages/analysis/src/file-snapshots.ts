import * as ts from "typescript";
import { checkSyntheticTagApplication } from "./compiler-signatures.js";
import { parseCommentBlock, type CommentSpan } from "./comment-syntax.js";
import {
  getCommentTagSemanticContext,
  type CommentSemanticContextOptions,
} from "./cursor-context.js";
import { getHostType, getLastLeadingDocCommentRange, getSubjectType } from "./source-bindings.js";
import {
  computeFormSpecTextHash,
  serializeParsedCommentTag,
  type FormSpecAnalysisCommentSnapshot,
  type FormSpecAnalysisDiagnostic,
  type FormSpecAnalysisFileSnapshot,
} from "./semantic-protocol.js";
import { resolveDeclarationPlacement } from "./ts-binding.js";
import type { ExtensionTagSource, FormSpecPlacement } from "./tag-registry.js";

/**
 * Options used when building a serializable, editor-oriented snapshot for a
 * TypeScript source file.
 */
export interface BuildFormSpecAnalysisFileSnapshotOptions {
  readonly checker: ts.TypeChecker;
  readonly extensions?: readonly ExtensionTagSource[];
}

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

function buildTagDiagnostics(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  placement: FormSpecPlacement | null,
  hostType: ts.Type | undefined,
  subjectType: ts.Type | undefined,
  commentTags: ReturnType<typeof parseCommentBlock>["tags"],
  semanticOptions: CommentSemanticContextOptions
): FormSpecAnalysisDiagnostic[] {
  if (placement === null || subjectType === undefined) {
    return [];
  }

  const diagnostics: FormSpecAnalysisDiagnostic[] = [];
  const hostTypeText = typeToString(hostType, checker) ?? "unknown";
  const subjectTypeText = typeToString(subjectType, checker) ?? "unknown";
  const supportingDeclarations = [
    ...supportingDeclarationsForType(hostType),
    ...supportingDeclarationsForType(subjectType),
  ];

  for (const tag of commentTags) {
    const semantic = getCommentTagSemanticContext(tag, semanticOptions);
    if (semantic.tagDefinition === null) {
      continue;
    }

    const target = getSyntheticTargetForTag(tag);
    const argumentExpression = getArgumentExpression(
      tag.argumentText,
      semantic.valueLabels,
      semantic.compatiblePathTargets
    );

    try {
      const result = checkSyntheticTagApplication({
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
      });

      for (const diagnostic of result.diagnostics) {
        const code =
          target !== null && diagnostic.message.includes("not assignable")
            ? target.kind === "path"
              ? "UNKNOWN_PATH_TARGET"
              : "TYPE_MISMATCH"
            : diagnostic.message.includes("Expected")
              ? "INVALID_TAG_ARGUMENT"
              : diagnostic.message.includes("No overload")
                ? "INVALID_TAG_PLACEMENT"
                : "TYPE_MISMATCH";
        diagnostics.push({
          code,
          message: diagnostic.message,
          range: tag.fullSpan,
          severity: diagnosticSeverity(code),
        });
      }
    } catch (error) {
      diagnostics.push({
        code: "INVALID_TAG_PLACEMENT",
        message: error instanceof Error ? error.message : String(error),
        range: tag.fullSpan,
        severity: "error",
      });
    }
  }

  return diagnostics;
}

function buildCommentSnapshot(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  extensions: readonly ExtensionTagSource[] | undefined
): FormSpecAnalysisCommentSnapshot | null {
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

/**
 * Builds a transport-safe snapshot of every FormSpec-bearing doc comment in a
 * source file, including semantic hover/completion context and file-local
 * diagnostics.
 */
export function buildFormSpecAnalysisFileSnapshot(
  sourceFile: ts.SourceFile,
  options: BuildFormSpecAnalysisFileSnapshotOptions
): FormSpecAnalysisFileSnapshot {
  const comments: FormSpecAnalysisCommentSnapshot[] = [];
  const diagnostics: FormSpecAnalysisDiagnostic[] = [];

  const visit = (node: ts.Node): void => {
    const placement = resolveDeclarationPlacement(node);
    if (placement !== null) {
      const snapshot = buildCommentSnapshot(node, sourceFile, options.checker, options.extensions);
      if (snapshot !== null) {
        comments.push(snapshot);

        const subjectType = getSubjectType(node, options.checker);
        const hostType = getHostType(node, options.checker);
        diagnostics.push(
          ...buildTagDiagnostics(
            sourceFile,
            options.checker,
            placement,
            hostType,
            subjectType,
            snapshot.tags.map((tag) => ({
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
                      path: null,
                    },
              argumentSpan: tag.argumentSpan,
              argumentText: tag.argumentText,
            })),
            {
              checker: options.checker,
              ...(subjectType === undefined ? {} : { subjectType }),
              placement,
              ...(options.extensions === undefined ? {} : { extensions: options.extensions }),
            }
          )
        );
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    filePath: sourceFile.fileName,
    sourceHash: computeFormSpecTextHash(sourceFile.text),
    generatedAt: new Date().toISOString(),
    comments,
    diagnostics,
  };
}
