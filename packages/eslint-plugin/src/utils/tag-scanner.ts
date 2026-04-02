import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import type { SourceCode } from "@typescript-eslint/utils/ts-eslint";
import {
  getTagMetadata,
  normalizeFormSpecTagName,
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

function scanComment(comment: TSESTree.Comment): ScannedTag[] {
  const results: ScannedTag[] = [];
  const commentContentStart = comment.range[0] + 2;
  const lineRegex = /.*(?:\r?\n|$)/g;

  let lineMatch: RegExpExecArray | null;
  while ((lineMatch = lineRegex.exec(comment.value)) !== null) {
    const rawLineWithBreak = lineMatch[0];
    if (rawLineWithBreak === "") {
      break;
    }

    const line = rawLineWithBreak.replace(/\r?\n$/, "");
    const lineStart = lineMatch.index;
    const cleaned = line.replace(/^\s*\*\s?/, "");
    const cleanedPrefixLength = line.length - cleaned.length;
    const tagStartRegex = /(^|\s)@([A-Za-z][A-Za-z0-9]*)(?=\s|$)/g;
    const starts: { rawName: string; start: number; end: number }[] = [];
    let startMatch: RegExpExecArray | null;
    while ((startMatch = tagStartRegex.exec(cleaned)) !== null) {
      const rawName = startMatch[2];
      if (!rawName) continue;
      const prefixLength = (startMatch[1] ?? "").length;
      const start = startMatch.index + prefixLength;
      starts.push({ rawName, start, end: start + rawName.length + 1 });
    }

    for (let index = 0; index < starts.length; ) {
      const current = starts[index];
      if (!current) {
        index += 1;
        continue;
      }

      const next = starts[index + 1];
      const metadata = getTagMetadata(current.rawName);
      const nextBoundary = next?.start ?? cleaned.length;
      const rawSegment = cleaned.slice(current.start, nextBoundary);
      const rawText = rawSegment.trimEnd();
      const rawArgumentWithWhitespace = rawText.slice(current.end - current.start);
      const rawArgument = rawArgumentWithWhitespace.trim();
      const leadingWhitespaceLength =
        rawArgumentWithWhitespace.length - rawArgumentWithWhitespace.trimStart().length;
      const rawArgumentStart =
        commentContentStart +
        lineStart +
        cleanedPrefixLength +
        current.start +
        (current.end - current.start) +
        leadingWhitespaceLength;
      const rawArgumentRange =
        rawArgument === ""
          ? null
          : ([rawArgumentStart, rawArgumentStart + rawArgument.length] as const);

      const rawName = current.rawName;
      const normalizedName = normalizeFormSpecTagName(rawName);

      let target: ScannedTagTarget | null = null;
      let valueText = rawArgument;
      const targetMatch =
        /^:("[^"]+"|'[^']+'|[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*)(?:\s+(.*))?$/u.exec(rawArgument);
      if (targetMatch?.[1]) {
        const rawTarget = targetMatch[1];
        const targetValue = rawTarget.replace(/^['"]|['"]$/g, "");
        const inferredKind =
          metadata?.supportedTargets.includes("variant") &&
          (targetValue === "singular" || targetValue === "plural")
            ? "variant"
            : metadata?.supportedTargets.includes("member") &&
                !metadata.supportedTargets.includes("path")
              ? "member"
              : metadata?.supportedTargets.includes("path") &&
                  !metadata.supportedTargets.includes("member")
                ? "path"
                : "path";
        target = {
          kind: inferredKind,
          raw: rawTarget,
          value: targetValue,
        };
        valueText = (targetMatch[2] ?? "").trim();
      }

      results.push({
        rawName,
        normalizedName,
        rawText,
        rawArgument,
        rawArgumentRange,
        valueText,
        target,
        comment,
      });

      index += 1;
      while (index < starts.length && (starts[index]?.start ?? cleaned.length) < nextBoundary) {
        index += 1;
      }
    }
  }

  return results;
}

export function scanFormSpecTags(node: TSESTree.Node, sourceCode: SourceCode): ScannedTag[] {
  return getLeadingJSDocComments(node, sourceCode).flatMap((comment) => scanComment(comment));
}

export function getTagIdentity(tag: ScannedTag): string {
  const targetPrefix = tag.target ? `${tag.target.kind}:${tag.target.value}` : "none";
  return `${tag.normalizedName}|${targetPrefix}`;
}
