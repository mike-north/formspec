import type { ExtensionDefinition } from "@formspec/core";
import * as ts from "typescript";
import { _mapSetupDiagnosticCode, _validateExtensionSetup } from "./extension-setup-validation.js";
import { getMatchingTagSignatures } from "./tag-signature-matching.js";
import {
  _capabilityLabel,
  _checkConstValueAgainstType,
  _supportsConstraintCapability,
} from "./constraint-applicability.js";
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
  getTypedParserLogger,
  describeTypeKind,
  logSetupDiagnostics,
  logTagApplication,
  nowMicros,
  elapsedMicros,
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

const ANALYSIS_TYPE_NODE_BUILDER_FLAGS =
  ts.NodeBuilderFlags.NoTruncation |
  ts.NodeBuilderFlags.UseStructuralFallback |
  ts.NodeBuilderFlags.IgnoreErrors |
  ts.NodeBuilderFlags.InTypeAlias;

const ANALYSIS_TYPE_PRINT_SOURCE_FILE = ts.createSourceFile(
  "/virtual/formspec-standalone-type.ts",
  "",
  ts.ScriptTarget.ES2022,
  false,
  ts.ScriptKind.TS
);

const ANALYSIS_TYPE_PRINTER = ts.createPrinter({ removeComments: true });

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
 * tag application bypasses Role C (typed-argument validation) and is routed
 * to D1/D2 handling.
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
  // rendered in full. Without it, checker.typeToString applies TypeScript's internal
  // truncation threshold and can produce a structurally-different string than what
  // was registered in tsTypeNames, causing broadening detection to miss for
  // anonymous intersection types or deeply nested generics.
  const typeName = typeToString(effectiveType, checker);
  if (typeName === null) {
    // typeToString returns null when its type argument is undefined. stripNullishUnion
    // always returns a ts.Type, so this branch is a defensive guard for future callers
    // that might pass an undefined type through a different code path.
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
    // Intentionally omits `fieldType` and `pathResolvedCustomTypeId`: the
    // snapshot consumer does not currently apply custom-type broadening for
    // direct OR path-targeted constraints. Downstream LSP/natural-language
    // summarizers therefore receive un-broadened `NumericConstraintNode`/
    // `LengthConstraintNode` IR. Parity with the build consumer (PR #398,
    // issue #395) is tracked in issue #396.
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

function renderStandaloneTypeSyntax(
  type: ts.Type | undefined,
  checker: ts.TypeChecker
): string | null {
  if (type === undefined) {
    return null;
  }

  const typeNode = checker.typeToTypeNode(type, undefined, ANALYSIS_TYPE_NODE_BUILDER_FLAGS);
  if (typeNode === undefined) {
    return null;
  }

  const rendered = ANALYSIS_TYPE_PRINTER.printNode(
    ts.EmitHint.Unspecified,
    typeNode,
    ANALYSIS_TYPE_PRINT_SOURCE_FILE
  ).trim();
  return rendered === "" ? null : rendered;
}

function getTagTargetDescriptor(tag: ReturnType<typeof parseCommentBlock>["tags"][number]) {
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
  // §5 Phase 5C — renderStandaloneTypeSyntax is used for direct-field Role-B
  // error messages (the TYPE_MISMATCH path where target === null). The
  // standalone form yields a self-contained string even for types that
  // reference imported names, which keeps error messages stable across import
  // boundaries. Path-target Role-B error messages use typeToString directly
  // against the resolved path-terminal type — the standalone renderer is not
  // needed there because the terminal type is already a concrete local type.
  const standaloneSubjectTypeText = optionalMeasure(
    performance,
    "analysis.renderStandaloneSubjectType",
    undefined,
    () => renderStandaloneTypeSyntax(subjectType, checker)
  );
  // §8.3b — module-level loggers for the snapshot consumer.
  const snapshotLog = getSnapshotLogger();
  const typedParserLog = getTypedParserLogger();
  const snapshotLogsEnabled = snapshotLog !== noopLogger;
  const typedParserTraceEnabled = typedParserLog !== noopLogger;

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

    const target = getTagTargetDescriptor(tag);
    const pathTargetResolution =
      tag.target?.kind === "path" || tag.target?.kind === "ambiguous"
        ? tag.target.path === null
          ? null
          : resolvePathTargetType(declaredSubjectType, checker, tag.target.path.segments)
        : null;

    // §8.3b — record per-tag start time; subjectTypeKindForLog is hoisted
    // above the loop. Both are only consumed when logging is enabled.
    const tagStartMicros = snapshotLogsEnabled ? nowMicros() : 0;

    // Role C: validate argument literal via the typed parser. Mirrors the wiring
    // in tsdoc-parser.ts.
    //
    // IMPORTANT: the broadening check MUST run BEFORE the typed-parser call.
    // Broadened fields (D1/D2) bypass Role C entirely. Without this guard a
    // broadened field whose argument the typed parser would reject (e.g. a
    // custom type with a registered @minimum broadening) would spuriously emit
    // INVALID_TAG_ARGUMENT instead of being routed to D1/D2.
    //
    // Guard: only call parseTagArgument for builtin constraint tags. Extension tags
    // are not in the typed parser's registry (they would return UNKNOWN_TAG), and
    // they bypass this path via the `!isBuiltinConstraintName` guard below.
    //
    // Behaviour (non-broadened builtin constraint path):
    //   - ok: false → emit INVALID_TAG_ARGUMENT or MISSING_TAG_ARGUMENT.
    //   - ok: true (including raw-string-fallback for @const) → proceed to the
    //                 remaining Role-B / IR checks.
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
      // When true: skip both the typed parser AND the Role-C check and
      // emit "bypass" on the structured log — identical to the build consumer.
      const isIntegerBypass =
        target === null &&
        _isIntegerBrandedType(stripNullishUnion(subjectType)) &&
        semantic.tagDefinition.capabilities[0] === "numeric-comparable";

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
        // Skip typed parser and Role-C check — no diagnostic emitted.
        continue;
      }

      const hasExtBroadening = hasExtensionBroadening(
        tag.normalizedTagName,
        subjectType,
        checker,
        extensionDefinitions
      );

      if (!hasExtBroadening) {
        // §5 Phase 5A — Role B capability guard (snapshot consumer).
        //
        // ORDERING: Role B runs BEFORE Role C (typed parser) to match the build
        // path's guard order in `tsdoc-parser.ts` (~lines 855-884). The build
        // path checks supportsConstraintCapability() first, so for a bad-arg AND
        // wrong-type input (e.g. `@minimum "hello" on string`), both consumers
        // must emit TYPE_MISMATCH (Role B wins) — not INVALID_TAG_ARGUMENT (Role
        // C wins). Running Role C first would produce a diagnostic-code divergence
        // for that class of inputs.
        //
        // Ordering invariant: integer-brand bypass ALREADY ran earlier in this
        // loop (isIntegerBypass check above). This guard only runs on the
        // non-broadened, non-bypassed path.
        //
        // §5 Phase 5C — Role B now covers BOTH direct-field (target === null)
        // and path-target (target.kind === "path") validation. Previously path
        // targets were validated through the synthetic checker; Phase 5C retires
        // that surface so Role B is the only remaining capability check.
        //
        // For path targets we resolve the terminal type via resolvePathTargetType
        // and run the capability check against that resolved type. Path
        // resolution can also fail with `missing-property` (unknown segment) or
        // `unresolvable` (non-traversable intermediate type) — both emit their
        // own B-reject diagnostics before the capability check.
        {
          const requiredCapability = semantic.tagDefinition.capabilities[0];
          // Under noUncheckedIndexedAccess, capabilities[0] is SemanticCapability | undefined.
          // No capability constraint on this tag → always valid for any field type.
          if (requiredCapability !== undefined) {
            // Resolve the type to run capability checks against.
            //   - target === null: the declared subject type (direct field).
            //   - target.kind === "path": the path-target terminal type.
            // Other target kinds (member, variant, ambiguous) are left to the
            // placement pre-check / downstream validators — this guard is only
            // concerned with the "is this type compatible with this tag?"
            // question, which is well-defined for path targets but not for
            // member/variant targeting.
            let evaluatedType: ts.Type | null = null;
            let evaluatedTypeLabel = "";
            let pathRejection: { code: string; message: string } | null = null;

            if (target === null) {
              evaluatedType = subjectType;
              evaluatedTypeLabel =
                standaloneSubjectTypeText ?? typeToString(subjectType, checker) ?? "unknown";
            } else if (target.kind === "path") {
              // pathTargetResolution is computed earlier in the loop (line ~1492)
              // via resolvePathTargetType(declaredSubjectType, ...). Use it to
              // drive the path-target Role-B check.
              if (pathTargetResolution === null) {
                // tag.target.path is null — the path target text failed to
                // parse (e.g. `@minimum :invalid-syntax 0` where the segment
                // contains non-identifier characters). Before Phase 5C this
                // fell through to the synthetic lowering which would reject it
                // there; now that the synthetic checker is retired we must emit
                // a diagnostic here instead of silently accepting it.
                pathRejection = {
                  code: "INVALID_PATH_TARGET",
                  message: `Tag "@${tag.normalizedTagName}" has an invalid path target.`,
                };
              } else if (pathTargetResolution.kind === "missing-property") {
                pathRejection = {
                  code: "UNKNOWN_PATH_TARGET",
                  message: `Target "${target.text}": path-targeted constraint "${tag.normalizedTagName}" references unknown path segment "${pathTargetResolution.segment}"`,
                };
              } else if (pathTargetResolution.kind === "unresolvable") {
                const actualTypeText =
                  typeToString(pathTargetResolution.type, checker) ?? "unknown";
                pathRejection = {
                  code: "TYPE_MISMATCH",
                  message: `Target "${target.text}": path-targeted constraint "${tag.normalizedTagName}" is invalid because type "${actualTypeText}" cannot be traversed`,
                };
              } else {
                evaluatedType = pathTargetResolution.type;
                evaluatedTypeLabel = typeToString(pathTargetResolution.type, checker) ?? "unknown";
              }
            }

            if (pathRejection !== null) {
              diagnostics.push(
                createAnalysisDiagnostic(pathRejection.code, pathRejection.message, tag.fullSpan, {
                  tagName: tag.normalizedTagName,
                  placement,
                  ...(target === null ? {} : { targetKind: target.kind, targetText: target.text }),
                  ...(pathTargetResolution?.kind === "missing-property"
                    ? { missingPathSegment: pathTargetResolution.segment }
                    : {}),
                })
              );
              if (snapshotLogsEnabled) {
                logTagApplication(snapshotLog, {
                  consumer: "snapshot",
                  tag: tag.normalizedTagName,
                  placement,
                  subjectTypeKind: subjectTypeKindForLog,
                  roleOutcome: "B-reject",
                  elapsedMicros: elapsedMicros(tagStartMicros),
                });
              }
              continue;
            }

            if (
              evaluatedType !== null &&
              !_supportsConstraintCapability(requiredCapability, evaluatedType, checker)
            ) {
              const targetPrefix = target === null ? "" : `Target "${target.text}": `;
              diagnostics.push(
                createAnalysisDiagnostic(
                  "TYPE_MISMATCH",
                  `${targetPrefix}constraint "@${tag.normalizedTagName}" is only valid on ${_capabilityLabel(requiredCapability)} targets, but field type is "${evaluatedTypeLabel}"`,
                  tag.fullSpan,
                  {
                    tagName: tag.normalizedTagName,
                    placement,
                    ...(target === null
                      ? {}
                      : { targetKind: target.kind, targetText: target.text }),
                  }
                )
              );
              if (snapshotLogsEnabled) {
                logTagApplication(snapshotLog, {
                  consumer: "snapshot",
                  tag: tag.normalizedTagName,
                  placement,
                  subjectTypeKind: subjectTypeKindForLog,
                  roleOutcome: "B-reject",
                  elapsedMicros: elapsedMicros(tagStartMicros),
                });
              }
              continue;
            }
          }
        }

        // §4 Phase 4B — use shared extractEffectiveArgumentText so both
        // consumers derive argument text identically. For the snapshot consumer,
        // tag.argumentText is already target-stripped (parseCommentBlock strips
        // the path-target prefix before storing argumentText), so passing it as
        // rawText produces the same result as parseTagSyntax(tagName,
        // tag.argumentText).argumentText. The helper unifies the code paths so
        // future changes affect both consumers symmetrically.
        //
        // ORDERING: Role C runs AFTER Role B (capability check). This matches the
        // build path's order: bypass → Role B → Role C. For wrong-type AND
        // bad-arg inputs, Role B wins and emits TYPE_MISMATCH before the
        // typed parser inspects the argument.
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
          // Typed parser already rejected at Role C — no further checks.
          continue;
        }

        // Typed parser accepted the argument. Log at trace level before
        // continuing to the remaining checks (Roles A / IR / D1/D2).
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

        // §5 Phase 5B — @const IR validation (snapshot consumer).
        //
        // The build consumer validates @const value/type compatibility at IR
        // validation time (semantic-targets.ts case "const", ~line 1255). The
        // snapshot consumer does not build an analysis IR, so we port the
        // primitive value-type and enum-membership checks directly against the
        // `ts.Type` here.
        //
        // Scope: only builtin @const, direct-field (target === null). Path-
        // targeted @const relies on the Role-B path-target capability guard
        // above and does not run this extra IR check.
        //
        // The typed parser produces one of:
        //   - { kind: "json-value", value: JsonValue }     — parsed JSON
        //   - { kind: "raw-string-fallback", value: string } — malformed JSON
        //     treated as an opaque string literal (only @const produces this).
        // Both feed a JsonValue into the IR check — raw-string-fallback's
        // value is a string, which is valid on a string-typed field and
        // mismatches number/boolean/null fields (matching the build path's
        // behavior on raw-string inputs).
        if (
          tag.normalizedTagName === "const" &&
          target === null &&
          (typedParseResult.value.kind === "json-value" ||
            typedParseResult.value.kind === "raw-string-fallback")
        ) {
          const constCheck = _checkConstValueAgainstType(
            typedParseResult.value.value,
            subjectType,
            checker
          );
          if (constCheck !== null) {
            diagnostics.push(
              createAnalysisDiagnostic(constCheck.code, constCheck.message, tag.fullSpan, {
                tagName: tag.normalizedTagName,
                placement,
              })
            );
            if (snapshotLogsEnabled) {
              logTagApplication(snapshotLog, {
                consumer: "snapshot",
                tag: tag.normalizedTagName,
                placement,
                subjectTypeKind: subjectTypeKindForLog,
                // The @const IR check runs AFTER the typed parser (Role C)
                // accepts, so a rejection here is a C-phase rejection (the
                // value semantically fails the constraint), not a Role-B
                // capability failure.
                roleOutcome: "C-reject",
                elapsedMicros: elapsedMicros(tagStartMicros),
              });
            }
            // IR check rejected — no further processing.
            continue;
          }
        }
      } else {
        // Extension-broadened (D1/D2) — bypass the typed parser; D1/D2
        // handling is performed by the downstream registry dispatch.
        // Log at trace level if enabled.
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

    // §5 Phase 5A — placement pre-check (snapshot consumer).
    //
    // Applies to ALL tags (builtin constraint and extension), not just builtin.
    // semantic.tagDefinition is always non-null here (the null case causes an
    // early `continue` at the top of the loop).
    //
    // §5 Phase 5C — this placement check is the only Role-A guard; the former
    // synthetic-program fallback has been retired.
    {
      const definition = semantic.tagDefinition;
      const targetKind = target?.kind ?? null;
      const matchingSignatures = getMatchingTagSignatures(definition, placement, targetKind);
      if (matchingSignatures.length === 0) {
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
            `Tag "@${definition.canonicalName}" is not allowed on placement "${placement}"` +
              (targetKind === null ? "" : ` with target kind "${targetKind}"`),
            tag.fullSpan,
            {
              tagName: tag.normalizedTagName,
              placement,
              ...(target === null ? {} : { targetKind: target.kind, targetText: target.text }),
            }
          )
        );
        continue;
      }
    }

    // §5 Phase 5C — all validation is now complete via Role A (placement
    // pre-check), Role B (capability guard, including path-target resolution),
    // and Role C (typed-parser argument validation). The synthetic
    // TypeScript program batch has been retired. Log C-pass for structured
    // tracing and move on.
    if (snapshotLogsEnabled) {
      logTagApplication(snapshotLog, {
        consumer: "snapshot",
        tag: tag.normalizedTagName,
        placement,
        subjectTypeKind: subjectTypeKindForLog,
        roleOutcome: "C-pass",
        elapsedMicros: elapsedMicros(tagStartMicros),
      });
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

  // §4 Phase 4 Slice C — pre-validate extension setup once per snapshot call.
  // Previously, setup failures (UNSUPPORTED_CUSTOM_TYPE_OVERRIDE /
  // SYNTHETIC_SETUP_FAILURE) were emitted inside buildTagDiagnostics for each
  // commented declaration. In a file with N commented declarations, a broken
  // extension config would produce N identical diagnostics. Pre-validating here
  // emits each setup diagnostic exactly once per buildFormSpecAnalysisFileSnapshot
  // call, anchored at the start of the file (no tag-site location available for
  // registry-level failures).
  const snapshotLog = getSnapshotLogger();
  const setupDiagnosticResults = _validateExtensionSetup(extensions);
  if (setupDiagnosticResults.length > 0) {
    logSetupDiagnostics(snapshotLog, {
      diagnosticCount: setupDiagnosticResults.length,
      codes: setupDiagnosticResults.map((d) => d.kind),
    });
    // Emit each setup diagnostic anchored at the start of the file.
    // The file-start span (0,0) is the closest we can get to a
    // "registry-level" location in the snapshot transport format.
    const fileStartSpan: CommentSpan = { start: 0, end: 0 };
    for (const setupDiag of setupDiagnosticResults) {
      diagnostics.push(
        createAnalysisDiagnostic(
          _mapSetupDiagnosticCode(setupDiag.kind),
          setupDiag.message,
          fileStartSpan,
          {}
        )
      );
    }
  }

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
