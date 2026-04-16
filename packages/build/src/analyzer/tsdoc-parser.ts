/**
 * TSDoc-based structured tag parser.
 *
 * Bridges the TypeScript compiler AST with the official `@microsoft/tsdoc`
 * parser to extract constraint and annotation tags from JSDoc comments
 * on class/interface/type-alias properties.
 *
 * The parser recognises two categories of tags:
 *
 * 1. **Constraint tags** (all alphanumeric, TSDoc-compliant):
 *    `@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`,
 *    `@multipleOf`, `@minLength`, `@maxLength`, `@minItems`, `@maxItems`,
 *    `@uniqueItems`, `@pattern`, `@enumOptions`, `@const`
 *    — Parsed via TSDocParser as custom block tags.
 *    Both camelCase and PascalCase forms are accepted (e.g., `@Minimum`).
 *
 * 2. **Metadata and annotation tags** (`@apiName`, `@displayName`,
 *    `@format`, `@placeholder`):
 *    These are parsed as structured custom block tags so summary extraction
 *    stops at recognized FormSpec tags. `@displayName`, `@format`, and
 *    `@placeholder` also map onto annotation IR nodes, while `@apiName`
 *    remains metadata-only and is resolved separately by the class analyzer.
 *
 * The `@deprecated` tag is a standard TSDoc block tag, parsed structurally.
 *
 * Description and remarks extraction (spec 002 §2.3):
 * - Summary text (bare text before the first block tag) → `description` annotation
 * - `@remarks` block → `remarks` annotation (separate channel)
 * - `@description` is NOT supported (not a standard TSDoc tag)
 *
 * **Fallback strategy**: TSDoc treats `{` / `}` as inline tag delimiters and
 * `@` as a tag prefix, so content containing these characters (e.g. JSON
 * objects in `@EnumOptions`, regex patterns with `@` in `@Pattern`) gets
 * mangled by the TSDoc parser. The shared comment syntax parser is the
 * primary source for these payloads; the TS compiler's `ts.getJSDocTags()`
 * API remains as a fallback when a raw payload cannot be recovered from the
 * shared parse.
 */

import * as ts from "typescript";
import {
  checkSyntheticTagApplication,
  choosePreferredPayloadText,
  extractPathTarget as extractSharedPathTarget,
  getTagDefinition,
  hasTypeSemanticCapability,
  normalizeFormSpecTagName,
  parseConstraintTagValue,
  parseDefaultValueTagValue,
  parseTagSyntax,
  parseUnifiedComment,
  resolveDeclarationPlacement,
  resolvePathTargetType,
  TAGS_REQUIRING_RAW_TEXT,
  type ConstraintSemanticDiagnostic,
  type FormSpecValueKind,
  type ParsedCommentTag,
  type SemanticCapability,
} from "@formspec/analysis/internal";
import {
  BUILTIN_CONSTRAINT_DEFINITIONS,
  normalizeConstraintTagName,
  isBuiltinConstraintName,
} from "@formspec/core/internals";
import {
  type ConstraintNode,
  type AnnotationNode,
  type Provenance,
  type PathTarget,
  type TypeNode,
} from "@formspec/core/internals";
import type { ExtensionRegistry } from "../extensions/index.js";

function sharedTagValueOptions(options?: ParseTSDocOptions) {
  return {
    ...(options?.extensionRegistry !== undefined ? { registry: options.extensionRegistry } : {}),
    ...(options?.fieldType !== undefined ? { fieldType: options.fieldType } : {}),
  };
}

const SYNTHETIC_TYPE_FORMAT_FLAGS =
  ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

function getExtensionTypeNames(registry: ExtensionRegistry | undefined): ReadonlySet<string> {
  if (registry === undefined) {
    return new Set();
  }
  return new Set(
    registry.extensions.flatMap((ext) =>
      (ext.types ?? []).flatMap((t) => t.tsTypeNames ?? [t.typeName])
    )
  );
}

function collectImportedNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const importedNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause !== undefined) {
      const clause = statement.importClause;
      if (clause.name !== undefined) {
        importedNames.add(clause.name.text);
      }
      if (clause.namedBindings !== undefined) {
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const specifier of clause.namedBindings.elements) {
            importedNames.add(specifier.name.text);
          }
        } else if (ts.isNamespaceImport(clause.namedBindings)) {
          importedNames.add(clause.namedBindings.name.text);
        }
      }
      continue;
    }

    if (ts.isImportEqualsDeclaration(statement)) {
      importedNames.add(statement.name.text);
    }
  }

  return importedNames;
}

function isNonReferenceIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent;

  if (
    (ts.isBindingElement(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isEnumMember(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isImportClause(parent) ||
      ts.isImportEqualsDeclaration(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isModuleDeclaration(parent) ||
      ts.isNamespaceExport(parent) ||
      ts.isNamespaceImport(parent) ||
      ts.isParameter(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isTypeParameterDeclaration(parent) ||
      ts.isVariableDeclaration(parent)) &&
    parent.name === node
  ) {
    return true;
  }

  if (
    (ts.isPropertyAssignment(parent) || ts.isPropertyAccessExpression(parent)) &&
    parent.name === node
  ) {
    return true;
  }

  if (ts.isQualifiedName(parent) && parent.right === node) {
    return true;
  }

  return false;
}

function statementReferencesImportedName(
  statement: ts.Statement,
  importedNames: ReadonlySet<string>
): boolean {
  if (importedNames.size === 0) {
    return false;
  }

  let referencesImportedName = false;

  const visit = (node: ts.Node): void => {
    if (referencesImportedName) {
      return;
    }

    if (ts.isIdentifier(node) && importedNames.has(node.text) && !isNonReferenceIdentifier(node)) {
      referencesImportedName = true;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(statement);
  return referencesImportedName;
}

function buildSupportingDeclarations(
  sourceFile: ts.SourceFile,
  extensionTypeNames: ReadonlySet<string>
): readonly string[] {
  const importedNames = collectImportedNames(sourceFile);

  // Filter out extension-registered type names: the synthetic program provides
  // type aliases for these, so declarations referencing them are safe to include.
  const importedNamesToSkip = new Set(
    [...importedNames].filter((name) => !extensionTypeNames.has(name))
  );

  return sourceFile.statements
    .filter((statement) => {
      // Always exclude imports and re-exports
      if (ts.isImportDeclaration(statement)) return false;
      if (ts.isImportEqualsDeclaration(statement)) return false;
      if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined)
        return false;

      // Skip declarations whose AST references an imported identifier,
      // unless that identifier is an extension-registered type (which will
      // have a synthetic type alias in the synthetic program).
      if (statementReferencesImportedName(statement, importedNamesToSkip)) {
        return false;
      }

      return true;
    })
    .map((statement) => statement.getText(sourceFile));
}

function pushUniqueCompilerDiagnostics(
  target: ConstraintSemanticDiagnostic[],
  additions: readonly ConstraintSemanticDiagnostic[]
): void {
  for (const diagnostic of additions) {
    if (
      (diagnostic.code === "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE" ||
        diagnostic.code === "SYNTHETIC_SETUP_FAILURE") &&
      target.some(
        (existing) => existing.code === diagnostic.code && existing.message === diagnostic.message
      )
    ) {
      continue;
    }
    target.push(diagnostic);
  }
}

/**
 * Runs the full constraint tag processing pipeline for a single tag: compiler
 * diagnostics check → constraint value parse → push to output arrays.
 *
 * If compiler diagnostics are found the constraint is skipped and diagnostics
 * are accumulated instead. Returns without mutating outputs if the tag produces
 * no usable constraint node.
 */
function processConstraintTag(
  tagName: string,
  text: string,
  parsedTag: ParsedCommentTag | null,
  provenance: Provenance,
  node: ts.Node,
  sourceFile: ts.SourceFile,
  supportingDeclarations: readonly string[],
  options: ParseTSDocOptions | undefined,
  constraints: ConstraintNode[],
  diagnostics: ConstraintSemanticDiagnostic[]
): void {
  const compilerDiagnostics = buildCompilerBackedConstraintDiagnostics(
    node,
    sourceFile,
    tagName,
    parsedTag,
    provenance,
    supportingDeclarations,
    options
  );
  if (compilerDiagnostics.length > 0) {
    pushUniqueCompilerDiagnostics(diagnostics, compilerDiagnostics);
    return;
  }
  const constraintNode = parseConstraintTagValue(
    tagName,
    text,
    provenance,
    sharedTagValueOptions(options)
  );
  if (constraintNode) {
    constraints.push(constraintNode);
  }
}

function renderSyntheticArgumentExpression(
  valueKind: FormSpecValueKind | null,
  argumentText: string
): string | null {
  const trimmed = argumentText.trim();
  if (trimmed === "") {
    return null;
  }

  switch (valueKind) {
    case "number":
    case "integer":
    case "signedInteger":
      return Number.isFinite(Number(trimmed)) ? trimmed : JSON.stringify(trimmed);
    case "string":
      return JSON.stringify(argumentText);
    case "json":
      try {
        JSON.parse(trimmed);
        return `(${trimmed})`;
      } catch {
        return JSON.stringify(trimmed);
      }
    case "boolean":
      return trimmed === "true" || trimmed === "false" ? trimmed : JSON.stringify(trimmed);
    case "condition":
      return "undefined as unknown as FormSpecCondition";
    case null:
      return null;
    default: {
      return String(valueKind);
    }
  }
}

function getArrayElementType(type: ts.Type, checker: ts.TypeChecker): ts.Type | null {
  if (!checker.isArrayType(type)) {
    return null;
  }

  return checker.getTypeArguments(type as ts.TypeReference)[0] ?? null;
}

function supportsConstraintCapability(
  type: ts.Type,
  checker: ts.TypeChecker,
  capability: SemanticCapability | undefined
): boolean {
  if (capability === undefined) {
    return true;
  }

  if (hasTypeSemanticCapability(type, checker, capability)) {
    return true;
  }

  if (capability === "string-like") {
    const itemType = getArrayElementType(type, checker);
    return itemType !== null && hasTypeSemanticCapability(itemType, checker, capability);
  }

  return false;
}

function makeDiagnostic(
  code: string,
  message: string,
  provenance: Provenance
): ConstraintSemanticDiagnostic {
  return {
    code,
    message,
    severity: "error",
    primaryLocation: provenance,
    relatedLocations: [],
  };
}

function placementLabel(
  placement: NonNullable<ReturnType<typeof resolveDeclarationPlacement>>
): string {
  switch (placement) {
    case "class":
      return "class declarations";
    case "class-field":
      return "class fields";
    case "class-method":
      return "class methods";
    case "interface":
      return "interface declarations";
    case "interface-field":
      return "interface fields";
    case "type-alias":
      return "type aliases";
    case "type-alias-field":
      return "type-alias properties";
    case "variable":
      return "variables";
    case "function":
      return "functions";
    case "function-parameter":
      return "function parameters";
    case "method-parameter":
      return "method parameters";
    default: {
      const exhaustive: never = placement;
      return String(exhaustive);
    }
  }
}

function capabilityLabel(capability: string | undefined): string {
  switch (capability) {
    case "numeric-comparable":
      return "number";
    case "string-like":
      return "string";
    case "array-like":
      return "array";
    case "enum-member-addressable":
      return "enum";
    case "json-like":
      return "JSON-compatible";
    case "object-like":
      return "object";
    case "condition-like":
      return "conditional";
    case undefined:
      return "compatible";
    default:
      return capability;
  }
}

function getBroadenedCustomTypeId(fieldType: TypeNode | undefined): string | undefined {
  if (fieldType?.kind === "custom") {
    return fieldType.typeId;
  }

  if (fieldType?.kind !== "union") {
    return undefined;
  }

  const customMembers = fieldType.members.filter(
    (member): member is Extract<TypeNode, { kind: "custom" }> => member.kind === "custom"
  );
  if (customMembers.length !== 1) {
    return undefined;
  }

  const nonCustomMembers = fieldType.members.filter((member) => member.kind !== "custom");
  const allOtherMembersAreNull = nonCustomMembers.every(
    (member) => member.kind === "primitive" && member.primitiveKind === "null"
  );
  const customMember = customMembers[0];
  return allOtherMembersAreNull && customMember !== undefined ? customMember.typeId : undefined;
}

function hasBuiltinConstraintBroadening(tagName: string, options?: ParseTSDocOptions): boolean {
  const broadenedTypeId = getBroadenedCustomTypeId(options?.fieldType);
  return (
    broadenedTypeId !== undefined &&
    options?.extensionRegistry?.findBuiltinConstraintBroadening(broadenedTypeId, tagName) !==
      undefined
  );
}

function buildCompilerBackedConstraintDiagnostics(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  tagName: string,
  parsedTag: ParsedCommentTag | null,
  provenance: Provenance,
  supportingDeclarations: readonly string[],
  options?: ParseTSDocOptions
): readonly ConstraintSemanticDiagnostic[] {
  if (!isBuiltinConstraintName(tagName)) {
    return [];
  }

  const checker = options?.checker;
  const subjectType = options?.subjectType;
  if (checker === undefined || subjectType === undefined) {
    return [];
  }

  const placement = resolveDeclarationPlacement(node);
  if (placement === null) {
    return [];
  }

  const definition = getTagDefinition(tagName, options?.extensionRegistry?.extensions);
  if (definition === null) {
    return [];
  }

  if (!definition.placements.includes(placement)) {
    return [
      makeDiagnostic(
        "INVALID_TAG_PLACEMENT",
        `Tag "@${tagName}" is not allowed on ${placementLabel(placement)}.`,
        provenance
      ),
    ];
  }

  const target = parsedTag?.target ?? null;
  const hasBroadening = target === null && hasBuiltinConstraintBroadening(tagName, options);
  if (target !== null) {
    if (target.kind !== "path") {
      return [
        makeDiagnostic(
          "UNSUPPORTED_TARGETING_SYNTAX",
          `Tag "@${tagName}" does not support ${target.kind} targeting syntax.`,
          provenance
        ),
      ];
    }

    if (!target.valid || target.path === null) {
      return [
        makeDiagnostic(
          "UNSUPPORTED_TARGETING_SYNTAX",
          `Tag "@${tagName}" has invalid path targeting syntax.`,
          provenance
        ),
      ];
    }

    const resolution = resolvePathTargetType(subjectType, checker, target.path.segments);
    if (resolution.kind === "missing-property") {
      return [
        makeDiagnostic(
          "UNKNOWN_PATH_TARGET",
          `Target "${target.rawText}": path-targeted constraint "${tagName}" references unknown path segment "${resolution.segment}"`,
          provenance
        ),
      ];
    }

    if (resolution.kind === "unresolvable") {
      const actualType = checker.typeToString(resolution.type, node, SYNTHETIC_TYPE_FORMAT_FLAGS);
      return [
        makeDiagnostic(
          "TYPE_MISMATCH",
          `Target "${target.rawText}": path-targeted constraint "${tagName}" is invalid because type "${actualType}" cannot be traversed`,
          provenance
        ),
      ];
    }

    const requiredCapability = definition.capabilities[0];
    if (
      requiredCapability !== undefined &&
      !supportsConstraintCapability(resolution.type, checker, requiredCapability)
    ) {
      const actualType = checker.typeToString(resolution.type, node, SYNTHETIC_TYPE_FORMAT_FLAGS);
      return [
        makeDiagnostic(
          "TYPE_MISMATCH",
          `Target "${target.rawText}": constraint "${tagName}" is only valid on ${capabilityLabel(requiredCapability)} targets, but field type is "${actualType}"`,
          provenance
        ),
      ];
    }
  } else if (!hasBroadening) {
    const requiredCapability = definition.capabilities[0];
    if (
      requiredCapability !== undefined &&
      !supportsConstraintCapability(subjectType, checker, requiredCapability)
    ) {
      const actualType = checker.typeToString(subjectType, node, SYNTHETIC_TYPE_FORMAT_FLAGS);
      return [
        makeDiagnostic(
          "TYPE_MISMATCH",
          `Target "${node.getText(sourceFile)}": constraint "${tagName}" is only valid on ${capabilityLabel(requiredCapability)} targets, but field type is "${actualType}"`,
          provenance
        ),
      ];
    }
  }

  const argumentExpression = renderSyntheticArgumentExpression(
    definition.valueKind,
    parsedTag?.argumentText ?? ""
  );
  if (definition.requiresArgument && argumentExpression === null) {
    return [];
  }

  if (hasBroadening) {
    return [];
  }

  const subjectTypeText = checker.typeToString(subjectType, node, SYNTHETIC_TYPE_FORMAT_FLAGS);
  const hostType = options?.hostType ?? subjectType;
  const hostTypeText = checker.typeToString(hostType, node, SYNTHETIC_TYPE_FORMAT_FLAGS);
  const result = checkSyntheticTagApplication({
    tagName,
    placement,
    hostType: hostTypeText,
    subjectType: subjectTypeText,
    ...(target?.kind === "path" ? { target: { kind: "path" as const, text: target.rawText } } : {}),
    ...(argumentExpression !== null ? { argumentExpression } : {}),
    supportingDeclarations,
    ...(options?.extensionRegistry !== undefined
      ? {
          extensions: options.extensionRegistry.extensions.map((extension) => ({
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
            ...(extension.types !== undefined
              ? {
                  customTypes: extension.types.map((t) => ({
                    tsTypeNames: t.tsTypeNames ?? [t.typeName],
                  })),
                }
              : {}),
          })),
        }
      : {}),
  });

  if (result.diagnostics.length === 0) {
    return [];
  }

  const setupDiagnostic = result.diagnostics.find((diagnostic) => diagnostic.kind !== "typescript");
  if (setupDiagnostic !== undefined) {
    return [
      makeDiagnostic(
        setupDiagnostic.kind === "unsupported-custom-type-override"
          ? "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE"
          : "SYNTHETIC_SETUP_FAILURE",
        setupDiagnostic.message,
        provenance
      ),
    ];
  }

  const expectedLabel =
    definition.valueKind === null ? "compatible argument" : capabilityLabel(definition.valueKind);
  return [
    makeDiagnostic(
      "TYPE_MISMATCH",
      `Tag "@${tagName}" received an invalid argument for ${expectedLabel}.`,
      provenance
    ),
  ];
}

const parseResultCache = new Map<string, TSDocParseResult>();

function getExtensionTagNames(options?: ParseTSDocOptions): readonly string[] {
  return [
    ...(options?.extensionRegistry?.extensions.flatMap((extension) =>
      (extension.constraintTags ?? []).map((tag) => normalizeFormSpecTagName(tag.tagName))
    ) ?? []),
    ...(options?.extensionRegistry?.extensions.flatMap((extension) =>
      (extension.metadataSlots ?? []).map((slot) => normalizeFormSpecTagName(slot.tagName))
    ) ?? []),
  ].sort();
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Result of parsing a single JSDoc comment attached to a TS AST node.
 */
export interface TSDocParseResult {
  /** Constraint IR nodes extracted from custom block tags. */
  readonly constraints: readonly ConstraintNode[];
  /** Annotation IR nodes extracted from canonical TSDoc block tags. */
  readonly annotations: readonly AnnotationNode[];
  /** Compiler-backed extraction diagnostics for invalid tag applications. */
  readonly diagnostics: readonly ConstraintSemanticDiagnostic[];
}

/**
 * Optional extension-aware parsing inputs for TSDoc extraction.
 */
export interface ParseTSDocOptions {
  /**
   * Extension registry used to resolve custom tags and custom-type-specific
   * broadening of built-in constraint tags.
   */
  readonly extensionRegistry?: ExtensionRegistry;
  /**
   * Effective field/type node for the declaration being parsed. Required when
   * built-in tags may broaden onto a custom type.
   */
  readonly fieldType?: TypeNode;
  /** Type checker used for compiler-backed placement and type validation. */
  readonly checker?: ts.TypeChecker;
  /** The declaration type that the parsed tag applies to. */
  readonly subjectType?: ts.Type;
  /** Optional enclosing host type for future cross-field signature checks. */
  readonly hostType?: ts.Type;
}

/**
 * Display-name metadata extracted from a node's JSDoc tags.
 *
 * The root display name is returned separately from member-target labels so
 * callers can apply the former to the enclosing type/form and the latter to
 * enum members.
 */
export interface DisplayNameMetadata {
  readonly displayName?: string;
  readonly memberDisplayNames: ReadonlyMap<string, string>;
}

function getExtensionRegistryCacheKey(registry: ExtensionRegistry | undefined): string {
  if (registry === undefined) {
    return "";
  }

  return registry.extensions
    .map((extension) =>
      JSON.stringify({
        extensionId: extension.extensionId,
        typeNames: extension.types?.map((type) => type.typeName) ?? [],
        constraintTags:
          extension.constraintTags?.map((tag) => normalizeFormSpecTagName(tag.tagName)) ?? [],
        metadataSlots:
          extension.metadataSlots?.map((slot) => ({
            tagName: normalizeFormSpecTagName(slot.tagName),
            declarationKinds: [...slot.declarationKinds].sort(),
            allowBare: slot.allowBare !== false,
            qualifiers: (slot.qualifiers ?? [])
              .map((qualifier) => ({
                qualifier: qualifier.qualifier,
                ...(qualifier.sourceQualifier !== undefined
                  ? { sourceQualifier: qualifier.sourceQualifier }
                  : {}),
              }))
              .sort((left, right) => left.qualifier.localeCompare(right.qualifier)),
          })) ?? [],
      })
    )
    .join("|");
}

function getParseCacheKey(
  node: ts.Node,
  file: string,
  options: ParseTSDocOptions | undefined
): string {
  const sourceFile = node.getSourceFile();
  const checker = options?.checker;
  return JSON.stringify({
    file,
    sourceFile: sourceFile.fileName,
    sourceText: sourceFile.text,
    start: node.getFullStart(),
    end: node.getEnd(),
    fieldType: options?.fieldType ?? null,
    subjectType:
      checker !== undefined && options?.subjectType !== undefined
        ? checker.typeToString(options.subjectType, node, SYNTHETIC_TYPE_FORMAT_FLAGS)
        : null,
    hostType:
      checker !== undefined && options?.hostType !== undefined
        ? checker.typeToString(options.hostType, node, SYNTHETIC_TYPE_FORMAT_FLAGS)
        : null,
    extensions: getExtensionRegistryCacheKey(options?.extensionRegistry),
  });
}

/**
 * Parses the JSDoc comment attached to a TypeScript AST node using the
 * unified comment parser and returns canonical IR constraint and annotation
 * nodes.
 *
 * For constraint tags (`@minimum`, `@pattern`, `@enumOptions`, etc.),
 * the unified parser provides aligned span and TSDoc block information.
 * Canonical annotation tags (`@displayName`) are also parsed structurally.
 * Summary text and `@remarks` are extracted as separate annotation nodes.
 *
 * @param node - The TS AST node to inspect (PropertyDeclaration, PropertySignature, etc.)
 * @param file - Absolute source file path for provenance
 * @returns Parsed constraint and annotation nodes
 */
export function parseTSDocTags(
  node: ts.Node,
  file = "",
  options?: ParseTSDocOptions
): TSDocParseResult {
  const cacheKey = getParseCacheKey(node, file, options);
  const cached = parseResultCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const constraints: ConstraintNode[] = [];
  const annotations: AnnotationNode[] = [];
  const diagnostics: ConstraintSemanticDiagnostic[] = [];
  let displayName: string | undefined;
  let placeholder: string | undefined;
  let displayNameProvenance: Provenance | undefined;
  let placeholderProvenance: Provenance | undefined;

  const sourceFile = node.getSourceFile();
  const sourceText = sourceFile.getFullText();

  // Collect extension-registered type names so we don't skip declarations
  // that reference them (the synthetic program provides aliases for these).
  const extensionTypeNames = getExtensionTypeNames(options?.extensionRegistry);

  const supportingDeclarations = buildSupportingDeclarations(sourceFile, extensionTypeNames);
  const commentRanges = ts.getLeadingCommentRanges(sourceText, node.getFullStart());

  // TS compiler API fallback for TAGS_REQUIRING_RAW_TEXT: handles tags that
  // the regex parser misses (e.g. malformed or unusual comment syntax).
  const rawTextFallbacks = collectRawTextFallbacks(node, file);

  const extensionTagNames = getExtensionTagNames(options);

  if (commentRanges) {
    for (const range of commentRanges) {
      // Only parse /** ... */ comments (kind 3 = MultiLineCommentTrivia)
      if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
        continue;
      }
      const commentText = sourceText.substring(range.pos, range.end);
      if (!commentText.startsWith("/**")) {
        continue;
      }

      const extensions = options?.extensionRegistry?.extensions;
      const unified = parseUnifiedComment(commentText, {
        offset: range.pos,
        extensionTagNames,
        ...(extensions !== undefined ? { extensions } : {}),
      });

      for (const tag of unified.tags) {
        const tagName = tag.normalizedTagName;

        if (tagName === "displayName" || tagName === "format" || tagName === "placeholder") {
          const text = tag.resolvedPayloadText;
          if (text === "") continue;

          const provenance = provenanceForParsedTag(tag, sourceFile, file);
          switch (tagName) {
            case "displayName":
              if (!isMemberTargetDisplayName(text) && displayName === undefined) {
                displayName = text;
                displayNameProvenance = provenance;
              }
              break;

            case "format":
              annotations.push({
                kind: "annotation",
                annotationKind: "format",
                value: text,
                provenance,
              });
              break;

            case "placeholder":
              if (placeholder === undefined) {
                placeholder = text;
                placeholderProvenance = provenance;
              }
              break;
          }
          continue;
        }

        if (TAGS_REQUIRING_RAW_TEXT.has(tagName)) {
          // Consume corresponding compiler-API fallback entry (aligning by tag order).
          // Use choosePreferredPayloadText to handle multi-line payloads: the
          // regex parser's span may only capture the first line (e.g. `{`), while
          // the TS compiler API provides the full content for multi-line payloads.
          const fallback = rawTextFallbacks.get(tagName)?.shift();
          const text = choosePreferredPayloadText(tag.resolvedPayloadText, fallback?.text ?? "");
          if (text === "") continue;

          const provenance = provenanceForParsedTag(tag, sourceFile, file);
          if (tagName === "defaultValue") {
            annotations.push(parseDefaultValueTagValue(text, provenance));
            continue;
          }

          processConstraintTag(
            tagName,
            text,
            tag,
            provenance,
            node,
            sourceFile,
            supportingDeclarations,
            options,
            constraints,
            diagnostics
          );
          continue;
        }

        // Regular constraint tag (not requiring raw text)
        const text = tag.resolvedPayloadText;
        const expectedType = isBuiltinConstraintName(tagName)
          ? BUILTIN_CONSTRAINT_DEFINITIONS[tagName]
          : undefined;
        if (text === "" && expectedType !== "boolean") continue;

        const provenance = provenanceForParsedTag(tag, sourceFile, file);
        processConstraintTag(
          tagName,
          text,
          tag,
          provenance,
          node,
          sourceFile,
          supportingDeclarations,
          options,
          constraints,
          diagnostics
        );
      }

      // Extract @deprecated from the unified parse result
      if (unified.isDeprecated) {
        annotations.push({
          kind: "annotation",
          annotationKind: "deprecated",
          ...(unified.deprecationMessage !== "" && { message: unified.deprecationMessage }),
          provenance: provenanceForComment(range, sourceFile, file, "deprecated"),
        });
      }

      // Summary text → description annotation (spec 002 §2.3)
      if (unified.summaryText !== "") {
        annotations.push({
          kind: "annotation",
          annotationKind: "description",
          value: unified.summaryText,
          provenance: provenanceForComment(range, sourceFile, file, "summary"),
        });
      }

      // @remarks → separate remarks annotation (spec 002 §2.3)
      if (unified.remarksText !== "") {
        annotations.push({
          kind: "annotation",
          annotationKind: "remarks",
          value: unified.remarksText,
          provenance: provenanceForComment(range, sourceFile, file, "remarks"),
        });
      }
    }
  }

  if (displayName !== undefined && displayNameProvenance !== undefined) {
    annotations.push({
      kind: "annotation",
      annotationKind: "displayName",
      value: displayName,
      provenance: displayNameProvenance,
    });
  }

  if (placeholder !== undefined && placeholderProvenance !== undefined) {
    annotations.push({
      kind: "annotation",
      annotationKind: "placeholder",
      value: placeholder,
      provenance: placeholderProvenance,
    });
  }

  // Process orphaned TS compiler API fallbacks: tags found by ts.getJSDocTags()
  // that were not matched by the regex parser (e.g. malformed comment syntax).
  for (const [tagName, fallbacks] of rawTextFallbacks) {
    for (const fallback of fallbacks) {
      const text = fallback.text.trim();
      if (text === "") continue;

      const provenance = fallback.provenance;
      if (tagName === "defaultValue") {
        annotations.push(parseDefaultValueTagValue(text, provenance));
        continue;
      }

      processConstraintTag(
        tagName,
        text,
        null,
        provenance,
        node,
        sourceFile,
        supportingDeclarations,
        options,
        constraints,
        diagnostics
      );
    }
  }

  const result = { constraints, annotations, diagnostics };
  parseResultCache.set(cacheKey, result);
  return result;
}

/**
 * Checks if a TS AST node has a `@deprecated` tag using the unified parser.
 */
export function hasDeprecatedTagTSDoc(node: ts.Node): boolean {
  const sourceFile = node.getSourceFile();
  const sourceText = sourceFile.getFullText();
  const commentRanges = ts.getLeadingCommentRanges(sourceText, node.getFullStart());

  if (commentRanges) {
    for (const range of commentRanges) {
      if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
      const commentText = sourceText.substring(range.pos, range.end);
      if (!commentText.startsWith("/**")) continue;

      if (parseUnifiedComment(commentText).isDeprecated) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extracts root and member-target display-name metadata from a node's JSDoc tags.
 *
 * Member-target display-name tags use the syntax `@displayName :member Label`.
 * The first non-target `@displayName` is returned as the root display name.
 */
export function extractDisplayNameMetadata(node: ts.Node): DisplayNameMetadata {
  let displayName: string | undefined;
  const memberDisplayNames = new Map<string, string>();
  const sourceFile = node.getSourceFile();
  const sourceText = sourceFile.getFullText();
  const commentRanges = ts.getLeadingCommentRanges(sourceText, node.getFullStart());

  if (commentRanges) {
    for (const range of commentRanges) {
      if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
      const commentText = sourceText.substring(range.pos, range.end);
      if (!commentText.startsWith("/**")) continue;

      const unified = parseUnifiedComment(commentText);
      for (const tag of unified.tags) {
        if (tag.normalizedTagName !== "displayName") {
          continue;
        }

        if (tag.target !== null && tag.argumentText !== "") {
          memberDisplayNames.set(tag.target.rawText, tag.argumentText);
          continue;
        }

        if (tag.argumentText !== "") {
          displayName ??= tag.argumentText;
        }
      }
    }
  }

  return {
    ...(displayName !== undefined && { displayName }),
    memberDisplayNames,
  };
}

// =============================================================================
// PUBLIC HELPERS — path target extraction
// =============================================================================

/**
 * Extracts a path-target prefix (`:fieldName`) from constraint tag text.
 * Returns the parsed PathTarget and remaining text, or null if no path target.
 *
 * @example
 * extractPathTarget(":value 0") // → { path: { segments: ["value"] }, remainingText: "0" }
 * extractPathTarget("42")       // → null
 */
export function extractPathTarget(
  text: string
): { path: PathTarget; remainingText: string } | null {
  return extractSharedPathTarget(text);
}

function collectRawTextFallbacks(
  node: ts.Node,
  file: string
): Map<string, { text: string; provenance: Provenance }[]> {
  const fallbacks = new Map<string, { text: string; provenance: Provenance }[]>();

  for (const tag of ts.getJSDocTags(node)) {
    const tagName = normalizeConstraintTagName(tag.tagName.text);
    if (!TAGS_REQUIRING_RAW_TEXT.has(tagName)) continue;

    const commentText = getTagCommentText(tag)?.trim() ?? "";
    if (commentText === "") continue;

    const entries = fallbacks.get(tagName) ?? [];
    entries.push({
      text: commentText,
      provenance: provenanceForJSDocTag(tag, file),
    });
    fallbacks.set(tagName, entries);
  }

  return fallbacks;
}

// =============================================================================
// PRIVATE HELPERS — constraint value parsing
// =============================================================================

function isMemberTargetDisplayName(text: string): boolean {
  return parseTagSyntax("displayName", text).target !== null;
}

// =============================================================================
// PRIVATE HELPERS — provenance
// =============================================================================

function provenanceForComment(
  range: ts.CommentRange,
  sourceFile: ts.SourceFile,
  file: string,
  tagName: string
): Provenance {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(range.pos);
  return {
    surface: "tsdoc",
    file,
    line: line + 1,
    column: character,
    tagName: "@" + tagName,
  };
}

function provenanceForParsedTag(
  tag: ParsedCommentTag,
  sourceFile: ts.SourceFile,
  file: string
): Provenance {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(tag.tagNameSpan.start);
  return {
    surface: "tsdoc",
    file,
    line: line + 1,
    column: character,
    tagName: "@" + tag.normalizedTagName,
  };
}

function provenanceForJSDocTag(tag: ts.JSDocTag, file: string): Provenance {
  const sourceFile = tag.getSourceFile();
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(tag.getStart());
  return {
    surface: "tsdoc",
    file,
    line: line + 1,
    column: character,
    tagName: "@" + tag.tagName.text,
  };
}

/**
 * Extracts the text content from a TypeScript JSDoc tag's comment.
 */
function getTagCommentText(tag: ts.JSDocTag): string | undefined {
  if (tag.comment === undefined) {
    return undefined;
  }
  if (typeof tag.comment === "string") {
    return tag.comment;
  }
  return ts.getTextOfJSDocComment(tag.comment);
}
