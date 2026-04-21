import type { ExtensionDefinition } from "@formspec/core";
import * as ts from "typescript";
import {
  checkSyntheticTagApplicationsDetailed,
  lowerTagApplicationToSyntheticCall,
} from "./compiler-signatures.js";
import {
  extractCommentBlockTagTexts,
  extractCommentSummaryText,
  parseCommentBlock,
  sliceCommentSpan,
  type CommentSpan,
} from "./comment-syntax.js";
import {
  getCommentTagSemanticContext,
  type CommentSemanticContextOptions,
} from "./cursor-context.js";
import { analyzeMetadataForNodeWithChecker } from "./metadata-analysis.js";
import { extractPathTarget } from "./path-target.js";
import { getHostType, getLastLeadingDocCommentRange, getSubjectType } from "./source-bindings.js";
import {
  getDeclarationTypeParameterNames,
  getDirectPropertyTargets,
  getVisibleTypeParameterNames,
} from "./source-bindings.js";
import {
  computeFormSpecTextHash,
  type FormSpecAnalysisDeclarationSummary,
  serializeParsedCommentTag,
  type FormSpecAnalysisCommentSnapshot,
  type FormSpecAnalysisDiagnostic,
  type FormSpecAnalysisFileSnapshot,
  type FormSpecSerializedDeclarationFact,
  type FormSpecSerializedJsonValue,
  type FormSpecSerializedMetadataEntry,
  type FormSpecSerializedResolvedMetadata,
  type FormSpecSerializedResolvedScalarMetadata,
} from "./semantic-protocol.js";
import {
  getFormSpecPerformanceNow,
  optionalMeasure,
  type FormSpecPerformanceRecorder,
} from "./perf-tracing.js";
import {
  parseConstraintTagValue,
  parseDefaultValueTagValue,
  type ConstraintTagParseRegistryLike,
} from "./tag-value-parser.js";
import {
  normalizeFormSpecTagName,
  type ExtensionTagSource,
  type FormSpecPlacement,
} from "./tag-registry.js";
import {
  hasTypeSemanticCapability,
  resolveDeclarationPlacement,
  resolvePathTargetType,
  stripNullishUnion,
} from "./ts-binding.js";
import { noopLogger } from "@formspec/core";
import { isBuiltinConstraintName } from "@formspec/core/internals";
import {
  getSnapshotLogger,
  getSyntheticLogger,
  getTypedParserLogger,
  describeTypeKind,
  logTagApplication,
  nowMicros,
  elapsedMicros,
  type ConstraintValidatorRoleOutcome,
} from "./constraint-validator-logger.js";
import {
  extractEffectiveArgumentText,
  mapTypedParserDiagnosticCode,
  parseTagArgument,
} from "./tag-argument-parser.js";
import { _isIntegerBrandedType } from "./integer-brand.js";

/**
 * Options used when building a serializable, editor-oriented snapshot for a
 * TypeScript source file.
 */
export interface BuildFormSpecAnalysisFileSnapshotOptions {
  readonly checker: ts.TypeChecker;
  readonly extensions?: readonly ExtensionTagSource[];
  readonly extensionDefinitions?: readonly ExtensionDefinition[];
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

interface NumericConstraintAccumulator {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
}

interface StringConstraintAccumulator {
  minLength?: number;
  maxLength?: number;
  patterns: string[];
}

interface ArrayConstraintAccumulator {
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

function toExtensionTagSources(
  extensionDefinitions: readonly ExtensionDefinition[] | undefined
): readonly ExtensionTagSource[] | undefined {
  if (extensionDefinitions === undefined || extensionDefinitions.length === 0) {
    return undefined;
  }

  return extensionDefinitions.map((extension) => ({
    extensionId: extension.extensionId,
    ...(extension.constraintTags === undefined
      ? {}
      : {
          constraintTags: extension.constraintTags.map((tag) => ({
            tagName: normalizeFormSpecTagName(tag.tagName),
          })),
        }),
    ...(extension.metadataSlots === undefined ? {} : { metadataSlots: extension.metadataSlots }),
    ...(extension.types === undefined
      ? {}
      : {
          customTypes: extension.types.map((type) => ({
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- file-snapshots is the name-based detection bridge; it must read tsTypeNames until that mechanism is fully replaced by symbol-based detection
            tsTypeNames: type.tsTypeNames ?? [type.typeName],
          })),
        }),
  }));
}

function createConstraintTagRegistry(
  extensionDefinitions: readonly ExtensionDefinition[] | undefined
): ConstraintTagParseRegistryLike | undefined {
  if (extensionDefinitions === undefined || extensionDefinitions.length === 0) {
    return undefined;
  }

  return {
    extensions: extensionDefinitions,
    findConstraint(constraintId) {
      for (const extension of extensionDefinitions) {
        for (const constraint of extension.constraints ?? []) {
          if (`${extension.extensionId}/${constraint.constraintName}` === constraintId) {
            return constraint;
          }
        }
      }
      return undefined;
    },
    findConstraintTag(tagName) {
      const normalizedTagName = normalizeFormSpecTagName(tagName);
      for (const extension of extensionDefinitions) {
        for (const registration of extension.constraintTags ?? []) {
          if (normalizeFormSpecTagName(registration.tagName) === normalizedTagName) {
            return {
              extensionId: extension.extensionId,
              registration,
            };
          }
        }
      }
      return undefined;
    },
    findBuiltinConstraintBroadening(typeId, tagName) {
      const normalizedTagName = normalizeFormSpecTagName(tagName);
      for (const extension of extensionDefinitions) {
        for (const type of extension.types ?? []) {
          if (type.typeName !== typeId) {
            continue;
          }

          for (const registration of type.builtinConstraintBroadenings ?? []) {
            if (normalizeFormSpecTagName(registration.tagName) === normalizedTagName) {
              return {
                extensionId: extension.extensionId,
                registration,
              };
            }
          }
        }
      }
      return undefined;
    },
  };
}

/**
 * §4 Phase 3 — snapshot-path broadening check.
 *
 * Returns `true` when the given builtin constraint tag has a registered
 * broadening for the field's TypeScript type. When broadening is active the
 * tag application bypasses Role C (typed-argument validation) and proceeds
 * directly to the synthetic batch, which routes it to D1/D2 handling.
 *
 * This mirrors the build path's `hasBuiltinConstraintBroadening` function in
 * `tsdoc-parser.ts`, adapted for the snapshot consumer's data model:
 *   - The build path holds a full `ExtensionRegistry` with `fieldType` IR data.
 *   - The snapshot path holds `ExtensionDefinition[]` with TypeScript type names.
 *   The type is matched by name against `registration.tsTypeNames ?? [typeName]`,
 *   which is the same string-based detection used elsewhere in file-snapshots.ts.
 *
 * The _isIntegerBrandedType bypass is handled in buildTagDiagnostics (Phase 4A,
 * closes #325) before this function is called. This function handles only the
 * extension-registry broadening path.
 */
// TODO(Phase 4/5): consolidate with hasBuiltinConstraintBroadening in
// tsdoc-parser.ts. Same semantic question ("does this tag have a registered
// broadening for this type?"); different data model (TypeScript type-name
// strings here, IR FieldType + ExtensionRegistry there). Unify once symbol-
// based detection replaces name-based detection.
function hasExtensionBroadening(
  tagName: string,
  subjectType: ts.Type,
  checker: ts.TypeChecker,
  extensionDefinitions: readonly ExtensionDefinition[] | undefined
): boolean {
  if (extensionDefinitions === undefined || extensionDefinitions.length === 0) {
    return false;
  }

  // Strip nullish union members (| null | undefined) before name-matching,
  // consistent with how the build path strips before _isIntegerBrandedType.
  const effectiveType = stripNullishUnion(subjectType);
  // Use NoTruncation so that complex types (intersections, deep generics) are
  // rendered in full. Without it, checker.typeToString uses its default truncation
  // threshold (~160 chars) and can produce a structurally-different string than
  // what was registered in tsTypeNames, causing broadening detection to miss.
  const typeName = typeToString(effectiveType, checker);
  if (typeName === null) {
    return false;
  }

  for (const extension of extensionDefinitions) {
    for (const type of extension.types ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- file-snapshots is the name-based detection bridge; it must read tsTypeNames until that mechanism is fully replaced by symbol-based detection
      const registeredNames = type.tsTypeNames ?? [type.typeName];
      if (!registeredNames.includes(typeName)) {
        continue;
      }
      for (const broadening of type.builtinConstraintBroadenings ?? []) {
        if (broadening.tagName === tagName) {
          return true;
        }
      }
    }
  }

  return false;
}

function renderTargetLabel(targetPath: string | null): string {
  return targetPath === null ? "Declaration" : `Target \`${targetPath}\``;
}

function spanFromPos(start: number, end: number): CommentSpan {
  return { start, end };
}

function toSerializedResolvedScalarMetadata(
  value:
    | {
        readonly value: string;
        readonly source: "explicit" | "inferred";
      }
    | undefined
): FormSpecSerializedResolvedScalarMetadata | undefined {
  return value === undefined ? undefined : { value: value.value, source: value.source };
}

function toSerializedResolvedMetadata(
  value:
    | {
        readonly apiName?: {
          readonly value: string;
          readonly source: "explicit" | "inferred";
        };
        readonly displayName?: {
          readonly value: string;
          readonly source: "explicit" | "inferred";
        };
        readonly apiNamePlural?: {
          readonly value: string;
          readonly source: "explicit" | "inferred";
        };
        readonly displayNamePlural?: {
          readonly value: string;
          readonly source: "explicit" | "inferred";
        };
      }
    | undefined
): FormSpecSerializedResolvedMetadata | null {
  if (value === undefined) {
    return null;
  }

  return {
    ...(value.apiName === undefined
      ? {}
      : { apiName: toSerializedResolvedScalarMetadata(value.apiName) }),
    ...(value.displayName === undefined
      ? {}
      : { displayName: toSerializedResolvedScalarMetadata(value.displayName) }),
    ...(value.apiNamePlural === undefined
      ? {}
      : { apiNamePlural: toSerializedResolvedScalarMetadata(value.apiNamePlural) }),
    ...(value.displayNamePlural === undefined
      ? {}
      : { displayNamePlural: toSerializedResolvedScalarMetadata(value.displayNamePlural) }),
  };
}

function toSerializedMetadataEntries(
  entries: readonly {
    readonly slotId: string;
    readonly tagName: string;
    readonly qualifier?: string | undefined;
    readonly value: string;
    readonly source: "explicit" | "inferred";
    readonly explicitSource?:
      | {
          readonly tagName: string;
          readonly form: "bare" | "qualified";
          readonly fullRange: { readonly start: number; readonly end: number };
          readonly tagNameRange: { readonly start: number; readonly end: number };
          readonly qualifierRange?: { readonly start: number; readonly end: number } | undefined;
          readonly valueRange: { readonly start: number; readonly end: number };
          readonly qualifier?: string | undefined;
        }
      | undefined;
  }[]
): readonly FormSpecSerializedMetadataEntry[] {
  return entries.map((entry) => ({
    slotId: entry.slotId,
    tagName: entry.tagName,
    ...(entry.qualifier === undefined ? {} : { qualifier: entry.qualifier }),
    value: entry.value,
    source: entry.source,
    ...(entry.explicitSource === undefined
      ? {}
      : {
          explicitSource: {
            tagName: entry.explicitSource.tagName,
            form: entry.explicitSource.form,
            fullRange: entry.explicitSource.fullRange,
            tagNameRange: entry.explicitSource.tagNameRange,
            ...(entry.explicitSource.qualifierRange === undefined
              ? {}
              : { qualifierRange: entry.explicitSource.qualifierRange }),
            valueRange: entry.explicitSource.valueRange,
            ...(entry.explicitSource.qualifier === undefined
              ? {}
              : { qualifier: entry.explicitSource.qualifier }),
          },
        }),
  }));
}

function getTagPayloadText(
  parsed: ReturnType<typeof parseCommentBlock>,
  tag: ReturnType<typeof parseCommentBlock>["tags"][number]
): string {
  if (tag.payloadSpan === null) {
    return "";
  }

  return sliceCommentSpan(parsed.commentText, tag.payloadSpan, { offset: parsed.offset });
}

function getConstraintTargetPath(
  path: { readonly segments: readonly string[] } | undefined
): string | null {
  return path === undefined ? null : path.segments.join(".");
}

function provenanceForTag(
  sourceFile: ts.SourceFile,
  tag: ReturnType<typeof parseCommentBlock>["tags"][number]
): {
  readonly surface: "tsdoc";
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly length: number;
  readonly tagName: string;
} {
  const lineAndCharacter = sourceFile.getLineAndCharacterOfPosition(tag.fullSpan.start);
  return {
    surface: "tsdoc",
    file: sourceFile.fileName,
    line: lineAndCharacter.line + 1,
    column: lineAndCharacter.character,
    length: tag.fullSpan.end - tag.fullSpan.start,
    tagName: `@${tag.normalizedTagName}`,
  };
}

function updateLowerBound(current: number | undefined, next: number): number {
  return current === undefined ? next : Math.max(current, next);
}

function updateUpperBound(current: number | undefined, next: number): number {
  return current === undefined ? next : Math.min(current, next);
}

function buildNumericConstraintFact(
  targetPath: string | null,
  accumulator: NumericConstraintAccumulator
): FormSpecSerializedDeclarationFact | null {
  if (
    accumulator.minimum === undefined &&
    accumulator.maximum === undefined &&
    accumulator.exclusiveMinimum === undefined &&
    accumulator.exclusiveMaximum === undefined &&
    accumulator.multipleOf === undefined
  ) {
    return null;
  }

  return {
    kind: "numeric-constraints",
    targetPath,
    ...(accumulator.minimum === undefined ? {} : { minimum: accumulator.minimum }),
    ...(accumulator.maximum === undefined ? {} : { maximum: accumulator.maximum }),
    ...(accumulator.exclusiveMinimum === undefined
      ? {}
      : { exclusiveMinimum: accumulator.exclusiveMinimum }),
    ...(accumulator.exclusiveMaximum === undefined
      ? {}
      : { exclusiveMaximum: accumulator.exclusiveMaximum }),
    ...(accumulator.multipleOf === undefined ? {} : { multipleOf: accumulator.multipleOf }),
  };
}

function buildStringConstraintFact(
  targetPath: string | null,
  accumulator: StringConstraintAccumulator
): FormSpecSerializedDeclarationFact | null {
  if (
    accumulator.minLength === undefined &&
    accumulator.maxLength === undefined &&
    accumulator.patterns.length === 0
  ) {
    return null;
  }

  return {
    kind: "string-constraints",
    targetPath,
    ...(accumulator.minLength === undefined ? {} : { minLength: accumulator.minLength }),
    ...(accumulator.maxLength === undefined ? {} : { maxLength: accumulator.maxLength }),
    patterns: accumulator.patterns,
  };
}

function buildArrayConstraintFact(
  targetPath: string | null,
  accumulator: ArrayConstraintAccumulator
): FormSpecSerializedDeclarationFact | null {
  if (
    accumulator.minItems === undefined &&
    accumulator.maxItems === undefined &&
    accumulator.uniqueItems === undefined
  ) {
    return null;
  }

  return {
    kind: "array-constraints",
    targetPath,
    ...(accumulator.minItems === undefined ? {} : { minItems: accumulator.minItems }),
    ...(accumulator.maxItems === undefined ? {} : { maxItems: accumulator.maxItems }),
    ...(accumulator.uniqueItems === undefined ? {} : { uniqueItems: accumulator.uniqueItems }),
  };
}

function formatDeclarationFactMarkdown(fact: FormSpecSerializedDeclarationFact): string {
  switch (fact.kind) {
    case "description":
      return fact.value;
    case "remarks":
      return `Remarks: ${fact.value}`;
    case "default-value":
      return `Default: \`${JSON.stringify(fact.value)}\``;
    case "example":
      return `Example: \`${fact.value}\``;
    case "deprecated":
      return fact.message === null ? "Deprecated" : `Deprecated: ${fact.message}`;
    case "numeric-constraints": {
      const parts: string[] = [];
      if (fact.minimum !== undefined) {
        parts.push(`minimum ${String(fact.minimum)}`);
      }
      if (fact.maximum !== undefined) {
        parts.push(`maximum ${String(fact.maximum)}`);
      }
      if (fact.exclusiveMinimum !== undefined) {
        parts.push(`exclusive minimum ${String(fact.exclusiveMinimum)}`);
      }
      if (fact.exclusiveMaximum !== undefined) {
        parts.push(`exclusive maximum ${String(fact.exclusiveMaximum)}`);
      }
      if (fact.multipleOf !== undefined) {
        parts.push(`multiple of ${String(fact.multipleOf)}`);
      }
      return `${renderTargetLabel(fact.targetPath)}: ${parts.join(", ")}`;
    }
    case "string-constraints": {
      const parts: string[] = [];
      if (fact.minLength !== undefined && fact.maxLength !== undefined) {
        parts.push(`length ${String(fact.minLength)}-${String(fact.maxLength)}`);
      } else if (fact.minLength !== undefined) {
        parts.push(`minimum length ${String(fact.minLength)}`);
      } else if (fact.maxLength !== undefined) {
        parts.push(`maximum length ${String(fact.maxLength)}`);
      }
      if (fact.patterns.length > 0) {
        const renderedPatterns = fact.patterns.map((pattern) => `\`${pattern}\``).join(", ");
        parts.push(
          fact.patterns.length === 1
            ? `pattern ${renderedPatterns}`
            : `patterns ${renderedPatterns}`
        );
      }
      return `${renderTargetLabel(fact.targetPath)}: ${parts.join(", ")}`;
    }
    case "array-constraints": {
      const parts: string[] = [];
      if (fact.minItems !== undefined && fact.maxItems !== undefined) {
        parts.push(`items ${String(fact.minItems)}-${String(fact.maxItems)}`);
      } else if (fact.minItems !== undefined) {
        parts.push(`minimum items ${String(fact.minItems)}`);
      } else if (fact.maxItems !== undefined) {
        parts.push(`maximum items ${String(fact.maxItems)}`);
      }
      if (fact.uniqueItems === true) {
        parts.push("unique items");
      }
      return `${renderTargetLabel(fact.targetPath)}: ${parts.join(", ")}`;
    }
    case "allowed-members":
      return `${renderTargetLabel(fact.targetPath)}: allowed members ${fact.members
        .map((member) => `\`${String(member)}\``)
        .join(", ")}`;
    case "const":
      return `${renderTargetLabel(fact.targetPath)}: constant \`${JSON.stringify(fact.value)}\``;
    case "custom-constraint":
      return `${renderTargetLabel(fact.targetPath)}: constraint \`${fact.constraintId}\` = \`${JSON.stringify(fact.payload)}\``;
    default: {
      const exhaustive: never = fact;
      return exhaustive;
    }
  }
}

function buildDeclarationHoverMarkdown(
  summaryText: string | null,
  resolvedMetadata: FormSpecSerializedResolvedMetadata | null,
  facts: readonly FormSpecSerializedDeclarationFact[]
): string {
  const lines: string[] = ["**FormSpec Declaration Summary**"];

  if (resolvedMetadata?.displayName !== undefined) {
    lines.push("", `Display name: \`${resolvedMetadata.displayName.value}\``);
  }
  if (resolvedMetadata?.apiName !== undefined) {
    lines.push("", `API name: \`${resolvedMetadata.apiName.value}\``);
  }
  if (resolvedMetadata?.displayNamePlural !== undefined) {
    lines.push("", `Display name (plural): \`${resolvedMetadata.displayNamePlural.value}\``);
  }
  if (resolvedMetadata?.apiNamePlural !== undefined) {
    lines.push("", `API name (plural): \`${resolvedMetadata.apiNamePlural.value}\``);
  }
  if (summaryText !== null) {
    lines.push("", summaryText);
  }

  const factLines = facts
    .filter((fact) => fact.kind !== "description")
    .map((fact) => `- ${formatDeclarationFactMarkdown(fact)}`);
  if (factLines.length > 0) {
    lines.push("", ...factLines);
  }

  return lines.join("\n");
}

function buildDeclarationSummary(
  node: ts.Node,
  parsed: ReturnType<typeof parseCommentBlock>,
  checker: ts.TypeChecker,
  extensionDefinitions: readonly ExtensionDefinition[] | undefined
): FormSpecAnalysisDeclarationSummary {
  const sourceFile = node.getSourceFile();
  const summaryText = extractCommentSummaryText(parsed.commentText);
  const metadataAnalysis = analyzeMetadataForNodeWithChecker({
    checker,
    node,
    ...(extensionDefinitions === undefined ? {} : { extensions: extensionDefinitions }),
  });
  const resolvedMetadata = toSerializedResolvedMetadata(metadataAnalysis?.resolvedMetadata);
  const metadataEntries = toSerializedMetadataEntries(metadataAnalysis?.entries ?? []);
  const constraintRegistry = createConstraintTagRegistry(extensionDefinitions);
  const numericConstraints = new Map<string | null, NumericConstraintAccumulator>();
  const stringConstraints = new Map<string | null, StringConstraintAccumulator>();
  const arrayConstraints = new Map<string | null, ArrayConstraintAccumulator>();
  const blockTagTexts = new Map(
    ["deprecated", "example", "remarks"].map((tagName) => [
      tagName,
      extractCommentBlockTagTexts(parsed.commentText, tagName),
    ])
  );
  const blockTagIndexes = new Map<string, number>();
  const facts: FormSpecSerializedDeclarationFact[] = [];

  const takeBlockTagText = (tagName: string): string | null => {
    const values = blockTagTexts.get(tagName);
    if (values === undefined) {
      return null;
    }

    const index = blockTagIndexes.get(tagName) ?? 0;
    blockTagIndexes.set(tagName, index + 1);
    return values[index] ?? null;
  };

  if (summaryText !== "") {
    facts.push({
      kind: "description",
      value: summaryText,
    });
  }

  for (const tag of parsed.tags) {
    const payloadText = getTagPayloadText(parsed, tag);
    const constraint = parseConstraintTagValue(
      tag.normalizedTagName,
      payloadText,
      provenanceForTag(sourceFile, tag),
      constraintRegistry === undefined ? undefined : { registry: constraintRegistry }
    );
    if (constraint !== null) {
      const targetPath = getConstraintTargetPath(constraint.path);
      switch (constraint.constraintKind) {
        case "minimum":
        case "exclusiveMinimum":
        case "maximum":
        case "exclusiveMaximum":
        case "multipleOf": {
          const current = numericConstraints.get(targetPath) ?? {};
          switch (constraint.constraintKind) {
            case "minimum":
              current.minimum = updateLowerBound(current.minimum, constraint.value);
              break;
            case "exclusiveMinimum":
              current.exclusiveMinimum = updateLowerBound(
                current.exclusiveMinimum,
                constraint.value
              );
              break;
            case "maximum":
              current.maximum = updateUpperBound(current.maximum, constraint.value);
              break;
            case "exclusiveMaximum":
              current.exclusiveMaximum = updateUpperBound(
                current.exclusiveMaximum,
                constraint.value
              );
              break;
            case "multipleOf":
              current.multipleOf = constraint.value;
              break;
          }
          numericConstraints.set(targetPath, current);
          continue;
        }
        case "minLength":
        case "maxLength":
        case "pattern": {
          const current = stringConstraints.get(targetPath) ?? { patterns: [] };
          switch (constraint.constraintKind) {
            case "minLength":
              current.minLength = updateLowerBound(current.minLength, constraint.value);
              break;
            case "maxLength":
              current.maxLength = updateUpperBound(current.maxLength, constraint.value);
              break;
            case "pattern":
              if (!current.patterns.includes(constraint.pattern)) {
                current.patterns.push(constraint.pattern);
              }
              break;
          }
          stringConstraints.set(targetPath, current);
          continue;
        }
        case "minItems":
        case "maxItems":
        case "uniqueItems": {
          const current = arrayConstraints.get(targetPath) ?? {};
          switch (constraint.constraintKind) {
            case "minItems":
              current.minItems = updateLowerBound(current.minItems, constraint.value);
              break;
            case "maxItems":
              current.maxItems = updateUpperBound(current.maxItems, constraint.value);
              break;
            case "uniqueItems":
              current.uniqueItems = constraint.value;
              break;
          }
          arrayConstraints.set(targetPath, current);
          continue;
        }
        case "allowedMembers":
          facts.push({
            kind: "allowed-members",
            targetPath,
            members: constraint.members,
          });
          continue;
        case "const":
          facts.push({
            kind: "const",
            targetPath,
            value: constraint.value as FormSpecSerializedJsonValue,
          });
          continue;
        case "custom":
          facts.push({
            kind: "custom-constraint",
            targetPath,
            constraintId: constraint.constraintId,
            compositionRule: constraint.compositionRule,
            payload: constraint.payload as FormSpecSerializedJsonValue,
          });
          continue;
        default:
          continue;
      }
    }

    switch (tag.normalizedTagName) {
      case "defaultValue": {
        if (tag.argumentText.trim() === "") {
          break;
        }
        const defaultValue = parseDefaultValueTagValue(
          tag.argumentText,
          provenanceForTag(sourceFile, tag)
        );
        if (defaultValue.annotationKind !== "defaultValue") {
          break;
        }
        facts.push({
          kind: "default-value",
          value: defaultValue.value as FormSpecSerializedJsonValue,
        });
        break;
      }
      case "example": {
        const value = (takeBlockTagText("example") ?? tag.argumentText).trim();
        if (value !== "") {
          facts.push({
            kind: "example",
            value,
          });
        }
        break;
      }
      case "deprecated": {
        const value = (takeBlockTagText("deprecated") ?? tag.argumentText).trim();
        facts.push({
          kind: "deprecated",
          message: value === "" ? null : value,
        });
        break;
      }
      case "remarks": {
        const value = (takeBlockTagText("remarks") ?? tag.argumentText).trim();
        if (value !== "") {
          facts.push({
            kind: "remarks",
            value,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  for (const [targetPath, accumulator] of numericConstraints.entries()) {
    const fact = buildNumericConstraintFact(targetPath, accumulator);
    if (fact !== null) {
      facts.push(fact);
    }
  }

  for (const [targetPath, accumulator] of stringConstraints.entries()) {
    const fact = buildStringConstraintFact(targetPath, accumulator);
    if (fact !== null) {
      facts.push(fact);
    }
  }

  for (const [targetPath, accumulator] of arrayConstraints.entries()) {
    const fact = buildArrayConstraintFact(targetPath, accumulator);
    if (fact !== null) {
      facts.push(fact);
    }
  }

  return {
    summaryText: summaryText === "" ? null : summaryText,
    resolvedMetadata,
    metadataEntries,
    facts,
    hoverMarkdown: buildDeclarationHoverMarkdown(
      summaryText === "" ? null : summaryText,
      resolvedMetadata,
      facts
    ),
  };
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

function isNullableType(type: ts.Type): boolean {
  if (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) {
    return true;
  }

  if (type.isUnion()) {
    return type.types.some(isNullableType);
  }

  return false;
}

function isIdentifierLikeTagOperand(argumentText: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(argumentText.trim());
}

function diagnosticSeverity(code: string): FormSpecAnalysisDiagnostic["severity"] {
  switch (code) {
    case "MISSING_TAG_ARGUMENT":
    case "INVALID_TAG_ARGUMENT":
    case "INVALID_TAG_PLACEMENT":
    case "SYNTHETIC_SETUP_FAILURE":
    case "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE":
    case "TYPE_MISMATCH":
    case "UNKNOWN_PATH_TARGET":
    case "INVALID_PATH_TARGET":
    case "NESTED_PATH_TARGET":
    case "MISSING_TARGET_FIELD":
    case "OPTIONAL_TARGET_FIELD":
    case "NULLABLE_TARGET_FIELD":
    case "NON_STRINGLIKE_TARGET_FIELD":
    case "INVALID_TYPE_PARAMETER_REFERENCE":
    case "NON_LOCAL_TYPE_PARAMETER":
    case "DUPLICATE_TAG":
      return "error";
    default:
      return "warning";
  }
}

function diagnosticCategory(code: string): FormSpecAnalysisDiagnostic["category"] {
  switch (code) {
    case "MISSING_TAG_ARGUMENT":
    case "INVALID_TAG_ARGUMENT":
      return "value-parsing";
    case "INVALID_TAG_PLACEMENT":
    case "SYNTHETIC_SETUP_FAILURE":
    case "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE":
      return "tag-recognition";
    case "TYPE_MISMATCH":
      return "type-compatibility";
    case "UNKNOWN_PATH_TARGET":
      return "target-resolution";
    case "INVALID_PATH_TARGET":
    case "NESTED_PATH_TARGET":
    case "MISSING_TARGET_FIELD":
    case "OPTIONAL_TARGET_FIELD":
    case "NULLABLE_TARGET_FIELD":
    case "NON_STRINGLIKE_TARGET_FIELD":
      return "target-resolution";
    case "INVALID_TYPE_PARAMETER_REFERENCE":
    case "NON_LOCAL_TYPE_PARAMETER":
      return "tag-recognition";
    case "DUPLICATE_TAG":
      return "constraint-validation";
    case "MISSING_SOURCE_FILE":
      return "infrastructure";
    default:
      return "constraint-validation";
  }
}

function combineCommentSpans(spans: readonly CommentSpan[]): CommentSpan | null {
  const firstSpan = spans[0];
  if (firstSpan === undefined) {
    return null;
  }
  return {
    start: firstSpan.start,
    end: spans[spans.length - 1]?.end ?? firstSpan.end,
  };
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

function buildDiscriminatorDiagnostics(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  tag: ReturnType<typeof parseCommentBlock>["tags"][number],
  range: CommentSpan
): FormSpecAnalysisDiagnostic[] {
  const diagnostics: FormSpecAnalysisDiagnostic[] = [];
  const directTargets = new Map(
    getDirectPropertyTargets(node, checker).map((target) => [target.name, target] as const)
  );
  const localTypeParameters = new Set(getDeclarationTypeParameterNames(node));
  const visibleTypeParameters = new Set(getVisibleTypeParameterNames(node));
  const targetText = tag.target?.rawText ?? "";
  const target = tag.target;

  if (target?.kind !== "path") {
    diagnostics.push(
      createAnalysisDiagnostic(
        "INVALID_PATH_TARGET",
        'Tag "@discriminator" requires a direct property path target.',
        range,
        {
          tagName: tag.normalizedTagName,
          targetText,
        }
      )
    );
    return diagnostics;
  }

  if (!target.valid || target.path === null) {
    diagnostics.push(
      createAnalysisDiagnostic(
        "INVALID_PATH_TARGET",
        'Tag "@discriminator" has an invalid path target.',
        range,
        {
          tagName: tag.normalizedTagName,
          targetText,
        }
      )
    );
    return diagnostics;
  }

  if (target.path.segments.length !== 1) {
    diagnostics.push(
      createAnalysisDiagnostic(
        "NESTED_PATH_TARGET",
        'Tag "@discriminator" only supports a single direct property target in v1.',
        range,
        {
          tagName: tag.normalizedTagName,
          targetText,
        }
      )
    );
    return diagnostics;
  }

  const propertyName = target.path.segments[0];
  if (propertyName === undefined) {
    return diagnostics;
  }

  const property = directTargets.get(propertyName);
  if (property === undefined) {
    diagnostics.push(
      createAnalysisDiagnostic(
        "MISSING_TARGET_FIELD",
        `Tag "@discriminator" references unknown target field "${propertyName}".`,
        range,
        {
          tagName: tag.normalizedTagName,
          targetText,
        }
      )
    );
    return diagnostics;
  }

  const propertySpan = spanFromPos(
    property.declaration.getStart(sourceFile),
    property.declaration.getEnd()
  );
  if (property.optional) {
    diagnostics.push(
      createAnalysisDiagnostic(
        "OPTIONAL_TARGET_FIELD",
        `Tag "@discriminator" target field "${propertyName}" must be required.`,
        range,
        {
          tagName: tag.normalizedTagName,
          targetText,
        },
        [
          {
            filePath: sourceFile.fileName,
            range: propertySpan,
            message: "Target field declaration",
          },
        ]
      )
    );
  }

  if (isNullableType(property.type)) {
    diagnostics.push(
      createAnalysisDiagnostic(
        "NULLABLE_TARGET_FIELD",
        `Tag "@discriminator" target field "${propertyName}" must not be nullable.`,
        range,
        {
          tagName: tag.normalizedTagName,
          targetText,
        },
        [
          {
            filePath: sourceFile.fileName,
            range: propertySpan,
            message: "Target field declaration",
          },
        ]
      )
    );
  }

  if (!hasTypeSemanticCapability(property.type, checker, "string-like")) {
    diagnostics.push(
      createAnalysisDiagnostic(
        "NON_STRINGLIKE_TARGET_FIELD",
        `Tag "@discriminator" target field "${propertyName}" must be string-like.`,
        range,
        {
          tagName: tag.normalizedTagName,
          targetText,
          targetKind: property.optional ? "optional" : "required",
        },
        [
          {
            filePath: sourceFile.fileName,
            range: propertySpan,
            message: "Target field declaration",
          },
        ]
      )
    );
  }

  const operand = tag.argumentText.trim();
  if (!isIdentifierLikeTagOperand(operand)) {
    diagnostics.push(
      createAnalysisDiagnostic(
        "INVALID_TYPE_PARAMETER_REFERENCE",
        'Tag "@discriminator" requires a single local type parameter name.',
        range,
        {
          tagName: tag.normalizedTagName,
          targetText,
          argumentText: tag.argumentText,
        }
      )
    );
    return diagnostics;
  }

  if (localTypeParameters.has(operand)) {
    return diagnostics;
  }

  if (visibleTypeParameters.has(operand)) {
    diagnostics.push(
      createAnalysisDiagnostic(
        "NON_LOCAL_TYPE_PARAMETER",
        `Tag "@discriminator" type parameter "${operand}" must be declared on the same declaration.`,
        range,
        {
          tagName: tag.normalizedTagName,
          targetText,
          argumentText: tag.argumentText,
        }
      )
    );
    return diagnostics;
  }

  diagnostics.push(
    createAnalysisDiagnostic(
      "INVALID_TYPE_PARAMETER_REFERENCE",
      `Tag "@discriminator" references unknown type parameter "${operand}".`,
      range,
      {
        tagName: tag.normalizedTagName,
        targetText,
        argumentText: tag.argumentText,
      }
    )
  );
  return diagnostics;
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
  performance: FormSpecPerformanceRecorder | undefined,
  extensionDefinitions: readonly ExtensionDefinition[] | undefined
): FormSpecAnalysisDiagnostic[] {
  if (placement === null || subjectType === undefined) {
    return [];
  }

  const declaredSubjectType = getDeclaredSubjectType(node, checker, subjectType);
  const diagnostics: FormSpecAnalysisDiagnostic[] = [];
  let discriminatorTagCount = 0;
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
  // §8.3b — module-level loggers for the snapshot consumer.
  const snapshotLog = getSnapshotLogger();
  const syntheticLog = getSyntheticLogger();
  const typedParserLog = getTypedParserLogger();
  const snapshotLogsEnabled = snapshotLog !== noopLogger;
  const typedParserTraceEnabled = typedParserLog !== noopLogger;

  const syntheticApplications: {
    readonly tag: (typeof commentTags)[number];
    readonly target: ReturnType<typeof getSyntheticTargetForTag>;
    readonly pathTargetResolution: ReturnType<typeof resolvePathTargetType> | null;
    /** §8.3b — microsecond timestamp when this tag's processing started. */
    readonly tagStartMicros: number;
    /** §8.3b — human-readable subject type kind for the log entry. */
    readonly subjectTypeKindForLog: string;
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

  // subjectType is constant for the whole call (per the early-return guard at
  // the top of this function). Compute the log-friendly kind once, and only
  // when structured logging is actually enabled — describeTypeKind is cheap
  // but this runs on every snapshot diagnostic pass.
  const subjectTypeKindForLog = snapshotLogsEnabled ? describeTypeKind(subjectType, checker) : "";

  for (const tag of commentTags) {
    const semantic = getCommentTagSemanticContext(tag, semanticOptions);
    if (semantic.tagDefinition === null) {
      continue;
    }

    if (tag.normalizedTagName === "discriminator") {
      discriminatorTagCount += 1;
      if (discriminatorTagCount > 1) {
        diagnostics.push(
          createAnalysisDiagnostic(
            "DUPLICATE_TAG",
            'Duplicate "@discriminator" tag. Only one discriminator declaration is allowed.',
            tag.fullSpan,
            {
              tagName: tag.normalizedTagName,
            }
          )
        );
        continue;
      }

      diagnostics.push(
        ...buildDiscriminatorDiagnostics(node, sourceFile, checker, tag, tag.fullSpan)
      );
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

    // §8.3b — record per-tag start time; subjectTypeKindForLog is hoisted
    // above the loop. Both are only consumed when logging is enabled.
    const tagStartMicros = snapshotLogsEnabled ? nowMicros() : 0;

    // §4 Phase 3 — Role C: validate argument literal via the typed parser BEFORE
    // the synthetic-checker call, mirroring the Phase 2 wiring in tsdoc-parser.ts.
    //
    // IMPORTANT (Lesson 1 from Phase 2): the broadening check MUST run BEFORE the
    // typed-parser call. Broadened fields (D1/D2) bypass Role C entirely. Without
    // this guard a broadened field whose argument the typed parser would reject
    // (e.g. a custom type with a registered @minimum broadening) would spuriously
    // emit INVALID_TAG_ARGUMENT instead of being routed to D1/D2.
    //
    // Guard: only call parseTagArgument for builtin constraint tags. Extension tags
    // are not in the typed parser's registry (they would return UNKNOWN_TAG), and
    // they bypass this path via the `!isBuiltinConstraintName` guard below.
    //
    // Behaviour (non-broadened builtin constraint path):
    //   - ok: false → emit INVALID_TAG_ARGUMENT or MISSING_TAG_ARGUMENT; skip
    //                 adding this application to syntheticApplications.
    //   - ok: true (including raw-string-fallback for @const) → proceed to
    //                 lowerTagApplicationToSyntheticCall as before.
    if (isBuiltinConstraintName(tag.normalizedTagName)) {
      // §4 Phase 4A — add the integer-brand bypass that was previously missing
      // from the snapshot consumer (closes #325).
      //
      // Mirrors tsdoc-parser.ts hasBroadening computation (~lines 845-863):
      //   - target === null: direct-field check only. Path-targeted fields use
      //     the path-resolved type, not the declared subject type, so the brand
      //     check does not apply to them.
      //   - _isIntegerBrandedType(stripNullishUnion(subjectType)): detect the
      //     integer brand after stripping | null / | undefined wrappers.
      //   - capabilities.includes("numeric-comparable"): only bypass numeric
      //     tags. @pattern on an integer type still emits TYPE_MISMATCH.
      //
      // When true: skip both the typed parser AND the synthetic checker and
      // emit "bypass" on the structured log — identical to the build consumer.
      //
      // TODO(Phase 5, residual from #325): this bypass prevents TYPE_MISMATCH
      // on the integer field itself, but the synthetic batch checker can still
      // fail to resolve the imported integer type in its supporting
      // declarations — which pollutes *sibling* string-field constraints
      // (@minLength/@maxLength) in the same declaration with spurious
      // TYPE_MISMATCH. Scenarios 6 and 7 in file-snapshots.integer-bypass.test.ts
      // pin the current behavior. Full resolution lands with Phase 5
      // (synthetic-checker retirement) per docs/refactors/synthetic-checker-retirement.md.
      const isIntegerBypass =
        target === null &&
        _isIntegerBrandedType(stripNullishUnion(subjectType)) &&
        semantic.tagDefinition.capabilities.includes("numeric-comparable");

      if (isIntegerBypass) {
        // §8.3b — log "bypass" roleOutcome on the snapshot consumer channel,
        // mirroring the build consumer's emit("bypass", []) path.
        if (snapshotLogsEnabled) {
          logTagApplication(snapshotLog, {
            consumer: "snapshot",
            tag: tag.normalizedTagName,
            placement,
            subjectTypeKind: subjectTypeKindForLog,
            roleOutcome: "bypass",
            elapsedMicros: elapsedMicros(tagStartMicros),
          });
        }
        // Skip typed parser and synthetic checker — no diagnostic emitted.
        continue;
      }

      const hasExtBroadening = hasExtensionBroadening(
        tag.normalizedTagName,
        subjectType,
        checker,
        extensionDefinitions
      );

      if (!hasExtBroadening) {
        // §4 Phase 4B — use shared extractEffectiveArgumentText so both
        // consumers derive argument text identically. For the snapshot consumer,
        // tag.argumentText is already target-stripped (parseCommentBlock strips
        // the path-target prefix before storing argumentText), so passing it as
        // rawText produces the same result as parseTagSyntax(tagName,
        // tag.argumentText).argumentText. The helper unifies the code paths so
        // future changes affect both consumers symmetrically.
        const effectiveArgumentText = extractEffectiveArgumentText(
          tag.normalizedTagName,
          tag.argumentText,
          tag
        );
        const typedParseResult = parseTagArgument(
          tag.normalizedTagName,
          effectiveArgumentText,
          "snapshot"
        );

        if (!typedParseResult.ok) {
          // §8.3 — emit typed-parser trace log when enabled.
          if (typedParserTraceEnabled) {
            typedParserLog.trace("typed-parser C-reject", {
              consumer: "snapshot",
              tag: tag.normalizedTagName,
              placement,
              subjectTypeKind: subjectTypeKindForLog !== "" ? subjectTypeKindForLog : "-",
              roleOutcome: "C-reject",
              diagnosticCode: typedParseResult.diagnostic.code,
            });
          }

          // Map the typed-parser diagnostic code to a snapshot diagnostic code.
          // UNKNOWN_TAG is structurally unreachable here: parseTagArgument is only
          // called after isBuiltinConstraintName guard above. If it fires, it's a bug.
          // mapTypedParserDiagnosticCode provides an exhaustive switch shared with the
          // build consumer — avoids the Lesson 3 silent-ternary-collapse pitfall.
          const mappedCode = mapTypedParserDiagnosticCode(
            typedParseResult.diagnostic.code,
            tag.normalizedTagName
          );

          diagnostics.push(
            createAnalysisDiagnostic(
              mappedCode,
              typedParseResult.diagnostic.message,
              tag.fullSpan,
              {
                tagName: tag.normalizedTagName,
                placement,
                ...(target === null ? {} : { targetKind: target.kind, targetText: target.text }),
              }
            )
          );
          // Skip adding to syntheticApplications — typed parser already rejected at Role C.
          continue;
        }

        // Typed parser accepted the argument. Log at trace level before falling
        // through to the synthetic batch (which handles Roles A/B/D1/D2 until Phase 5).
        if (typedParserTraceEnabled) {
          typedParserLog.trace("typed-parser C-pass", {
            consumer: "snapshot",
            tag: tag.normalizedTagName,
            placement,
            subjectTypeKind: subjectTypeKindForLog !== "" ? subjectTypeKindForLog : "-",
            roleOutcome: "C-pass",
            valueKind: typedParseResult.value.kind,
          });
        }
      } else {
        // Extension-broadened (D1/D2) — bypass the typed parser but still pass
        // to the synthetic checker, which understands extension-registered types
        // and handles D1/D2 validation. Log at trace level if enabled.
        if (typedParserTraceEnabled) {
          typedParserLog.trace("typed-parser bypass", {
            consumer: "snapshot",
            tag: tag.normalizedTagName,
            placement,
            subjectTypeKind: subjectTypeKindForLog !== "" ? subjectTypeKindForLog : "-",
            roleOutcome: "bypass",
          });
        }
      }
    }

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
        tagStartMicros,
        subjectTypeKindForLog,
        options: syntheticOptions,
      });
    } catch (error) {
      // §8.3b — role A reject (placement check failed for snapshot consumer).
      if (snapshotLogsEnabled) {
        logTagApplication(snapshotLog, {
          consumer: "snapshot",
          tag: tag.normalizedTagName,
          placement,
          subjectTypeKind: subjectTypeKindForLog,
          roleOutcome: "A-reject",
          elapsedMicros: elapsedMicros(tagStartMicros),
        });
      }
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

  const batchCheck = optionalMeasure(
    performance,
    "analysis.syntheticCheckBatch",
    {
      tagCount: syntheticApplications.length,
    },
    () =>
      checkSyntheticTagApplicationsDetailed({
        applications: syntheticApplications.map((application) => application.options),
        ...(performance === undefined ? {} : { performance }),
      })
  );

  // §8.3c — log any global (setup-level) diagnostics from the batch check.
  if (batchCheck.globalDiagnostics.length > 0) {
    const setupCodes = batchCheck.globalDiagnostics.map((d) => d.kind);
    syntheticLog.debug("synthetic batch: global setup diagnostics", {
      diagnosticCount: batchCheck.globalDiagnostics.length,
      codes: setupCodes,
    });
  }

  const globalDiagnosticRange = combineCommentSpans(
    syntheticApplications.map((application) => application.tag.fullSpan)
  );

  if (globalDiagnosticRange !== null) {
    for (const diagnostic of batchCheck.globalDiagnostics) {
      const code =
        diagnostic.kind === "unsupported-custom-type-override"
          ? "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE"
          : diagnostic.kind === "synthetic-setup"
            ? "SYNTHETIC_SETUP_FAILURE"
            : "TYPE_MISMATCH";
      diagnostics.push(
        createAnalysisDiagnostic(code, diagnostic.message, globalDiagnosticRange, {
          placement,
          tagNames: syntheticApplications.map((application) => application.tag.normalizedTagName),
          ...(diagnostic.code > 0 ? { typescriptDiagnosticCode: diagnostic.code } : {}),
        })
      );
    }
  }

  for (const [index, result] of batchCheck.applicationResults.entries()) {
    const application = syntheticApplications[index];
    if (application === undefined) {
      continue;
    }

    // §8.3b — determine role outcome for this tag application and log.
    // "D-pass": the synthetic batch produced no diagnostics for this application.
    // This is distinct from "C-pass" (typed-parser accepted the argument literal
    // at Role C before the synthetic batch ran). "D-pass" means the synthetic
    // checker found nothing wrong after Role C already passed.
    if (snapshotLogsEnabled) {
      const roleOutcome: ConstraintValidatorRoleOutcome =
        result.diagnostics.length === 0
          ? "D-pass"
          : result.diagnostics.some((d) => d.message.includes("No overload"))
            ? "A-reject"
            : "C-reject";

      logTagApplication(snapshotLog, {
        consumer: "snapshot",
        tag: application.tag.normalizedTagName,
        placement,
        subjectTypeKind: application.subjectTypeKindForLog,
        roleOutcome,
        elapsedMicros: elapsedMicros(application.tagStartMicros),
      });
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
          ...(diagnostic.code > 0 ? { typescriptDiagnosticCode: diagnostic.code } : {}),
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
  extensionDefinitions: readonly ExtensionDefinition[] | undefined,
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
      const declarationSummary = buildDeclarationSummary(
        node,
        parsed,
        checker,
        extensionDefinitions
      );
      if (parsed.tags.length === 0 && declarationSummary.summaryText === null) {
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
        declarationSummary,
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
  const extensions = options.extensions ?? toExtensionTagSources(options.extensionDefinitions);

  const visit = (node: ts.Node): void => {
    const placement = resolveDeclarationPlacement(node);
    if (placement !== null) {
      const snapshot = buildCommentSnapshot(
        node,
        sourceFile,
        options.checker,
        extensions,
        options.extensionDefinitions,
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
                  ...(extensions === undefined ? {} : { extensions }),
                },
                options.performance,
                options.extensionDefinitions
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
