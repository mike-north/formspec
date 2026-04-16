import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import type { SourceCode } from "@typescript-eslint/utils/ts-eslint";
import {
  parseCommentBlock,
  type ParsedCommentTag,
} from "@formspec/analysis/internal";
import {
  getTagMetadata,
  type FormSpecTargetKind,
} from "./tag-metadata.js";

export interface ScannedTagTarget {
  readonly kind: Exclude<FormSpecTargetKind, "none">;
  readonly value: string;
  readonly raw: string;
}

export interface ScannedTag {
  readonly rawName: string;
  readonly normalizedName: string;
  readonly rawText: string;
  readonly rawArgument: string;
  readonly rawArgumentRange: readonly [start: number, end: number] | null;
  readonly valueText: string;
  readonly target: ScannedTagTarget | null;
  readonly comment: TSESTree.Comment;
}

function getLeadingJSDocComments(node: TSESTree.Node, sourceCode: SourceCode): TSESTree.Comment[] {
  const comments = [...sourceCode.getCommentsBefore(node)];
  if (node.type === AST_NODE_TYPES.PropertyDefinition && node.decorators.length > 0) {
    const keyComments = sourceCode.getCommentsBefore(node.key);
    for (const comment of keyComments) {
      if (!comments.includes(comment)) {
        comments.push(comment);
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- TSESTree.Comment uses string literals
  return comments.filter((comment) => comment.type === "Block" && comment.value.startsWith("*"));
}

/**
 * Resolve an "ambiguous" target kind (supports both member and variant but the
 * value is not "singular"/"plural") to a concrete kind using the same logic as
 * the legacy scanner: prefer "member" when the tag does not support "path",
 * otherwise fall back to "path".
 */
function resolveAmbiguousKind(rawName: string): Exclude<FormSpecTargetKind, "none" | "ambiguous"> {
  const metadata = getTagMetadata(rawName);
  if (metadata?.supportedTargets.includes("member") && !metadata.supportedTargets.includes("path")) {
    return "member";
  }
  return "path";
}

/**
 * Regex matching a target specifier, including quoted targets that may contain
 * spaces. parseCommentBlock truncates quoted targets at the first space because
 * its path-target logic doesn't support quoted identifiers — we re-parse here.
 */
const QUOTED_TARGET_REGEX = /^:(["'][^"']*["']|[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*)(?:\s+(.*))?$/u;

function mapParsedTagToScannedTag(
  tag: ParsedCommentTag,
  commentText: string,
  commentStart: number,
  comment: TSESTree.Comment
): ScannedTag {
  const rawText =
    tag.fullSpan.start - commentStart < commentText.length &&
    tag.fullSpan.end - commentStart <= commentText.length
      ? commentText.slice(tag.fullSpan.start - commentStart, tag.fullSpan.end - commentStart)
      : "";

  const rawArgument =
    tag.payloadSpan !== null
      ? commentText
          .slice(tag.payloadSpan.start - commentStart, tag.payloadSpan.end - commentStart)
          .trim()
      : "";

  const rawArgumentRange: readonly [number, number] | null =
    tag.payloadSpan !== null && rawArgument !== ""
      ? [tag.payloadSpan.start, tag.payloadSpan.end]
      : null;

  // Determine target and valueText. parseCommentBlock correctly handles
  // unquoted targets; for quoted targets with spaces it truncates at the first
  // space. Re-parse rawArgument with a regex that handles quoted targets.
  let target: ScannedTagTarget | null = null;
  let valueText = tag.argumentText;

  if (rawArgument.startsWith(":")) {
    const quotedMatch = QUOTED_TARGET_REGEX.exec(rawArgument);
    if (quotedMatch?.[1]) {
      const rawTargetText = quotedMatch[1];
      const targetValue = rawTargetText.replace(/^['"]|['"]$/gu, "");
      const isQuoted = rawTargetText.startsWith('"') || rawTargetText.startsWith("'");

      let resolvedKind: Exclude<FormSpecTargetKind, "none">;
      if (!isQuoted && tag.target !== null && tag.target.kind !== "ambiguous") {
        // Use parseCommentBlock's classification for unquoted targets
        resolvedKind = tag.target.kind;
      } else if (targetValue === "singular" || targetValue === "plural") {
        resolvedKind = "variant";
      } else {
        resolvedKind = resolveAmbiguousKind(tag.rawTagName);
      }

      target = {
        kind: resolvedKind,
        value: targetValue,
        raw: rawTargetText,
      };
      valueText = (quotedMatch[2] ?? "").trim();
    }
  }

  return {
    rawName: tag.rawTagName,
    normalizedName: tag.normalizedTagName,
    rawText,
    rawArgument,
    rawArgumentRange,
    valueText,
    target,
    comment,
  };
}

function scanComment(comment: TSESTree.Comment): ScannedTag[] {
  const commentText = `/*${comment.value}*/`;
  const commentStart = comment.range[0];

  const parsed = parseCommentBlock(commentText, { offset: commentStart });

  return parsed.tags.map((tag) =>
    mapParsedTagToScannedTag(tag, commentText, commentStart, comment)
  );
}

export function scanFormSpecTags(node: TSESTree.Node, sourceCode: SourceCode): ScannedTag[] {
  return getLeadingJSDocComments(node, sourceCode).flatMap((comment) => scanComment(comment));
}

export function getTagIdentity(tag: ScannedTag): string {
  const targetPrefix = tag.target ? `${tag.target.kind}:${tag.target.value}` : "none";
  return `${tag.normalizedName}|${targetPrefix}`;
}
