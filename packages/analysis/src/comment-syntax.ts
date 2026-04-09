import type { PathTarget } from "@formspec/core/internals";
import { extractPathTarget } from "./path-target.js";
import {
  getTagDefinition,
  normalizeFormSpecTagName,
  type ExtensionTagSource,
} from "./tag-registry.js";

/**
 * Zero-based half-open span in the source file.
 *
 * @public
 */
export interface CommentSourceSpan {
  /** Zero-based start offset in the source file. */
  readonly start: number;
  /** One-past-the-end offset in the source file. */
  readonly end: number;
}

/**
 * Canonical span type used throughout serialized comment analysis.
 *
 * @public
 */
export type CommentSpan = CommentSourceSpan;

/**
 * Parsed target specifier attached to a comment tag.
 *
 * @public
 */
export interface ParsedCommentTargetSpecifier {
  /** Raw target text without the leading colon. */
  readonly rawText: string;
  /** Whether the target parsed cleanly. */
  readonly valid: boolean;
  /** Classified target kind used by completion and hover flows. */
  readonly kind: "path" | "member" | "variant" | "ambiguous";
  /** Full span covering the colon and target text. */
  readonly fullSpan: CommentSourceSpan;
  /** Span covering only the colon prefix. */
  readonly colonSpan: CommentSourceSpan;
  /** Span covering the target text after the colon. */
  readonly span: CommentSourceSpan;
  /** Parsed path target when one could be resolved. */
  readonly path: PathTarget | null;
}

interface ParsedCommentTargetSpecifierWithLocalEnd extends ParsedCommentTargetSpecifier {
  readonly localEnd: number;
}

/**
 * Parsed representation of a single FormSpec tag inside a comment block.
 *
 * @public
 */
export interface ParsedCommentTag {
  /** Raw tag name exactly as written in the source. */
  readonly rawTagName: string;
  /** Normalized tag name used for registry lookup. */
  readonly normalizedTagName: string;
  /** Whether the tag was recognized by the registry. */
  readonly recognized: boolean;
  /** Full span covering the parsed tag. */
  readonly fullSpan: CommentSourceSpan;
  /** Span covering the tag name token. */
  readonly tagNameSpan: CommentSourceSpan;
  /** Span covering the payload after the tag name, if present. */
  readonly payloadSpan: CommentSourceSpan | null;
  /** Span covering the target colon, if present. */
  readonly colonSpan: CommentSourceSpan | null;
  /** Parsed target specifier, if present. */
  readonly target: ParsedCommentTargetSpecifier | null;
  /** Span covering the argument text, if present. */
  readonly argumentSpan: CommentSourceSpan | null;
  /** Raw argument text following the tag or target. */
  readonly argumentText: string;
}

/**
 * Parsed representation of one doc comment block.
 *
 * @public
 */
export interface ParsedCommentBlock {
  /** Comment text with delimiters removed. */
  readonly commentText: string;
  /** Absolute source offset where the comment block begins. */
  readonly offset: number;
  /** Parsed tags discovered inside the comment. */
  readonly tags: readonly ParsedCommentTag[];
}

interface CommentLineProjection {
  readonly text: string;
  readonly rawOffsets: readonly number[];
  readonly rawContentEnd: number;
}

function isWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function isTagStart(lineText: string, index: number): boolean {
  if (lineText[index] !== "@") {
    return false;
  }

  const nextChar = lineText[index + 1];
  if (nextChar === undefined || !/[A-Za-z]/u.test(nextChar)) {
    return false;
  }

  const previousChar = lineText[index - 1];
  return previousChar === undefined || isWhitespace(previousChar);
}

function findTagEnd(lineText: string, index: number): number {
  let cursor = index + 1;
  while (cursor < lineText.length && /[A-Za-z0-9]/u.test(lineText[cursor] ?? "")) {
    cursor += 1;
  }
  return cursor;
}

function trimTrailingWhitespace(lineText: string, end: number): number {
  let cursor = end;
  while (cursor > 0 && isWhitespace(lineText[cursor - 1])) {
    cursor -= 1;
  }
  return cursor;
}

function spanFromLine(
  line: CommentLineProjection,
  start: number,
  end: number,
  baseOffset: number
): CommentSourceSpan {
  const rawStart = line.rawOffsets[start];
  if (rawStart === undefined) {
    throw new Error(`Invalid projected span start: ${String(start)}`);
  }

  const rawEnd =
    end >= line.text.length
      ? line.rawContentEnd
      : (line.rawOffsets[end - 1] ?? line.rawContentEnd - 1) + 1;

  return {
    start: baseOffset + rawStart,
    end: baseOffset + rawEnd,
  };
}

function classifyTargetKind(
  canonicalName: string,
  targetText: string,
  extensions: readonly ExtensionTagSource[] | undefined
): ParsedCommentTargetSpecifier["kind"] {
  if (targetText === "singular" || targetText === "plural") {
    return "variant";
  }

  if (targetText.includes(".")) {
    return "path";
  }

  const definition = getTagDefinition(canonicalName, extensions);
  const supportedTargets = definition?.supportedTargets.filter((target) => target !== "none") ?? [];

  if (supportedTargets.includes("path")) {
    return "path";
  }
  if (supportedTargets.includes("member") && supportedTargets.includes("variant")) {
    return "ambiguous";
  }
  if (supportedTargets.includes("member")) {
    return "member";
  }
  if (supportedTargets.includes("variant")) {
    return "variant";
  }
  return "path";
}

function parseTargetSpecifier(
  line: CommentLineProjection,
  payloadStart: number,
  payloadEnd: number,
  canonicalName: string,
  baseOffset: number,
  extensions: readonly ExtensionTagSource[] | undefined
): ParsedCommentTargetSpecifierWithLocalEnd | null {
  if (payloadStart >= payloadEnd || line.text[payloadStart] !== ":") {
    return null;
  }

  let targetEnd = payloadStart + 1;
  while (targetEnd < payloadEnd && !isWhitespace(line.text[targetEnd])) {
    targetEnd += 1;
  }

  const fullText = line.text.slice(payloadStart, targetEnd);
  const targetText = fullText.slice(1);
  const parsedPath = extractPathTarget(fullText);
  const specifierSpan = spanFromLine(line, payloadStart + 1, targetEnd, baseOffset);

  return {
    rawText: targetText,
    valid: parsedPath !== null && parsedPath.remainingText === "",
    kind: classifyTargetKind(canonicalName, targetText, extensions),
    fullSpan: spanFromLine(line, payloadStart, targetEnd, baseOffset),
    colonSpan: spanFromLine(line, payloadStart, payloadStart + 1, baseOffset),
    span: specifierSpan,
    path: parsedPath?.path ?? null,
    localEnd: targetEnd,
  };
}

function projectCommentLines(commentText: string): readonly CommentLineProjection[] {
  const projections: CommentLineProjection[] = [];
  const commentBodyStart = commentText.startsWith("/**") ? 3 : commentText.startsWith("/*") ? 2 : 0;
  const commentBodyEnd = commentText.endsWith("*/") ? commentText.length - 2 : commentText.length;

  let cursor = commentBodyStart;
  while (cursor <= commentBodyEnd) {
    const lineStart = cursor;
    let lineEnd = cursor;
    while (lineEnd < commentBodyEnd && commentText[lineEnd] !== "\n") {
      lineEnd += 1;
    }

    let contentEnd = lineEnd;
    if (contentEnd > lineStart && commentText[contentEnd - 1] === "\r") {
      contentEnd -= 1;
    }

    let contentStart = lineStart;
    while (
      contentStart < contentEnd &&
      (commentText[contentStart] === " " || commentText[contentStart] === "\t")
    ) {
      contentStart += 1;
    }
    if (contentStart < contentEnd && commentText[contentStart] === "*") {
      contentStart += 1;
      while (
        contentStart < contentEnd &&
        (commentText[contentStart] === " " || commentText[contentStart] === "\t")
      ) {
        contentStart += 1;
      }
    }

    const rawOffsets: number[] = [];
    let text = "";
    for (let index = contentStart; index < contentEnd; index += 1) {
      rawOffsets.push(index);
      text += commentText[index] ?? "";
    }

    projections.push({
      text,
      rawOffsets,
      rawContentEnd: contentEnd,
    });

    if (lineEnd >= commentBodyEnd) {
      break;
    }
    cursor = lineEnd + 1;
  }

  return projections;
}

export interface ParseCommentSyntaxOptions {
  /** Absolute source offset for the parsed comment block. */
  readonly offset?: number;
  /** Extension tag sources used to classify target specifiers. */
  readonly extensions?: readonly ExtensionTagSource[];
}

/**
 * Parse a doc comment block into tags and target/argument spans.
 *
 * @public
 */
export function parseCommentBlock(
  commentText: string,
  options?: ParseCommentSyntaxOptions
): ParsedCommentBlock {
  const tags: ParsedCommentTag[] = [];
  const baseOffset = options?.offset ?? 0;

  for (const line of projectCommentLines(commentText)) {
    const tagStarts: number[] = [];

    for (let index = 0; index < line.text.length; index += 1) {
      if (isTagStart(line.text, index)) {
        tagStarts.push(index);
      }
    }

    for (let tagIndex = 0; tagIndex < tagStarts.length; tagIndex += 1) {
      const tagStart = tagStarts[tagIndex];
      if (tagStart === undefined) {
        continue;
      }

      const tagEnd = findTagEnd(line.text, tagStart);
      const nextTagStart = tagStarts[tagIndex + 1] ?? line.text.length;
      const trimmedTagSegmentEnd = trimTrailingWhitespace(line.text, nextTagStart);
      const rawName = line.text.slice(tagStart + 1, tagEnd);
      const canonicalName = normalizeFormSpecTagName(rawName);

      let payloadStart = tagEnd;
      while (payloadStart < trimmedTagSegmentEnd && isWhitespace(line.text[payloadStart])) {
        payloadStart += 1;
      }

      const target = parseTargetSpecifier(
        line,
        payloadStart,
        trimmedTagSegmentEnd,
        canonicalName,
        baseOffset,
        options?.extensions
      );

      let valueStart = payloadStart;
      if (target !== null) {
        valueStart = target.localEnd;
        while (valueStart < trimmedTagSegmentEnd && isWhitespace(line.text[valueStart])) {
          valueStart += 1;
        }
      }

      const payloadSpan =
        payloadStart < trimmedTagSegmentEnd
          ? spanFromLine(line, payloadStart, trimmedTagSegmentEnd, baseOffset)
          : null;
      const valueSpan =
        valueStart < trimmedTagSegmentEnd
          ? spanFromLine(line, valueStart, trimmedTagSegmentEnd, baseOffset)
          : null;

      const parsedTarget =
        target === null
          ? null
          : {
              rawText: target.rawText,
              valid: target.valid,
              kind: target.kind,
              fullSpan: target.fullSpan,
              colonSpan: target.colonSpan,
              span: target.span,
              path: target.path,
            };

      tags.push({
        rawTagName: rawName,
        normalizedTagName: canonicalName,
        recognized: getTagDefinition(canonicalName, options?.extensions) !== null,
        fullSpan: spanFromLine(line, tagStart, trimmedTagSegmentEnd, baseOffset),
        tagNameSpan: spanFromLine(line, tagStart, tagEnd, baseOffset),
        payloadSpan,
        colonSpan: parsedTarget?.colonSpan ?? null,
        target: parsedTarget,
        argumentSpan: valueSpan,
        argumentText:
          valueSpan === null
            ? ""
            : commentText.slice(valueSpan.start - baseOffset, valueSpan.end - baseOffset),
      });
    }
  }

  return {
    commentText,
    offset: baseOffset,
    tags,
  };
}

/**
 * Parse a single tag form by synthesizing a comment block around it.
 *
 * @public
 */
export function parseTagSyntax(
  rawTagName: string,
  payloadText: string,
  options?: Omit<ParseCommentSyntaxOptions, "offset">
): ParsedCommentTag {
  const separator = payloadText === "" || isWhitespace(payloadText[0]) ? "" : " ";
  const parsed = parseCommentBlock(`/** @${rawTagName}${separator}${payloadText} */`, options);
  const [tag] = parsed.tags;
  if (tag === undefined) {
    throw new Error(`Unable to parse synthetic tag syntax for @${rawTagName}`);
  }
  return tag;
}

/**
 * Extracts summary text from a doc comment by taking the cleaned text that
 * appears before the first recognized tag marker.
 *
 * @public
 */
export function extractCommentSummaryText(commentText: string): string {
  const summaryLines: string[] = [];

  for (const line of projectCommentLines(commentText)) {
    let cutoff = line.text.length;
    for (let index = 0; index < line.text.length; index += 1) {
      if (isTagStart(line.text, index)) {
        cutoff = index;
        break;
      }
    }

    const segment = line.text.slice(0, cutoff).trimEnd();
    if (cutoff < line.text.length) {
      if (segment.trim() !== "") {
        summaryLines.push(segment.trim());
      }
      break;
    }

    summaryLines.push(segment);
  }

  return summaryLines.join("\n").trim();
}

/**
 * Extracts one or more TSDoc-style block-tag payloads, including continuation
 * lines until the next block tag begins.
 *
 * @public
 */
export function extractCommentBlockTagTexts(
  commentText: string,
  rawTagName: string
): readonly string[] {
  const lines = projectCommentLines(commentText);
  const canonicalName = normalizeFormSpecTagName(rawTagName);
  const values: string[] = [];

  let lineIndex = 0;
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (line === undefined) {
      break;
    }

    let matchingTagEnd: number | null = null;
    for (let index = 0; index < line.text.length; index += 1) {
      if (!isTagStart(line.text, index)) {
        continue;
      }

      const tagEnd = findTagEnd(line.text, index);
      const candidateName = normalizeFormSpecTagName(line.text.slice(index + 1, tagEnd));
      if (candidateName === canonicalName) {
        matchingTagEnd = tagEnd;
        break;
      }
    }

    if (matchingTagEnd === null) {
      lineIndex += 1;
      continue;
    }

    const blockLines: string[] = [];
    let payloadStart = matchingTagEnd;
    while (payloadStart < line.text.length && isWhitespace(line.text[payloadStart])) {
      payloadStart += 1;
    }
    blockLines.push(line.text.slice(payloadStart).replace(/[ \t]+$/u, ""));
    lineIndex += 1;

    while (lineIndex < lines.length) {
      const continuation = lines[lineIndex];
      if (continuation === undefined) {
        break;
      }

      let nextTagStarts = false;
      for (let index = 0; index < continuation.text.length; index += 1) {
        if (isTagStart(continuation.text, index)) {
          nextTagStarts = true;
          break;
        }
      }
      if (nextTagStarts) {
        break;
      }

      blockLines.push(continuation.text.replace(/[ \t]+$/u, ""));
      lineIndex += 1;
    }

    const text = blockLines.join("\n").trim();
    if (text !== "") {
      values.push(text);
    }
  }

  return values;
}

/**
 * Extract the raw text corresponding to a serialized comment span.
 *
 * @public
 */
export function sliceCommentSpan(
  commentText: string,
  span: CommentSpan,
  options?: { readonly offset?: number }
): string {
  const baseOffset = options?.offset ?? 0;
  return commentText.slice(span.start - baseOffset, span.end - baseOffset);
}
