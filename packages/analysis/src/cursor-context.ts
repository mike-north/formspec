import { parseCommentBlock, type ParsedCommentBlock, type ParsedCommentTag } from "./comment-syntax.js";
import type { ExtensionTagSource } from "./tag-registry.js";

export interface EnclosingDocComment {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly parsed: ParsedCommentBlock;
}

export interface CommentCursorTarget {
  readonly kind: "tag-name" | "colon" | "target" | "argument";
  readonly tag: ParsedCommentTag;
}

export type CommentCompletionContext =
  | {
      readonly kind: "tag-name";
      readonly prefix: string;
    }
  | {
      readonly kind: "target";
      readonly tag: ParsedCommentTag;
    }
  | {
      readonly kind: "argument";
      readonly tag: ParsedCommentTag;
    }
  | {
      readonly kind: "none";
    };

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9]/u.test(char);
}

function isWhitespaceLike(char: string | undefined): boolean {
  return char === undefined || /\s/u.test(char) || char === "*";
}

function containsOffset(tag: ParsedCommentTag, offset: number): boolean {
  return offset >= tag.tagNameSpan.start && offset <= tag.tagNameSpan.end;
}

export function findEnclosingDocComment(
  documentText: string,
  offset: number,
  options?: { readonly extensions?: readonly ExtensionTagSource[] }
): EnclosingDocComment | null {
  const commentPattern = /\/\*\*[\s\S]*?\*\//gu;

  for (const match of documentText.matchAll(commentPattern)) {
    const fullMatch = match[0];
    const index = match.index;
    const start = index;
    const end = start + fullMatch.length;
    if (offset >= start && offset <= end) {
      return {
        text: fullMatch,
        start,
        end,
        parsed: parseCommentBlock(fullMatch, {
          offset: start,
          ...(options?.extensions !== undefined ? { extensions: options.extensions } : {}),
        }),
      };
    }
  }

  return null;
}

export function findCommentTagAtOffset(
  documentText: string,
  offset: number,
  options?: { readonly extensions?: readonly ExtensionTagSource[] }
): ParsedCommentTag | null {
  const comment = findEnclosingDocComment(documentText, offset, options);
  if (comment === null) {
    return null;
  }

  return comment.parsed.tags.find((tag) => containsOffset(tag, offset)) ?? null;
}

export function getCommentCursorTargetAtOffset(
  documentText: string,
  offset: number,
  options?: { readonly extensions?: readonly ExtensionTagSource[] }
): CommentCursorTarget | null {
  const comment = findEnclosingDocComment(documentText, offset, options);
  if (comment === null) {
    return null;
  }

  for (const tag of comment.parsed.tags) {
    if (containsOffset(tag, offset)) {
      return {
        kind: "tag-name",
        tag,
      };
    }

    if (
      tag.colonSpan !== null &&
      offset >= tag.colonSpan.start &&
      offset <= tag.colonSpan.end
    ) {
      return {
        kind: "colon",
        tag,
      };
    }

    if (
      tag.target !== null &&
      offset >= tag.target.span.start &&
      offset <= tag.target.span.end
    ) {
      return {
        kind: "target",
        tag,
      };
    }

    if (
      tag.argumentSpan !== null &&
      offset >= tag.argumentSpan.start &&
      offset <= tag.argumentSpan.end
    ) {
      return {
        kind: "argument",
        tag,
      };
    }
  }

  return null;
}

export function getTagCompletionPrefixAtOffset(
  documentText: string,
  offset: number
): string | null {
  const comment = findEnclosingDocComment(documentText, offset);
  if (comment === null) {
    return null;
  }

  const relativeOffset = offset - comment.start;
  if (relativeOffset < 0 || relativeOffset > comment.text.length) {
    return null;
  }

  let cursor = relativeOffset;
  while (cursor > 0 && isWordChar(comment.text[cursor - 1])) {
    cursor -= 1;
  }

  const atIndex = cursor - 1;
  if (atIndex < 0 || comment.text[atIndex] !== "@") {
    return null;
  }

  const previousChar = atIndex > 0 ? comment.text[atIndex - 1] : undefined;
  if (!isWhitespaceLike(previousChar)) {
    return null;
  }

  return comment.text.slice(cursor, relativeOffset);
}

export function getCommentCompletionContextAtOffset(
  documentText: string,
  offset: number,
  options?: { readonly extensions?: readonly ExtensionTagSource[] }
): CommentCompletionContext {
  const prefix = getTagCompletionPrefixAtOffset(documentText, offset);
  if (prefix !== null) {
    return {
      kind: "tag-name",
      prefix,
    };
  }

  const target = getCommentCursorTargetAtOffset(documentText, offset, options);
  if (target?.kind === "target" || target?.kind === "colon") {
    return {
      kind: "target",
      tag: target.tag,
    };
  }

  if (target?.kind === "argument") {
    return {
      kind: "argument",
      tag: target.tag,
    };
  }

  return {
    kind: "none",
  };
}
