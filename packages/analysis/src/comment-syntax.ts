import type { PathTarget } from "@formspec/core";
import { extractPathTarget } from "./path-target.js";
import { getTagDefinition, normalizeFormSpecTagName, type ExtensionTagSource } from "./tag-registry.js";

export interface CommentSourceSpan {
  readonly start: number;
  readonly end: number;
}

export type CommentSpan = CommentSourceSpan;

export interface ParsedCommentTargetSpecifier {
  readonly rawText: string;
  readonly valid: boolean;
  readonly kind: "path" | "member" | "variant" | "ambiguous";
  readonly fullSpan: CommentSourceSpan;
  readonly colonSpan: CommentSourceSpan;
  readonly span: CommentSourceSpan;
  readonly path: PathTarget | null;
}

interface ParsedCommentTargetSpecifierWithLocalEnd extends ParsedCommentTargetSpecifier {
  readonly localEnd: number;
}

export interface ParsedCommentTag {
  readonly rawTagName: string;
  readonly normalizedTagName: string;
  readonly recognized: boolean;
  readonly fullSpan: CommentSourceSpan;
  readonly tagNameSpan: CommentSourceSpan;
  readonly payloadSpan: CommentSourceSpan | null;
  readonly colonSpan: CommentSourceSpan | null;
  readonly target: ParsedCommentTargetSpecifier | null;
  readonly argumentSpan: CommentSourceSpan | null;
  readonly argumentText: string;
}

export interface ParsedCommentBlock {
  readonly commentText: string;
  readonly offset: number;
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
  const commentBodyStart =
    commentText.startsWith("/**") ? 3 : commentText.startsWith("/*") ? 2 : 0;
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
    while (contentStart < contentEnd && (commentText[contentStart] === " " || commentText[contentStart] === "\t")) {
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
  readonly offset?: number;
  readonly extensions?: readonly ExtensionTagSource[];
}

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

export const parseCommentSyntax = parseCommentBlock;

export function parseTagSyntax(
  rawTagName: string,
  payloadText: string,
  options?: Omit<ParseCommentSyntaxOptions, "offset">
): ParsedCommentTag {
  const separator =
    payloadText === "" || isWhitespace(payloadText[0]) ? "" : " ";
  const parsed = parseCommentBlock(`/** @${rawTagName}${separator}${payloadText} */`, options);
  const [tag] = parsed.tags;
  if (tag === undefined) {
    throw new Error(`Unable to parse synthetic tag syntax for @${rawTagName}`);
  }
  return tag;
}

export function sliceCommentSpan(
  commentText: string,
  span: CommentSpan,
  options?: { readonly offset?: number }
): string {
  const baseOffset = options?.offset ?? 0;
  return commentText.slice(span.start - baseOffset, span.end - baseOffset);
}
