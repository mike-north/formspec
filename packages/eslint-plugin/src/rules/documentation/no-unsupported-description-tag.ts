import { ESLintUtils } from "@typescript-eslint/utils";
import { extractCommentSummaryText, normalizeFormSpecTagName } from "@formspec/analysis/internal";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags, type ScannedTag } from "../../utils/tag-scanner.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

function getNewline(text: string): "\r\n" | "\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function stripCommentLinePrefix(line: string): string {
  const match = /^(\s*)\*(?:[ \t]?)(.*)$/u.exec(line);
  return match?.[2] ?? line;
}

function getStarIndent(lines: readonly string[]): string {
  const bodyLine = lines.find((line, index) => index > 0 && /^\s*\*/u.test(line));
  const match = /^(\s*)\*/u.exec(bodyLine ?? "");
  return match?.[1] ?? " ";
}

function getLeadingBlockTagName(line: string): string | null {
  const match = /^@([A-Za-z][A-Za-z0-9]*)(?:\s|$)/u.exec(line.trimStart());
  const rawName = match?.[1];
  return rawName === undefined ? null : normalizeFormSpecTagName(rawName);
}

function startsWithBlockTag(line: string): boolean {
  return getLeadingBlockTagName(line) !== null;
}

function startsWithDescriptionTag(line: string): boolean {
  return getLeadingBlockTagName(line) === "description";
}

function getDescriptionTagPayload(line: string): string {
  return line
    .trimStart()
    .replace(/^@[A-Za-z][A-Za-z0-9]*(?:\s+)?/u, "")
    .replace(/[ \t]+$/u, "");
}

function removeDescriptionBlocks(lines: readonly string[]): {
  readonly remainingLines: string[];
  readonly descriptionTexts: string[];
} {
  const remaining: string[] = [];
  const descriptions: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!startsWithDescriptionTag(line)) {
      remaining.push(line);
      index += 1;
      continue;
    }

    // A TSDoc block tag owns following non-tag lines until the next block tag.
    const descriptionLines = [getDescriptionTagPayload(line)];
    index += 1;
    while (index < lines.length && !startsWithBlockTag(lines[index] ?? "")) {
      descriptionLines.push((lines[index] ?? "").replace(/[ \t]+$/u, ""));
      index += 1;
    }

    const descriptionText = descriptionLines.join("\n").trim();
    if (descriptionText !== "") {
      descriptions.push(descriptionText);
    }
  }

  return {
    remainingLines: remaining,
    descriptionTexts: descriptions,
  };
}

function renderMultilineComment(
  originalCommentText: string,
  contentLines: readonly string[]
): string {
  const newline = getNewline(originalCommentText);
  const starIndent = getStarIndent(originalCommentText.split(/\r\n|\n/u));

  return [
    "/**",
    ...contentLines.map((line) => (line === "" ? `${starIndent}*` : `${starIndent}* ${line}`)),
    `${starIndent}*/`,
  ].join(newline);
}

function buildMultilineFix(
  commentText: string,
  descriptions: readonly ScannedTag[]
): string | null {
  // Targeted descriptions cannot be represented as summary text without
  // changing their meaning, so report the error but leave it for manual repair.
  if (descriptions.some((description) => description.target !== null)) {
    return null;
  }

  const rawLines = commentText.split(/\r\n|\n/u);
  const contentLines = rawLines.slice(1, -1).map(stripCommentLinePrefix);
  const { remainingLines, descriptionTexts } = removeDescriptionBlocks(contentLines);
  const descriptionText = descriptionTexts.join("\n\n");

  if (descriptionText !== "") {
    const firstTagIndex = remainingLines.findIndex(startsWithBlockTag);
    const insertionIndex = firstTagIndex === -1 ? remainingLines.length : firstTagIndex;
    const descriptionLines = descriptionText.split(/\r\n|\n/u);
    const hasExistingSummary = extractCommentSummaryText(commentText) !== "";
    const insertedLines = hasExistingSummary ? ["", ...descriptionLines] : descriptionLines;
    remainingLines.splice(insertionIndex, 0, ...insertedLines);
  }

  return renderMultilineComment(commentText, remainingLines);
}

function getDescriptionText(commentText: string, description: ScannedTag): string {
  return description.rawArgumentRange === null
    ? ""
    : commentText.slice(
        description.rawArgumentRange[0] - description.comment.range[0],
        description.rawArgumentRange[1] - description.comment.range[0]
      );
}

function findDescriptionSpans(
  commentText: string,
  descriptions: readonly ScannedTag[]
): readonly (readonly [start: number, end: number])[] | null {
  const spans: [number, number][] = [];
  let searchStart = 0;

  for (const description of descriptions) {
    const tagStart = commentText.indexOf(description.rawText, searchStart);
    if (tagStart === -1) {
      return null;
    }
    const tagEnd = tagStart + description.rawText.length;
    spans.push([tagStart, tagEnd]);
    searchStart = tagEnd;
  }

  return spans;
}

function removeSpans(text: string, spans: readonly (readonly [start: number, end: number])[]) {
  let remaining = text;
  for (const [start, end] of [...spans].sort((left, right) => right[0] - left[0])) {
    remaining = `${remaining.slice(0, start)}${remaining.slice(end)}`;
  }
  return remaining;
}

function buildSingleLineFix(
  commentText: string,
  descriptions: readonly ScannedTag[]
): string | null {
  if (descriptions.some((description) => description.target !== null)) {
    return null;
  }

  const spans = findDescriptionSpans(commentText, descriptions);
  if (spans === null) {
    return null;
  }

  const localSpans = spans.map(([start, end]) => [start - 3, end - 3] as const);
  const remainingBody = removeSpans(commentText.slice(3, -2), localSpans).trim();
  const descriptionTexts = descriptions
    .map((description) => getDescriptionText(commentText, description).trim())
    .filter((descriptionText) => descriptionText !== "");

  const firstTagIndex = remainingBody.search(/@[A-Za-z]/u);
  const existingSummary =
    firstTagIndex === -1 ? remainingBody : remainingBody.slice(0, firstTagIndex).trim();
  const followingTags = firstTagIndex === -1 ? "" : remainingBody.slice(firstTagIndex).trim();

  const summaryBody = [existingSummary, ...descriptionTexts]
    .filter((part) => part !== "")
    .join(" ");
  const body = [summaryBody, followingTags].filter((part) => part !== "").join(" ");
  return body === "" ? "/** */" : `/** ${body} */`;
}

function buildDescriptionTagFix(
  commentText: string,
  descriptions: readonly ScannedTag[]
): string | null {
  return commentText.includes("\n") || commentText.includes("\r")
    ? buildMultilineFix(commentText, descriptions)
    : buildSingleLineFix(commentText, descriptions);
}

function groupDescriptionTagsByComment(
  tags: readonly ScannedTag[]
): readonly (readonly ScannedTag[])[] {
  const groups = new Map<ScannedTag["comment"], ScannedTag[]>();
  for (const tag of tags) {
    if (tag.normalizedName !== "description") continue;
    const group = groups.get(tag.comment);
    if (group === undefined) {
      groups.set(tag.comment, [tag]);
    } else {
      group.push(tag);
    }
  }
  return [...groups.values()];
}

/**
 * ESLint rule that bans `@description` usage entirely.
 *
 * @public
 */
export const noUnsupportedDescriptionTag = createRule<[], "descriptionTagForbidden">({
  name: "documentation/no-unsupported-description-tag",
  meta: {
    type: "problem",
    docs: {
      description: "Bans @description, which is not a standard TSDoc tag",
    },
    fixable: "code",
    schema: [],
    messages: {
      descriptionTagForbidden:
        '"@description" is not a standard TSDoc tag and is not supported. Move the description text before the first tag as summary text.',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      const tags = scanFormSpecTags(node, context.sourceCode);
      for (const descriptions of groupDescriptionTagsByComment(tags)) {
        const [firstDescription] = descriptions;
        if (firstDescription === undefined) continue;
        context.report({
          loc: firstDescription.comment.loc,
          messageId: "descriptionTagForbidden",
          fix: (fixer) => {
            const commentText = context.sourceCode.text.slice(
              firstDescription.comment.range[0],
              firstDescription.comment.range[1]
            );
            const replacement = buildDescriptionTagFix(commentText, descriptions);
            if (replacement === null) {
              return null;
            }
            return fixer.replaceTextRange(firstDescription.comment.range, replacement);
          },
        });
      }
    });
  },
});
