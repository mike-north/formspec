import type {
  MetadataAnalysisResult,
  MetadataApplicableSlot,
  MetadataDeclarationKind,
  MetadataPolicyInput,
  MetadataResolvedEntry,
  MetadataSlotInferenceFn,
  ResolvedMetadata,
  ResolvedScalarMetadata,
  ExtensionDefinition,
} from "@formspec/core";
import * as ts from "typescript";
import { parseCommentBlock } from "./comment-syntax.js";
import { resolveDeclarationPlacement } from "./ts-binding.js";

/**
 * Common options for shared metadata analysis entry points.
 *
 * @public
 */
export interface AnalyzeMetadataOptions {
  /** Caller-owned TypeScript program used for analysis. */
  readonly program: ts.Program;
  /** Optional built-in metadata policy for apiName/displayName resolution. */
  readonly metadata?: MetadataPolicyInput | undefined;
  /** Optional extension definitions contributing additional metadata slots. */
  readonly extensions?: readonly ExtensionDefinition[] | undefined;
}

/**
 * Options for analyzing one declaration node.
 *
 * @public
 */
export interface AnalyzeMetadataForNodeOptions extends AnalyzeMetadataOptions {
  /** Declaration node to analyze. */
  readonly node: ts.Node;
}

/**
 * Options for analyzing all supported declarations in one source file.
 *
 * @public
 */
export interface AnalyzeMetadataForSourceFileOptions extends AnalyzeMetadataOptions {
  /** Source file whose declarations should be analyzed. */
  readonly sourceFile: ts.SourceFile;
}

/**
 * Internal options for callers that already own a type checker.
 *
 * @internal
 */
export interface AnalyzeMetadataWithCheckerOptions {
  readonly program?: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly node: ts.Node;
  readonly metadata?: MetadataPolicyInput | undefined;
  readonly extensions?: readonly ExtensionDefinition[] | undefined;
}

interface NormalizedMetadataSlotQualifier {
  readonly qualifier: string;
  readonly sourceQualifier?: string;
  readonly inferValue?: MetadataSlotInferenceFn;
}

interface NormalizedMetadataSlot {
  readonly slotId: string;
  readonly tagName: string;
  readonly declarationKinds: readonly MetadataDeclarationKind[];
  readonly allowBare: boolean;
  readonly qualifiers: readonly NormalizedMetadataSlotQualifier[];
  readonly primaryQualifierAliases: readonly string[];
  readonly inferValue?: MetadataSlotInferenceFn;
  readonly isApplicable?:
    | ((context: {
        readonly surface: "tsdoc";
        readonly declarationKind: MetadataDeclarationKind;
        readonly logicalName: string;
        readonly buildContext?: unknown;
      }) => boolean)
    | undefined;
}

interface ExplicitEntryCandidate {
  readonly value: string;
  readonly qualifier?: string;
}

function getLogicalName(node: ts.Node): string | null {
  if (
    (ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isVariableDeclaration(node)) &&
    node.name !== undefined
  ) {
    if (ts.isIdentifier(node.name)) {
      return node.name.text;
    }
    if (ts.isStringLiteralLike(node.name) || ts.isNumericLiteral(node.name)) {
      return node.name.text;
    }
  }

  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isParameter(node)) {
    if (ts.isIdentifier(node.name)) {
      return node.name.text;
    }
    if (ts.isStringLiteralLike(node.name) || ts.isNumericLiteral(node.name)) {
      return node.name.text;
    }
  }

  return null;
}

function getMetadataDeclarationKind(node: ts.Node): MetadataDeclarationKind | null {
  const placement = resolveDeclarationPlacement(node);
  switch (placement) {
    case "class":
    case "interface":
    case "type-alias":
      return "type";
    case "class-field":
    case "interface-field":
    case "type-alias-field":
    case "variable":
    case "function-parameter":
    case "method-parameter":
      return "field";
    case "class-method":
    case "function":
      return "method";
    default:
      return null;
  }
}

function toResolvedScalar(
  entry: MetadataResolvedEntry | undefined
): ResolvedScalarMetadata | undefined {
  return entry === undefined ? undefined : { value: entry.value, source: entry.source };
}

function toBuiltInResolvedMetadata(
  entries: readonly MetadataResolvedEntry[]
): ResolvedMetadata | undefined {
  const apiName = toResolvedScalar(
    entries.find((entry) => entry.slotId === "apiName" && entry.qualifier === undefined)
  );
  const displayName = toResolvedScalar(
    entries.find((entry) => entry.slotId === "displayName" && entry.qualifier === undefined)
  );
  const apiNamePlural = toResolvedScalar(
    entries.find((entry) => entry.slotId === "apiName" && entry.qualifier === "plural")
  );
  const displayNamePlural = toResolvedScalar(
    entries.find((entry) => entry.slotId === "displayName" && entry.qualifier === "plural")
  );

  if (
    apiName === undefined &&
    displayName === undefined &&
    apiNamePlural === undefined &&
    displayNamePlural === undefined
  ) {
    return undefined;
  }

  return {
    ...(apiName !== undefined && { apiName }),
    ...(displayName !== undefined && { displayName }),
    ...(apiNamePlural !== undefined && { apiNamePlural }),
    ...(displayNamePlural !== undefined && { displayNamePlural }),
  };
}

function normalizeBuiltInSlots(
  metadata: MetadataPolicyInput | undefined
): readonly NormalizedMetadataSlot[] {
  const declarationKinds: readonly MetadataDeclarationKind[] = ["type", "field", "method"];
  const qualifierNames = ["singular", "plural"] as const;
  const builtInPolicyByKind = {
    type: metadata?.type,
    field: metadata?.field,
    method: metadata?.method,
  } as const;

  const createSlot = (
    slotId: "apiName" | "displayName",
    tagName: "apiName" | "displayName"
  ): NormalizedMetadataSlot => ({
    slotId,
    tagName,
    declarationKinds,
    allowBare: true,
    primaryQualifierAliases: ["singular"],
    inferValue: (context: Parameters<MetadataSlotInferenceFn>[0]) => {
      const input = builtInPolicyByKind[context.declarationKind]?.[slotId];
      return input?.mode === "infer-if-missing" ? input.infer(context) : "";
    },
    qualifiers: qualifierNames.map((qualifier) => ({
      qualifier,
      ...(qualifier === "plural"
        ? {
            sourceQualifier: "singular",
            inferValue: (context: Parameters<MetadataSlotInferenceFn>[0]) => {
              const input = builtInPolicyByKind[context.declarationKind]?.[slotId];
              if (
                input?.pluralization?.mode !== "infer-if-missing" ||
                context.baseValue === undefined
              ) {
                return "";
              }

              return input.pluralization.inflect({
                surface: context.surface,
                declarationKind: context.declarationKind,
                logicalName: context.logicalName,
                singular: context.baseValue,
                ...(context.buildContext !== undefined && { buildContext: context.buildContext }),
              });
            },
          }
        : {}),
    })),
  });

  return [createSlot("apiName", "apiName"), createSlot("displayName", "displayName")];
}

function normalizeExtensionSlots(
  extensions: readonly ExtensionDefinition[] | undefined
): readonly NormalizedMetadataSlot[] {
  return (
    extensions?.flatMap((extension) =>
      (extension.metadataSlots ?? []).map((slot) => ({
        slotId: slot.slotId,
        tagName: slot.tagName,
        declarationKinds: slot.declarationKinds,
        allowBare: slot.allowBare !== false,
        primaryQualifierAliases: slot.allowBare === false ? [] : ["singular"],
        ...(slot.inferValue !== undefined && { inferValue: slot.inferValue }),
        ...(slot.isApplicable !== undefined && { isApplicable: slot.isApplicable }),
        qualifiers:
          slot.qualifiers?.map((qualifier) => ({
            qualifier: qualifier.qualifier,
            ...(qualifier.sourceQualifier !== undefined && {
              sourceQualifier: qualifier.sourceQualifier,
            }),
            ...(qualifier.inferValue !== undefined && { inferValue: qualifier.inferValue }),
          })) ?? [],
      }))
    ) ?? []
  );
}

function getApplicableSlots(
  node: ts.Node,
  declarationKind: MetadataDeclarationKind,
  logicalName: string,
  metadata: MetadataPolicyInput | undefined,
  extensions: readonly ExtensionDefinition[] | undefined,
  buildContext: unknown
): readonly NormalizedMetadataSlot[] {
  return [...normalizeBuiltInSlots(metadata), ...normalizeExtensionSlots(extensions)].filter(
    (slot) =>
      slot.declarationKinds.includes(declarationKind) &&
      (slot.isApplicable?.({
        surface: "tsdoc",
        declarationKind,
        logicalName,
        buildContext: {
          node,
          ...(buildContext !== undefined && typeof buildContext === "object" ? buildContext : {}),
        },
      }) ??
        true)
  );
}

function toApplicableSlot(slot: NormalizedMetadataSlot): MetadataApplicableSlot {
  return {
    slotId: slot.slotId,
    tagName: slot.tagName,
    allowBare: slot.allowBare,
    qualifiers: slot.qualifiers.map((qualifier) => qualifier.qualifier),
  };
}

function collectExplicitCandidates(
  node: ts.Node,
  slots: readonly NormalizedMetadataSlot[],
  extensions: readonly ExtensionDefinition[] | undefined
): {
  readonly primaryEntries: ReadonlyMap<string, ExplicitEntryCandidate>;
  readonly qualifiedEntries: ReadonlyMap<string, ExplicitEntryCandidate>;
} {
  const primaryEntries = new Map<string, ExplicitEntryCandidate>();
  const qualifiedEntries = new Map<string, ExplicitEntryCandidate>();
  const slotsByTagName = new Map(slots.map((slot) => [slot.tagName, slot] as const));
  const sourceFile = node.getSourceFile();
  const commentRanges = ts.getLeadingCommentRanges(sourceFile.text, node.getFullStart()) ?? [];

  for (const range of commentRanges) {
    if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
      continue;
    }

    const commentText = sourceFile.text.slice(range.pos, range.end);
    if (!commentText.startsWith("/**")) {
      continue;
    }

    const parsed = parseCommentBlock(commentText, {
      offset: range.pos,
      extensions:
        extensions?.map((extension) => ({
          extensionId: extension.extensionId,
          ...(extension.constraintTags !== undefined
            ? {
                constraintTags: extension.constraintTags.map((tag) => ({ tagName: tag.tagName })),
              }
            : {}),
          ...(extension.metadataSlots !== undefined
            ? {
                metadataSlots: extension.metadataSlots,
              }
            : {}),
        })) ?? [],
    });

    for (const tag of parsed.tags) {
      const slot = slotsByTagName.get(tag.normalizedTagName);
      const value = tag.argumentText.trim();
      if (slot === undefined || value === "") {
        continue;
      }

      const qualifier = tag.target?.rawText;
      if (qualifier === undefined) {
        if (slot.allowBare && !primaryEntries.has(slot.slotId)) {
          primaryEntries.set(slot.slotId, {
            value,
          });
        }
        continue;
      }

      if (slot.primaryQualifierAliases.includes(qualifier)) {
        if (!primaryEntries.has(slot.slotId)) {
          primaryEntries.set(slot.slotId, {
            value,
            qualifier,
          });
        }
        continue;
      }

      if (!slot.qualifiers.some((candidate) => candidate.qualifier === qualifier)) {
        continue;
      }

      const key = `${slot.slotId}:${qualifier}`;
      if (!qualifiedEntries.has(key)) {
        qualifiedEntries.set(key, {
          value,
          qualifier,
        });
      }
    }
  }

  return { primaryEntries, qualifiedEntries };
}

function inferEntry(
  slot: NormalizedMetadataSlot,
  declarationKind: MetadataDeclarationKind,
  logicalName: string,
  qualifier: string | undefined,
  buildContext: unknown,
  inferValue: MetadataSlotInferenceFn | undefined,
  baseValue: string | undefined
): MetadataResolvedEntry | null {
  if (inferValue === undefined) {
    return null;
  }

  const value = inferValue({
    surface: "tsdoc",
    declarationKind,
    logicalName,
    slotId: slot.slotId,
    tagName: slot.tagName,
    ...(qualifier !== undefined && { qualifier }),
    ...(baseValue !== undefined && { baseValue }),
    ...(buildContext !== undefined && { buildContext }),
  }).trim();

  return value === ""
    ? null
    : {
        slotId: slot.slotId,
        tagName: slot.tagName,
        ...(qualifier !== undefined && { qualifier }),
        value,
        source: "inferred",
      };
}

function resolveSlotEntries(
  slot: NormalizedMetadataSlot,
  declarationKind: MetadataDeclarationKind,
  logicalName: string,
  explicit: {
    readonly primaryEntries: ReadonlyMap<string, ExplicitEntryCandidate>;
    readonly qualifiedEntries: ReadonlyMap<string, ExplicitEntryCandidate>;
  },
  buildContext: unknown
): readonly MetadataResolvedEntry[] {
  const entries: MetadataResolvedEntry[] = [];
  const primaryExplicit = explicit.primaryEntries.get(slot.slotId);
  const primaryEntry =
    primaryExplicit !== undefined
      ? ({
          slotId: slot.slotId,
          tagName: slot.tagName,
          value: primaryExplicit.value,
          source: "explicit",
        } satisfies MetadataResolvedEntry)
      : inferEntry(
          slot,
          declarationKind,
          logicalName,
          undefined,
          buildContext,
          slot.inferValue,
          undefined
        );

  if (primaryEntry !== null) {
    entries.push(primaryEntry);
  }

  for (const qualifier of slot.qualifiers) {
    if (slot.primaryQualifierAliases.includes(qualifier.qualifier)) {
      continue;
    }

    const explicitKey = `${slot.slotId}:${qualifier.qualifier}`;
    const explicitQualified = explicit.qualifiedEntries.get(explicitKey);
    if (explicitQualified !== undefined) {
      entries.push({
        slotId: slot.slotId,
        tagName: slot.tagName,
        qualifier: qualifier.qualifier,
        value: explicitQualified.value,
        source: "explicit",
      });
      continue;
    }

    const sourceEntry =
      qualifier.sourceQualifier === undefined
        ? primaryEntry
        : (entries.find(
            (entry) => entry.slotId === slot.slotId && entry.qualifier === qualifier.sourceQualifier
          ) ??
          (slot.primaryQualifierAliases.includes(qualifier.sourceQualifier) || slot.allowBare
            ? primaryEntry
            : undefined));
    const inferred = inferEntry(
      slot,
      declarationKind,
      logicalName,
      qualifier.qualifier,
      buildContext,
      qualifier.inferValue,
      sourceEntry?.value
    );
    if (inferred !== null) {
      entries.push(inferred);
    }
  }

  return entries;
}

export function analyzeMetadataForNodeWithChecker(
  options: AnalyzeMetadataWithCheckerOptions
): MetadataAnalysisResult | null {
  const declarationKind = getMetadataDeclarationKind(options.node);
  const logicalName = getLogicalName(options.node);
  if (declarationKind === null || logicalName === null) {
    return null;
  }

  const buildContext = {
    ...(options.program !== undefined && { program: options.program }),
    checker: options.checker,
    node: options.node,
    sourceFile: options.node.getSourceFile(),
  };
  const applicableSlots = getApplicableSlots(
    options.node,
    declarationKind,
    logicalName,
    options.metadata,
    options.extensions,
    buildContext
  );
  const explicit = collectExplicitCandidates(options.node, applicableSlots, options.extensions);
  const entries = applicableSlots.flatMap((slot) =>
    resolveSlotEntries(slot, declarationKind, logicalName, explicit, buildContext)
  );

  return {
    declarationKind,
    logicalName,
    applicableSlots: applicableSlots.map((slot) => toApplicableSlot(slot)),
    entries,
    resolvedMetadata: toBuiltInResolvedMetadata(entries),
  };
}

/**
 * Analyze shared metadata semantics for a single declaration node.
 *
 * @public
 */
export function analyzeMetadataForNode(
  options: AnalyzeMetadataForNodeOptions
): MetadataAnalysisResult | null {
  return analyzeMetadataForNodeWithChecker({
    program: options.program,
    checker: options.program.getTypeChecker(),
    node: options.node,
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
    ...(options.extensions !== undefined ? { extensions: options.extensions } : {}),
  });
}

/**
 * Analyze shared metadata semantics for all supported declarations in a source file.
 *
 * @public
 */
export function analyzeMetadataForSourceFile(
  options: AnalyzeMetadataForSourceFileOptions
): readonly MetadataAnalysisResult[] {
  const results: MetadataAnalysisResult[] = [];
  const checker = options.program.getTypeChecker();

  const visit = (node: ts.Node): void => {
    const analyzed = analyzeMetadataForNodeWithChecker({
      program: options.program,
      checker,
      node,
      ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
      ...(options.extensions !== undefined ? { extensions: options.extensions } : {}),
    });
    if (analyzed !== null) {
      results.push(analyzed);
    }
    ts.forEachChild(node, visit);
  };

  visit(options.sourceFile);
  return results;
}
