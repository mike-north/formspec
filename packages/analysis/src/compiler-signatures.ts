import * as ts from "typescript";
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
}

/**
 * Result of checking a lowered synthetic tag application with the TypeScript
 * compiler.
 */
export interface SyntheticTagCheckResult {
  readonly sourceText: string;
  readonly diagnostics: readonly SyntheticCompilerDiagnostic[];
}

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

function getTargetParameter(signature: TagSignature): Exclude<TagSignatureParameter, { kind: "value" }> | null {
  return (
    signature.parameters.find(
      (
        parameter
      ): parameter is Exclude<TagSignatureParameter, { kind: "value" }> => parameter.kind !== "value"
    ) ?? null
  );
}

function getPathTargetCapability(signature: TagSignature): string {
  const parameter = getTargetParameter(signature);
  if (parameter?.kind !== "target-path") {
    throw new Error(`Invariant violation: expected a path-target synthetic signature`);
  }
  if (parameter.capability === undefined) {
    throw new Error(`Invariant violation: path-target synthetic signatures must declare a capability`);
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
 * Filters a tag definition's signatures down to the ones that apply to the
 * requested placement and synthetic target form.
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

function flattenDiagnosticMessage(message: string | ts.DiagnosticMessageChain): string {
  return ts.flattenDiagnosticMessageText(message, "\n");
}

export function checkSyntheticTagApplication(
  options: CheckSyntheticTagApplicationOptions
): SyntheticTagCheckResult {
  const lowered = lowerTagApplicationToSyntheticCall(options);
  const sourceText = [
    buildSyntheticHelperPrelude(options.extensions),
    "",
    ...(options.supportingDeclarations ?? []),
    "",
    lowered.callExpression,
  ].join("\n");
  const fileName = "/virtual/formspec-synthetic.ts";
  const compilerOptions: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    lib: ["lib.es2022.d.ts"],
  };
  const host = createSyntheticCompilerHost(fileName, sourceText, compilerOptions);
  const program = ts.createProgram([fileName], compilerOptions, host);
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file === undefined || diagnostic.file.fileName === fileName)
    .map((diagnostic) => ({
      code: diagnostic.code,
      message: flattenDiagnosticMessage(diagnostic.messageText),
    }));

  return {
    sourceText,
    diagnostics,
  };
}
