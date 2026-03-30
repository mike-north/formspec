import * as ts from "typescript";
import { FORM_SPEC_SYNTHETIC_BATCH_CACHE_ENTRIES } from "./constants.js";
import { LruCache } from "./lru-cache.js";
import { optionalMeasure, type FormSpecPerformanceRecorder } from "./perf-tracing.js";
import {
  getAllTagDefinitions,
  getTagDefinition,
  type ExtensionTagSource,
  type FormSpecPlacement,
  type FormSpecValueKind,
  type TagDefinition,
  type TagSignature,
  type TagSignatureParameter,
} from "./tag-registry.js";

/**
 * Target kinds that can be represented in a synthetic compiler call.
 *
 * This intentionally excludes `"none"`, because a missing target is modeled by
 * omitting the synthetic target argument entirely.
 */
export type SyntheticTagTargetKind = "path" | "member" | "variant";

/**
 * A normalized target argument that can be lowered into a synthetic helper
 * call for compiler-backed validation.
 */
export interface SyntheticTagTargetSpecifier {
  readonly kind: SyntheticTagTargetKind;
  readonly text: string;
}

/**
 * Inputs required to lower a parsed FormSpec tag into a synthetic TypeScript
 * helper call.
 *
 * `hostType` and `subjectType` are trusted snippets of TypeScript type syntax
 * supplied by the caller. They are embedded into an in-memory synthetic source
 * file and are never executed.
 */
export interface LowerSyntheticTagApplicationOptions {
  readonly tagName: string;
  readonly placement: FormSpecPlacement;
  readonly hostType: string;
  readonly subjectType: string;
  readonly target?: SyntheticTagTargetSpecifier | null;
  readonly argumentExpression?: string | null;
  readonly extensions?: readonly ExtensionTagSource[];
}

/**
 * Result of lowering a tag application into the synthetic call representation
 * used for compiler-backed validation.
 */
export interface LoweredSyntheticTagApplication {
  readonly definition: TagDefinition;
  readonly matchingSignatures: readonly TagSignature[];
  readonly callExpression: string;
}

/**
 * A simplified TypeScript diagnostic surfaced from the synthetic compiler pass.
 */
export interface SyntheticCompilerDiagnostic {
  readonly code: number;
  readonly message: string;
}

/**
 * Options for running the TypeScript checker against a synthetic tag call.
 */
export interface CheckSyntheticTagApplicationOptions extends LowerSyntheticTagApplicationOptions {
  readonly supportingDeclarations?: readonly string[];
  readonly performance?: FormSpecPerformanceRecorder;
}

/**
 * Result of checking a lowered synthetic tag application with the TypeScript
 * compiler.
 */
export interface SyntheticTagCheckResult {
  readonly sourceText: string;
  readonly diagnostics: readonly SyntheticCompilerDiagnostic[];
}

/**
 * Options for the minimal synthetic applicability checker that operates on an
 * already-resolved target type instead of reproducing path/member resolution in
 * the synthetic program.
 */
export interface CheckNarrowSyntheticTagApplicabilityOptions {
  readonly tagName: string;
  readonly placement: FormSpecPlacement;
  readonly resolvedTargetType: string;
  readonly targetKind?: SyntheticTagTargetKind | null;
  readonly argumentExpression?: string | null;
  readonly extensions?: readonly ExtensionTagSource[];
  readonly performance?: FormSpecPerformanceRecorder;
}

/**
 * Options for running the minimal synthetic applicability checker against
 * multiple already-resolved target types in a single in-memory program.
 */
export interface CheckNarrowSyntheticTagApplicabilitiesOptions {
  readonly applications: readonly CheckNarrowSyntheticTagApplicabilityOptions[];
  readonly performance?: FormSpecPerformanceRecorder;
}

/**
 * Options for running the TypeScript checker against multiple lowered
 * synthetic tag calls in a single in-memory program.
 */
export interface CheckSyntheticTagApplicationsOptions {
  readonly applications: readonly CheckSyntheticTagApplicationOptions[];
  readonly performance?: FormSpecPerformanceRecorder;
}

const SYNTHETIC_CHECK_EVENT = {
  batch: "analysis.syntheticCheckBatch",
  narrowBatch: "analysis.narrowSyntheticCheckBatch",
} as const;

const PRELUDE_LINES = [
  "type FormSpecPlacement =",
  '  | "class"',
  '  | "class-field"',
  '  | "class-method"',
  '  | "interface"',
  '  | "interface-field"',
  '  | "type-alias"',
  '  | "type-alias-field"',
  '  | "variable"',
  '  | "function"',
  '  | "function-parameter"',
  '  | "method-parameter";',
  "",
  "type FormSpecCapability =",
  '  | "numeric-comparable"',
  '  | "string-like"',
  '  | "array-like"',
  '  | "enum-member-addressable"',
  '  | "json-like"',
  '  | "condition-like"',
  '  | "object-like";',
  "",
  "interface TagContext<P extends FormSpecPlacement, Host, Subject> {",
  "  readonly placement: P;",
  "  readonly hostType: Host;",
  "  readonly subjectType: Subject;",
  "}",
  "",
  "type NonNullish<T> = Exclude<T, null | undefined>;",
  "",
  "type ProvidesCapability<T, Capability extends FormSpecCapability> =",
  '  Capability extends "numeric-comparable"',
  "    ? NonNullish<T> extends number | bigint",
  "      ? true",
  "      : false",
  '    : Capability extends "string-like"',
  "      ? NonNullish<T> extends string",
  "        ? true",
  "        : false",
  '      : Capability extends "array-like"',
  "        ? NonNullish<T> extends readonly unknown[]",
  "          ? true",
  "          : false",
  '        : Capability extends "enum-member-addressable"',
  "          ? NonNullish<T> extends string",
  "            ? true",
  "            : false",
  '          : Capability extends "json-like"',
  "            ? true",
  '            : Capability extends "condition-like"',
  "              ? true",
  '              : Capability extends "object-like"',
  "                ? NonNullish<T> extends readonly unknown[]",
  "                  ? false",
  "                  : NonNullish<T> extends object",
  "                    ? true",
  "                    : false",
  "                : false;",
  "",
  "type NestedPathOfCapability<Subject, Capability extends FormSpecCapability> =",
  "  NonNullish<Subject> extends readonly (infer Item)[]",
  "    ? NestedPathOfCapability<Item, Capability>",
  "    : NonNullish<Subject> extends object",
  "      ? {",
  "          [Key in Extract<keyof NonNullish<Subject>, string>]:",
  "            | (ProvidesCapability<NonNullish<Subject>[Key], Capability> extends true ? Key : never)",
  "            | (NestedPathOfCapability<NonNullish<Subject>[Key], Capability> extends never",
  "                ? never",
  "                : `${Key}.${NestedPathOfCapability<NonNullish<Subject>[Key], Capability>}`);",
  "        }[Extract<keyof NonNullish<Subject>, string>]",
  "      : never;",
  "",
  "type PathOfCapability<Subject, Capability extends FormSpecCapability> =",
  "  NestedPathOfCapability<Subject, Capability>;",
  "",
  "type MemberTarget<Subject> = Extract<keyof NonNullish<Subject>, string>;",
  "",
  'type VariantTarget<Subject> = "singular" | "plural";',
  "",
  "type FormSpecCondition = unknown;",
  "type JsonValue = unknown;",
  "",
  "declare function __ctx<P extends FormSpecPlacement, Host, Subject>(): TagContext<P, Host, Subject>;",
  "declare function __path<Subject, Capability extends FormSpecCapability>(",
  "  path: PathOfCapability<Subject, Capability>",
  "): PathOfCapability<Subject, Capability>;",
  "declare function __member<Subject>(member: MemberTarget<Subject>): MemberTarget<Subject>;",
  "declare function __variant<Subject>(variant: VariantTarget<Subject>): VariantTarget<Subject>;",
] as const;

function placementUnion(placements: readonly FormSpecPlacement[]): string {
  return placements.map((placement) => JSON.stringify(placement)).join(" | ");
}

function renderValueType(valueKind: FormSpecValueKind | undefined): string {
  switch (valueKind) {
    case "number":
    case "integer":
    case "signedInteger":
      return "number";
    case "string":
      return "string";
    case "json":
      return "JsonValue";
    case "boolean":
      return "boolean";
    case "condition":
      return "FormSpecCondition";
    case undefined:
      return "unknown";
    default: {
      const exhaustive: never = valueKind;
      return exhaustive;
    }
  }
}

function renderTargetParameterType(parameter: TagSignatureParameter): string {
  switch (parameter.kind) {
    case "target-path":
      return parameter.capability === undefined
        ? "PathOfCapability<Subject, FormSpecCapability>"
        : `PathOfCapability<Subject, ${JSON.stringify(parameter.capability)}>`;
    case "target-member":
      return "MemberTarget<Subject>";
    case "target-variant":
      return "VariantTarget<Subject>";
    case "value":
      return renderValueType(parameter.valueKind);
    default: {
      const exhaustive: never = parameter.kind;
      return exhaustive;
    }
  }
}

function renderNarrowValueType(valueKind: FormSpecValueKind | undefined): string {
  switch (valueKind) {
    case "number":
    case "integer":
    case "signedInteger":
      return "number";
    case "string":
      return "string";
    case "json":
      return "JsonValue";
    case "boolean":
      return "boolean";
    case "condition":
      return "FormSpecCondition";
    case undefined:
      return "unknown";
    default: {
      const exhaustive: never = valueKind;
      return exhaustive;
    }
  }
}

function renderSignature(tagName: string, signature: TagSignature): string {
  const parameters = signature.parameters.map((parameter, index) => {
    const name = parameter.kind === "value" ? "value" : `target${String(index)}`;
    return `${name}: ${renderTargetParameterType(parameter)}`;
  });

  return [
    `  function ${getSyntheticTagHelperName(tagName)}<Host, Subject>(`,
    `    ctx: TagContext<${placementUnion(signature.placements)}, Host, Subject>${
      parameters.length > 0 ? "," : ""
    }`,
    ...parameters.map(
      (parameter, index) => `    ${parameter}${index === parameters.length - 1 ? "" : ","}`
    ),
    "  ): void;",
  ].join("\n");
}

function getSyntheticTagHelperName(tagName: string): string {
  return `tag_${tagName}`;
}

function targetKindForParameter(parameter: TagSignatureParameter): SyntheticTagTargetKind | null {
  switch (parameter.kind) {
    case "target-path":
      return "path";
    case "target-member":
      return "member";
    case "target-variant":
      return "variant";
    case "value":
      return null;
    default: {
      const exhaustive: never = parameter.kind;
      return exhaustive;
    }
  }
}

function getSignatureTargetKind(signature: TagSignature): SyntheticTagTargetKind | null {
  for (const parameter of signature.parameters) {
    const targetKind = targetKindForParameter(parameter);
    if (targetKind !== null) {
      return targetKind;
    }
  }

  return null;
}

function getTargetParameter(
  signature: TagSignature
): Exclude<TagSignatureParameter, { kind: "value" }> | null {
  return (
    signature.parameters.find(
      (parameter): parameter is Exclude<TagSignatureParameter, { kind: "value" }> =>
        parameter.kind !== "value"
    ) ?? null
  );
}

function getPathTargetCapability(signature: TagSignature): string {
  const parameter = getTargetParameter(signature);
  if (parameter?.kind !== "target-path") {
    throw new Error(`Invariant violation: expected a path-target synthetic signature`);
  }
  if (parameter.capability === undefined) {
    throw new Error(
      `Invariant violation: path-target synthetic signatures must declare a capability`
    );
  }

  return JSON.stringify(parameter.capability);
}

function renderTargetArgument(
  target: SyntheticTagTargetSpecifier,
  signature: TagSignature,
  subjectType: string
): string {
  switch (target.kind) {
    case "path":
      return `__path<${subjectType}, ${getPathTargetCapability(signature)}>(${JSON.stringify(
        target.text
      )})`;
    case "member":
      return `__member<${subjectType}>(${JSON.stringify(target.text)})`;
    case "variant":
      return `__variant<${subjectType}>(${JSON.stringify(target.text)})`;
  }
}

/**
 * Filters a tag definition's overloads down to the ones that apply to the
 * requested placement and synthetic target form.
 *
 * This is the overload-selection primitive used by both the lowering phase
 * and cursor-aware tooling that wants to show only the currently-applicable
 * signatures for a tag.
 */
export function getMatchingTagSignatures(
  definition: TagDefinition,
  placement: FormSpecPlacement,
  targetKind: SyntheticTagTargetKind | null
): readonly TagSignature[] {
  return definition.signatures.filter(
    (signature) =>
      signature.placements.includes(placement) && getSignatureTargetKind(signature) === targetKind
  );
}

/**
 * Builds the synthetic helper declarations used to validate FormSpec tag
 * applications through the TypeScript checker.
 *
 * The returned string is a virtual `.d.ts`-style prelude that declares the
 * `__formspec.*` helper namespace together with context, path, member, and
 * variant helper types. It is intended to be embedded into an in-memory
 * TypeScript program, never emitted to disk.
 */
export function buildSyntheticHelperPrelude(extensions?: readonly ExtensionTagSource[]): string {
  const lines = [...PRELUDE_LINES, "", "declare namespace __formspec {"];

  for (const definition of getAllTagDefinitions(extensions)) {
    for (const signature of definition.signatures) {
      lines.push(renderSignature(definition.canonicalName, signature));
    }
  }

  lines.push("}");
  return lines.join("\n");
}

/**
 * Lowers a normalized tag application into a synthetic helper call.
 *
 * The caller is responsible for supplying trusted `hostType` and `subjectType`
 * snippets that are valid TypeScript type syntax in the generated synthetic
 * program. This function does not sanitize those snippets; it only assembles
 * the helper call and selects the matching overload metadata.
 */
export function lowerTagApplicationToSyntheticCall(
  options: LowerSyntheticTagApplicationOptions
): LoweredSyntheticTagApplication {
  const definition = getTagDefinition(options.tagName, options.extensions);
  if (definition === null) {
    throw new Error(`Unknown FormSpec tag: ${options.tagName}`);
  }

  const targetKind = options.target?.kind ?? null;
  const matchingSignatures = getMatchingTagSignatures(definition, options.placement, targetKind);
  if (matchingSignatures.length === 0) {
    throw new Error(
      `No synthetic signature for @${definition.canonicalName} on placement "${options.placement}"` +
        (targetKind === null ? "" : ` with target kind "${targetKind}"`)
    );
  }

  const args = [
    `__ctx<${JSON.stringify(options.placement)}, ${options.hostType}, ${options.subjectType}>()`,
  ];
  const signature = matchingSignatures[0];
  if (signature === undefined) {
    throw new Error(
      `Invariant violation: missing synthetic signature for @${definition.canonicalName}`
    );
  }

  if (options.target !== undefined && options.target !== null) {
    args.push(renderTargetArgument(options.target, signature, options.subjectType));
  }

  if (options.argumentExpression !== undefined && options.argumentExpression !== null) {
    args.push(options.argumentExpression);
  }

  return {
    definition,
    matchingSignatures,
    callExpression: `__formspec.${getSyntheticTagHelperName(definition.canonicalName)}(${args.join(", ")});`,
  };
}

function createSyntheticCompilerHost(
  fileName: string,
  sourceText: string,
  compilerOptions: ts.CompilerOptions
): ts.CompilerHost {
  const host = ts.createCompilerHost(compilerOptions, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);

  host.getSourceFile = (requestedFileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (requestedFileName === fileName) {
      return ts.createSourceFile(requestedFileName, sourceText, languageVersion, true);
    }

    return originalGetSourceFile(
      requestedFileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile
    );
  };

  host.readFile = (requestedFileName) => {
    if (requestedFileName === fileName) {
      return sourceText;
    }
    return ts.sys.readFile(requestedFileName);
  };

  host.fileExists = (requestedFileName) =>
    requestedFileName === fileName || ts.sys.fileExists(requestedFileName);

  host.writeFile = () => undefined;
  return host;
}

const NARROW_PRELUDE_LINES = [
  "type FormSpecCapability =",
  '  | "numeric-comparable"',
  '  | "string-like"',
  '  | "array-like"',
  '  | "enum-member-addressable"',
  '  | "json-like"',
  '  | "condition-like"',
  '  | "object-like";',
  "",
  "type NonNullish<T> = Exclude<T, null | undefined>;",
  "",
  "type ProvidesCapability<T, Capability extends FormSpecCapability> =",
  '  Capability extends "numeric-comparable"',
  "    ? NonNullish<T> extends number | bigint",
  "      ? true",
  "      : false",
  '    : Capability extends "string-like"',
  "      ? NonNullish<T> extends string",
  "        ? true",
  "        : false",
  '      : Capability extends "array-like"',
  "        ? NonNullish<T> extends readonly unknown[]",
  "          ? true",
  "          : false",
  '        : Capability extends "enum-member-addressable"',
  "          ? NonNullish<T> extends string",
  "            ? true",
  "            : false",
  '          : Capability extends "json-like"',
  "            ? true",
  '            : Capability extends "condition-like"',
  "              ? true",
  '              : Capability extends "object-like"',
  "                ? NonNullish<T> extends readonly unknown[]",
  "                  ? false",
  "                  : NonNullish<T> extends object",
  "                    ? true",
  "                    : false",
  "                : false;",
  "",
  "type __AssertTrue<T extends true> = T;",
  "type __IsAssignable<Actual, Expected> = [Actual] extends [Expected] ? true : false;",
  "type JsonValue = unknown;",
  "type FormSpecCondition = unknown;",
] as const;

function getSignatureValueParameter(signature: TagSignature): TagSignatureParameter | null {
  return signature.parameters.find((parameter) => parameter.kind === "value") ?? null;
}

function getTargetCapabilityForSignature(
  definition: TagDefinition,
  signature: TagSignature,
  targetKind: SyntheticTagTargetKind | null
): string | null {
  if (targetKind === null) {
    return definition.capabilities[0] ?? null;
  }

  const targetParameter = getTargetParameter(signature);
  return targetParameter?.capability ?? null;
}

function buildNarrowSyntheticSourceBodyLines(
  definition: TagDefinition,
  signature: TagSignature,
  options: CheckNarrowSyntheticTagApplicabilityOptions
): string[] {
  const lines: string[] = [];
  lines.push(`type __Target = ${options.resolvedTargetType};`);

  const capability = getTargetCapabilityForSignature(
    definition,
    signature,
    options.targetKind ?? null
  );
  if (capability !== null) {
    lines.push(
      `type __CheckTarget = __AssertTrue<ProvidesCapability<__Target, ${JSON.stringify(capability)}>>;`
    );
  }

  const valueParameter = getSignatureValueParameter(signature);
  if (
    valueParameter?.kind === "value" &&
    options.argumentExpression !== undefined &&
    options.argumentExpression !== null
  ) {
    lines.push(`const __value = ${options.argumentExpression};`);
    lines.push("type __Value = typeof __value;");
    lines.push(
      `type __CheckValue = __AssertTrue<__IsAssignable<__Value, ${renderNarrowValueType(
        valueParameter.valueKind
      )}>>;`
    );
  }

  return lines;
}

function flattenDiagnosticMessage(message: string | ts.DiagnosticMessageChain): string {
  return ts.flattenDiagnosticMessageText(message, "\n");
}

const SYNTHETIC_COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  lib: ["lib.es2022.d.ts"],
  types: [],
};

const syntheticBatchResultCache = new LruCache<string, readonly SyntheticTagCheckResult[]>(
  FORM_SPEC_SYNTHETIC_BATCH_CACHE_ENTRIES
);

interface SyntheticBatchApplication {
  readonly lowered: LoweredSyntheticTagApplication;
  readonly options: CheckSyntheticTagApplicationOptions;
}

interface NarrowSyntheticBatchApplication {
  readonly definition: TagDefinition;
  readonly signature: TagSignature;
  readonly options: CheckNarrowSyntheticTagApplicabilityOptions;
}

interface SyntheticBatchSource {
  readonly sourceText: string;
  readonly applicationLineRanges: readonly {
    readonly startLine: number;
    readonly endLine: number;
  }[];
}

function pushChunkLines(target: string[], chunk: string): void {
  target.push(...chunk.split("\n"));
}

function buildSyntheticBatchSource(
  applications: readonly SyntheticBatchApplication[]
): SyntheticBatchSource {
  const lines: string[] = [];
  pushChunkLines(lines, buildSyntheticHelperPrelude(collectBatchExtensions(applications)));
  lines.push("");

  const applicationLineRanges: {
    readonly startLine: number;
    readonly endLine: number;
  }[] = [];

  for (const [index, application] of applications.entries()) {
    const namespaceName = `__formspec_app_${String(index)}`;
    const startLine = lines.length;
    lines.push(`namespace ${namespaceName} {`);
    for (const declaration of application.options.supportingDeclarations ?? []) {
      pushChunkLines(lines, declaration);
    }
    lines.push(`type __Host = ${application.options.hostType};`);
    lines.push(`type __Subject = ${application.options.subjectType};`);
    lines.push(application.lowered.callExpression);
    lines.push("}");
    applicationLineRanges.push({
      startLine,
      endLine: lines.length - 1,
    });
  }

  return {
    sourceText: lines.join("\n"),
    applicationLineRanges,
  };
}

function buildNarrowSyntheticBatchSource(
  applications: readonly NarrowSyntheticBatchApplication[]
): SyntheticBatchSource {
  const lines = [...NARROW_PRELUDE_LINES, ""];
  const applicationLineRanges: {
    readonly startLine: number;
    readonly endLine: number;
  }[] = [];

  for (const [index, application] of applications.entries()) {
    const namespaceName = `__formspec_narrow_app_${String(index)}`;
    const startLine = lines.length;
    lines.push(`namespace ${namespaceName} {`);
    lines.push(
      ...buildNarrowSyntheticSourceBodyLines(
        application.definition,
        application.signature,
        application.options
      )
    );
    lines.push("}");
    applicationLineRanges.push({
      startLine,
      endLine: lines.length - 1,
    });
  }

  return {
    sourceText: lines.join("\n"),
    applicationLineRanges,
  };
}

function collectBatchExtensions(
  applications: readonly SyntheticBatchApplication[]
): readonly ExtensionTagSource[] | undefined {
  const extensions = applications.flatMap((application) => application.options.extensions ?? []);
  return extensions.length === 0 ? undefined : extensions;
}

function mapBatchDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
  sourceFile: ts.SourceFile,
  applicationLineRanges: readonly {
    readonly startLine: number;
    readonly endLine: number;
  }[]
): readonly SyntheticTagCheckResult[] {
  const diagnosticsByApplication = applicationLineRanges.map<SyntheticCompilerDiagnostic[]>(
    () => []
  );
  const defaultResult = diagnosticsByApplication[0];

  for (const diagnostic of diagnostics) {
    const serialized = {
      code: diagnostic.code,
      message: flattenDiagnosticMessage(diagnostic.messageText),
    };
    if (diagnostic.file === undefined || diagnostic.start === undefined) {
      if (defaultResult !== undefined) {
        defaultResult.push(serialized);
      }
      continue;
    }

    const line = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line;
    const applicationIndex = applicationLineRanges.findIndex(
      (range) => line >= range.startLine && line <= range.endLine
    );
    if (applicationIndex < 0) {
      if (defaultResult !== undefined) {
        defaultResult.push(serialized);
      }
      continue;
    }
    const targetResult = diagnosticsByApplication[applicationIndex];
    if (targetResult !== undefined) {
      targetResult.push(serialized);
    }
  }

  return diagnosticsByApplication.map((diagnosticsForApplication) => ({
    sourceText: sourceFile.text,
    diagnostics: diagnosticsForApplication,
  }));
}

function runSyntheticProgram(
  fileName: string,
  sourceText: string,
  performance: FormSpecPerformanceRecorder | undefined,
  eventPrefix: string,
  missingSourceFileMessage: string
): {
  readonly sourceFile: ts.SourceFile;
  readonly diagnostics: readonly ts.Diagnostic[];
} {
  const host = optionalMeasure(performance, `${eventPrefix}.createCompilerHost`, undefined, () =>
    createSyntheticCompilerHost(fileName, sourceText, SYNTHETIC_COMPILER_OPTIONS)
  );
  const program = optionalMeasure(performance, `${eventPrefix}.createProgram`, undefined, () =>
    ts.createProgram([fileName], SYNTHETIC_COMPILER_OPTIONS, host)
  );
  const diagnostics = optionalMeasure(
    performance,
    `${eventPrefix}.getPreEmitDiagnostics`,
    undefined,
    () =>
      ts
        .getPreEmitDiagnostics(program)
        .filter(
          (diagnostic) => diagnostic.file === undefined || diagnostic.file.fileName === fileName
        )
  );
  const sourceFile = program.getSourceFile(fileName);
  if (sourceFile === undefined) {
    throw new Error(missingSourceFileMessage);
  }

  return {
    sourceFile,
    diagnostics,
  };
}

interface BatchSyntheticCheckOptions<TApplication, TResolvedApplication> {
  readonly applications: readonly TApplication[];
  readonly performance: FormSpecPerformanceRecorder | undefined;
  readonly cache: LruCache<string, readonly SyntheticTagCheckResult[]>;
  readonly eventPrefix: string;
  readonly missingSourceFileMessage: string;
  readonly fileName: string;
  readonly lowerApplications: (
    applications: readonly TApplication[],
    performance: FormSpecPerformanceRecorder | undefined
  ) => readonly TResolvedApplication[];
  readonly buildBatchSource: (
    applications: readonly TResolvedApplication[],
    performance: FormSpecPerformanceRecorder | undefined
  ) => SyntheticBatchSource;
}

function runBatchSyntheticCheck<TApplication, TResolvedApplication>(
  options: BatchSyntheticCheckOptions<TApplication, TResolvedApplication>
): readonly SyntheticTagCheckResult[] {
  if (options.applications.length === 0) {
    return [];
  }

  const resolvedApplications = options.lowerApplications(options.applications, options.performance);
  const batchSource = options.buildBatchSource(resolvedApplications, options.performance);
  const cached = options.cache.get(batchSource.sourceText);
  if (cached !== undefined) {
    options.performance?.record({
      name: `${options.eventPrefix}.cacheHit`,
      durationMs: 0,
      detail: {
        applicationCount: options.applications.length,
      },
    });
    return cached;
  }

  options.performance?.record({
    name: `${options.eventPrefix}.cacheMiss`,
    durationMs: 0,
    detail: {
      applicationCount: options.applications.length,
    },
  });

  const { sourceFile, diagnostics } = runSyntheticProgram(
    options.fileName,
    batchSource.sourceText,
    options.performance,
    options.eventPrefix,
    options.missingSourceFileMessage
  );
  const results = optionalMeasure(
    options.performance,
    `${options.eventPrefix}.mapDiagnostics`,
    undefined,
    () => mapBatchDiagnostics(diagnostics, sourceFile, batchSource.applicationLineRanges)
  );
  options.cache.set(batchSource.sourceText, results);
  return results;
}

function resolveNarrowSyntheticBatchApplication(
  application: CheckNarrowSyntheticTagApplicabilityOptions
): NarrowSyntheticBatchApplication {
  const definition = getTagDefinition(application.tagName, application.extensions);
  if (definition === null) {
    throw new Error(`Unknown FormSpec tag: ${application.tagName}`);
  }

  const targetKind = application.targetKind ?? null;
  const matchingSignatures = getMatchingTagSignatures(
    definition,
    application.placement,
    targetKind
  );
  if (matchingSignatures.length === 0) {
    throw new Error(
      `No synthetic signature for @${definition.canonicalName} on placement "${application.placement}"` +
        (targetKind === null ? "" : ` with target kind "${targetKind}"`)
    );
  }

  const signature = matchingSignatures[0];
  if (signature === undefined) {
    throw new Error(
      `Invariant violation: missing narrow synthetic signature for @${definition.canonicalName}`
    );
  }

  return {
    definition,
    signature,
    options: application,
  };
}

/**
 * Runs the TypeScript checker once against multiple lowered synthetic tag
 * applications and returns per-application diagnostics.
 */
export function checkSyntheticTagApplications(
  options: CheckSyntheticTagApplicationsOptions
): readonly SyntheticTagCheckResult[] {
  return runBatchSyntheticCheck<CheckSyntheticTagApplicationOptions, SyntheticBatchApplication>({
    applications: options.applications,
    performance: options.performance,
    cache: syntheticBatchResultCache,
    eventPrefix: SYNTHETIC_CHECK_EVENT.batch,
    missingSourceFileMessage: "Invariant violation: missing synthetic batch source file",
    fileName: "/virtual/formspec-synthetic-batch.ts",
    lowerApplications: (applications, performance) =>
      optionalMeasure(performance, `${SYNTHETIC_CHECK_EVENT.batch}.lower`, undefined, () =>
        applications.map((application) => ({
          options: application,
          lowered: lowerTagApplicationToSyntheticCall({
            ...application,
            hostType: "__Host",
            subjectType: "__Subject",
          }),
        }))
      ),
    buildBatchSource: (applications, performance) =>
      optionalMeasure(performance, `${SYNTHETIC_CHECK_EVENT.batch}.buildSource`, undefined, () =>
        buildSyntheticBatchSource(applications)
      ),
  });
}

/**
 * Runs the minimal synthetic applicability checker once against multiple
 * already-resolved target types and returns per-application diagnostics.
 */
export function checkNarrowSyntheticTagApplicabilities(
  options: CheckNarrowSyntheticTagApplicabilitiesOptions
): readonly SyntheticTagCheckResult[] {
  return runBatchSyntheticCheck<
    CheckNarrowSyntheticTagApplicabilityOptions,
    NarrowSyntheticBatchApplication
  >({
    applications: options.applications,
    performance: options.performance,
    cache: syntheticBatchResultCache,
    eventPrefix: SYNTHETIC_CHECK_EVENT.narrowBatch,
    missingSourceFileMessage: "Invariant violation: missing narrow synthetic batch source file",
    fileName: "/virtual/formspec-narrow-synthetic-batch.ts",
    lowerApplications: (applications, performance) =>
      optionalMeasure(performance, `${SYNTHETIC_CHECK_EVENT.narrowBatch}.lower`, undefined, () =>
        applications.map(resolveNarrowSyntheticBatchApplication)
      ),
    buildBatchSource: (applications, performance) =>
      optionalMeasure(
        performance,
        `${SYNTHETIC_CHECK_EVENT.narrowBatch}.buildSource`,
        undefined,
        () => buildNarrowSyntheticBatchSource(applications)
      ),
  });
}

/**
 * Runs the TypeScript checker against a lowered synthetic tag application.
 *
 * This is the compiler-backed validation entrypoint used by FormSpec analysis
 * to verify placement, target binding, and argument compatibility without
 * requiring comment tags themselves to be valid TypeScript syntax.
 */
export function checkSyntheticTagApplication(
  options: CheckSyntheticTagApplicationOptions
): SyntheticTagCheckResult {
  const result = checkSyntheticTagApplications({
    applications: [options],
    ...(options.performance === undefined ? {} : { performance: options.performance }),
  })[0];
  if (result === undefined) {
    throw new Error("Invariant violation: missing synthetic batch result for singular check");
  }
  return result;
}

/**
 * Runs a minimal synthetic applicability check against an already-resolved
 * target type. This avoids reproducing path/member resolution in the synthetic
 * program and isolates only the type-compatibility question.
 */
export function checkNarrowSyntheticTagApplicability(
  options: CheckNarrowSyntheticTagApplicabilityOptions
): SyntheticTagCheckResult {
  const result = checkNarrowSyntheticTagApplicabilities({
    applications: [options],
    ...(options.performance === undefined ? {} : { performance: options.performance }),
  })[0];
  if (result === undefined) {
    throw new Error(
      "Invariant violation: missing narrow synthetic batch result for singular check"
    );
  }
  return result;
}
