import {
  parseCommentBlock,
  type ParsedCommentBlock,
  type ParsedCommentTag,
} from "./comment-syntax.js";
import type * as ts from "typescript";
import { collectCompatiblePathTargets, getEnumMemberCompletions } from "./ts-binding.js";
import { getDeclarationTypeParameterNames, getDirectPropertyTargets } from "./source-bindings.js";
import {
  getAllTagDefinitions,
  getTagDefinition,
  type ExtensionTagSource,
  type FormSpecPlacement,
  type FormSpecTargetKind,
  type TagDefinition,
  type TagSignature,
} from "./tag-registry.js";

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

export interface CommentSemanticContextOptions {
  readonly extensions?: readonly ExtensionTagSource[];
  readonly placement?: FormSpecPlacement | null;
  readonly checker?: ts.TypeChecker;
  readonly subjectType?: ts.Type;
  readonly declaration?: ts.Node;
}

export interface CommentTagSemanticContext {
  readonly tag: ParsedCommentTag;
  readonly tagDefinition: TagDefinition | null;
  readonly placement: FormSpecPlacement | null;
  readonly signatures: readonly TagSignature[];
  readonly contextualSignatures: readonly TagSignature[];
  readonly supportedTargets: readonly FormSpecTargetKind[];
  readonly targetCompletions: readonly string[];
  readonly compatiblePathTargets: readonly string[];
  readonly valueLabels: readonly string[];
  readonly argumentCompletions: readonly string[];
  readonly contextualTagHoverMarkdown: string | null;
  readonly tagHoverMarkdown: string | null;
  readonly targetHoverMarkdown: string | null;
  readonly argumentHoverMarkdown: string | null;
}

export type SemanticCommentCompletionContext =
  | {
      readonly kind: "tag-name";
      readonly prefix: string;
      readonly availableTags: readonly TagDefinition[];
    }
  | {
      readonly kind: "target";
      readonly semantic: CommentTagSemanticContext;
    }
  | {
      readonly kind: "argument";
      readonly semantic: CommentTagSemanticContext;
      readonly valueLabels: readonly string[];
    }
  | {
      readonly kind: "none";
    };

/**
 * Hover payload for a token inside a parsed FormSpec doc comment.
 *
 * @public
 */
export interface CommentHoverInfo {
  /** Comment token kind currently being described. */
  readonly kind: "tag-name" | "target" | "argument";
  /** Markdown rendered for the hovered token. */
  readonly markdown: string;
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9]/u.test(char);
}

function isWhitespaceLike(char: string | undefined): boolean {
  return char === undefined || /\s/u.test(char) || char === "*";
}

function containsOffset(tag: ParsedCommentTag, offset: number): boolean {
  return offset >= tag.tagNameSpan.start && offset <= tag.tagNameSpan.end;
}

function filterSignaturesByPlacement(
  signatures: readonly TagSignature[],
  placement: FormSpecPlacement | null | undefined
): readonly TagSignature[] {
  if (placement === undefined || placement === null) {
    return signatures;
  }

  const filtered = signatures.filter((signature) => signature.placements.includes(placement));
  return filtered.length > 0 ? filtered : signatures;
}

function hasExplicitTarget(signature: TagSignature): boolean {
  return signature.parameters.some(
    (parameter) =>
      parameter.kind === "target-path" ||
      parameter.kind === "target-member" ||
      parameter.kind === "target-variant"
  );
}

function matchesTargetKind(
  signature: TagSignature,
  targetKind: "path" | "member" | "variant"
): boolean {
  return signature.parameters.some((parameter) => {
    switch (targetKind) {
      case "path":
        return parameter.kind === "target-path";
      case "member":
        return parameter.kind === "target-member";
      case "variant":
        return parameter.kind === "target-variant";
      default: {
        const exhaustive: never = targetKind;
        return exhaustive;
      }
    }
  });
}

function getContextualSignatures(
  tag: ParsedCommentTag,
  signatures: readonly TagSignature[]
): readonly TagSignature[] {
  const target = tag.target;
  if (target === null) {
    const untargeted = signatures.filter((signature) => !hasExplicitTarget(signature));
    return untargeted.length > 0 ? untargeted : signatures;
  }

  if (target.kind === "ambiguous") {
    return signatures;
  }

  const targetKind = target.kind;
  const targeted = signatures.filter((signature) => matchesTargetKind(signature, targetKind));
  return targeted.length > 0 ? targeted : signatures;
}

function getCompatiblePathTargetsForSignatures(
  signatures: readonly TagSignature[],
  checker: ts.TypeChecker | undefined,
  subjectType: ts.Type | undefined
): readonly string[] {
  if (checker === undefined || subjectType === undefined) {
    return [];
  }

  const suggestions = new Set<string>();
  for (const signature of signatures) {
    for (const parameter of signature.parameters) {
      if (parameter.kind !== "target-path" || parameter.capability === undefined) {
        continue;
      }

      for (const target of collectCompatiblePathTargets(
        subjectType,
        checker,
        parameter.capability
      )) {
        suggestions.add(target);
      }
    }
  }

  return [...suggestions].sort();
}

function getSupportedTargets(signatures: readonly TagSignature[]): readonly FormSpecTargetKind[] {
  const supportedTargets = new Set<FormSpecTargetKind>(["none"]);

  for (const signature of signatures) {
    for (const parameter of signature.parameters) {
      switch (parameter.kind) {
        case "target-path":
          supportedTargets.add("path");
          break;
        case "target-member":
          supportedTargets.add("member");
          break;
        case "target-variant":
          supportedTargets.add("variant");
          break;
        default:
          break;
      }
    }
  }

  return [...supportedTargets];
}

function getTargetCompletions(
  signatures: readonly TagSignature[],
  compatiblePathTargets: readonly string[],
  memberCompletions: readonly string[] = []
): readonly string[] {
  const completions = new Set<string>();

  for (const signature of signatures) {
    for (const parameter of signature.parameters) {
      switch (parameter.kind) {
        case "target-path":
          for (const target of compatiblePathTargets) {
            completions.add(target);
          }
          break;
        case "target-member":
          for (const member of memberCompletions) {
            completions.add(member);
          }
          break;
        case "target-variant":
          completions.add("singular");
          completions.add("plural");
          break;
        default:
          break;
      }
    }
  }

  return [...completions];
}

function getDiscriminatorTargetCompletions(
  options?: CommentSemanticContextOptions
): readonly string[] {
  if (options?.checker === undefined || options.declaration === undefined) {
    return [];
  }

  return getDirectPropertyTargets(options.declaration, options.checker).map(
    (target) => target.name
  );
}

function getDiscriminatorArgumentCompletions(
  options?: CommentSemanticContextOptions
): readonly string[] {
  if (options?.declaration === undefined) {
    return [];
  }

  return getDeclarationTypeParameterNames(options.declaration);
}

export function getCommentTagSemanticContext(
  tag: ParsedCommentTag,
  options?: CommentSemanticContextOptions
): CommentTagSemanticContext {
  const tagDefinition = getTagDefinition(tag.normalizedTagName, options?.extensions);
  const signatures = filterSignaturesByPlacement(
    tagDefinition?.signatures ?? [],
    options?.placement
  );
  const compatiblePathTargets =
    tagDefinition?.canonicalName === "discriminator"
      ? getDiscriminatorTargetCompletions(options)
      : getCompatiblePathTargetsForSignatures(signatures, options?.checker, options?.subjectType);
  const memberCompletions =
    options?.subjectType !== undefined ? getEnumMemberCompletions(options.subjectType) : [];
  const targetCompletions =
    tagDefinition?.canonicalName === "discriminator"
      ? compatiblePathTargets
      : getTargetCompletions(signatures, compatiblePathTargets, memberCompletions);
  const contextualSignatures = getContextualSignatures(tag, signatures);

  const semantic: CommentTagSemanticContext = {
    tag,
    tagDefinition,
    placement: options?.placement ?? null,
    signatures,
    contextualSignatures,
    supportedTargets: getSupportedTargets(signatures),
    targetCompletions,
    compatiblePathTargets,
    valueLabels: getValueLabels(signatures),
    argumentCompletions:
      tagDefinition?.canonicalName === "discriminator"
        ? getDiscriminatorArgumentCompletions(options)
        : [],
    contextualTagHoverMarkdown: null,
    tagHoverMarkdown: tagDefinition?.hoverMarkdown ?? null,
    targetHoverMarkdown: null,
    argumentHoverMarkdown: null,
  };

  return {
    ...semantic,
    contextualTagHoverMarkdown: buildContextualTagHoverMarkdown(semantic),
    targetHoverMarkdown: buildTargetHoverMarkdown(semantic),
    argumentHoverMarkdown: buildArgumentHoverMarkdown(semantic),
  };
}

function getValueLabels(signatures: readonly TagSignature[]): readonly string[] {
  const labels = new Set<string>();
  for (const signature of signatures) {
    for (const parameter of signature.parameters) {
      if (parameter.kind === "value") {
        labels.add(parameter.label);
      }
    }
  }
  return [...labels];
}

function getTargetKindLabels(supportedTargets: readonly FormSpecTargetKind[]): string {
  const labels = supportedTargets
    .filter((kind): kind is Exclude<FormSpecTargetKind, "none"> => kind !== "none")
    .map((kind) => `\`${kind}\``);
  return labels.length === 0 ? "none" : labels.join(", ");
}

function buildContextualTagHoverMarkdown(semantic: CommentTagSemanticContext): string | null {
  if (semantic.tagDefinition === null) {
    return null;
  }

  const signatureLines =
    semantic.contextualSignatures.length === 1
      ? [`**Relevant usage here:** \`${semantic.contextualSignatures[0]?.label ?? ""}\``]
      : semantic.contextualSignatures.length > 1
        ? [
            "**Relevant usages here:**",
            ...semantic.contextualSignatures.map((signature) => `- \`${signature.label}\``),
          ]
        : [];

  return [
    `**@${semantic.tagDefinition.canonicalName}**`,
    "",
    semantic.tagDefinition.hoverSummary,
    ...(signatureLines.length > 0 ? ["", ...signatureLines] : []),
  ].join("\n");
}

function buildTargetHoverMarkdown(semantic: CommentTagSemanticContext): string | null {
  if (semantic.tagDefinition === null) {
    return null;
  }

  const currentTarget = semantic.tag.target?.rawText ?? "";
  const lines = [
    `**Target for @${semantic.tagDefinition.canonicalName}**`,
    "",
    `Supported target forms: ${getTargetKindLabels(semantic.supportedTargets)}`,
  ];

  if (currentTarget !== "") {
    lines.push("", `Current target: \`:${currentTarget}\``);
  }

  const MAX_HOVER_PATH_TARGETS = 8;
  if (semantic.compatiblePathTargets.length > 0) {
    lines.push("", "**Compatible path targets:**");
    for (const target of semantic.compatiblePathTargets.slice(0, MAX_HOVER_PATH_TARGETS)) {
      lines.push(`- \`:${target}\``);
    }
  } else if (semantic.supportedTargets.includes("variant")) {
    lines.push("", "Use `:singular` or `:plural` for variant-specific names.");
  } else if (semantic.supportedTargets.includes("path")) {
    lines.push(
      "",
      "Type-aware path completions become available when TypeScript binding is provided."
    );
  }

  return lines.join("\n");
}

function buildArgumentHoverMarkdown(semantic: CommentTagSemanticContext): string | null {
  if (semantic.tagDefinition === null) {
    return null;
  }

  const valueLabels = getValueLabels(semantic.contextualSignatures);
  const formattedValueLabels = valueLabels.map((label) => `\`${label}\``);
  const formattedArgumentCompletions = semantic.argumentCompletions.map((label) => `\`${label}\``);
  const soleSignature =
    semantic.contextualSignatures.length === 1 ? semantic.contextualSignatures[0] : undefined;
  const signatureLines =
    semantic.contextualSignatures.length === 0
      ? []
      : soleSignature !== undefined
        ? [`**Signature:** \`${soleSignature.label}\``]
        : [
            "**Signatures:**",
            ...semantic.contextualSignatures.map((signature) => `- \`${signature.label}\``),
          ];

  return [
    `**Argument for @${semantic.tagDefinition.canonicalName}**`,
    "",
    `Expected value: ${formattedValueLabels.join(" or ") || "`<value>`"}`,
    ...(formattedArgumentCompletions.length > 0
      ? ["", `Local type parameters: ${formattedArgumentCompletions.join(" or ")}`]
      : []),
    "",
    ...signatureLines,
  ].join("\n");
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

    if (tag.colonSpan !== null && offset >= tag.colonSpan.start && offset <= tag.colonSpan.end) {
      return {
        kind: "colon",
        tag,
      };
    }

    if (tag.target !== null && offset >= tag.target.span.start && offset <= tag.target.span.end) {
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

/**
 * Resolves the completion context at a document offset, upgrading syntax-only
 * results with placement/type-aware semantics when TypeScript binding data is
 * available.
 */
export function getSemanticCommentCompletionContextAtOffset(
  documentText: string,
  offset: number,
  options?: CommentSemanticContextOptions
): SemanticCommentCompletionContext {
  const prefix = getTagCompletionPrefixAtOffset(documentText, offset);
  if (prefix !== null) {
    return {
      kind: "tag-name",
      prefix,
      availableTags: getAllTagDefinitions(options?.extensions),
    };
  }

  const target = getCommentCursorTargetAtOffset(
    documentText,
    offset,
    options?.extensions ? { extensions: options.extensions } : undefined
  );
  if (target?.kind === "target" || target?.kind === "colon") {
    return {
      kind: "target",
      semantic: getCommentTagSemanticContext(target.tag, options),
    };
  }

  if (target?.kind === "argument") {
    const semantic = getCommentTagSemanticContext(target.tag, options);
    return {
      kind: "argument",
      semantic,
      valueLabels: semantic.valueLabels,
    };
  }

  return { kind: "none" };
}

/**
 * Returns hover information for the comment token under the given document
 * offset, including semantic target/argument help when binding data is
 * available.
 */
export function getCommentHoverInfoAtOffset(
  documentText: string,
  offset: number,
  options?: CommentSemanticContextOptions
): CommentHoverInfo | null {
  const target = getCommentCursorTargetAtOffset(
    documentText,
    offset,
    options?.extensions ? { extensions: options.extensions } : undefined
  );
  if (target === null) {
    return null;
  }

  const semantic = getCommentTagSemanticContext(target.tag, options);
  let markdown: string | null = null;

  switch (target.kind) {
    case "tag-name":
      markdown = semantic.contextualTagHoverMarkdown ?? semantic.tagHoverMarkdown;
      break;
    case "colon":
    case "target":
      markdown = semantic.targetHoverMarkdown;
      break;
    case "argument":
      markdown = semantic.argumentHoverMarkdown;
      break;
    default: {
      const exhaustive: never = target.kind;
      void exhaustive;
      break;
    }
  }

  return markdown === null
    ? null
    : {
        kind: target.kind === "colon" ? "target" : target.kind,
        markdown,
      };
}
