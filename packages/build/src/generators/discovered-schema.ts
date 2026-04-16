import * as ts from "typescript";
import { analyzeMetadataForNodeWithChecker } from "@formspec/analysis/internal";
import type {
  AnnotationNode,
  ObjectProperty,
  TypeDefinition,
  TypeNode,
} from "@formspec/core/internals";
import type { ResolvedMetadata } from "@formspec/core";
import type { UISchema } from "../ui-schema/types.js";
import type { StaticBuildContext } from "../static-build.js";
import {
  analyzeDeclarationRootInfo,
  analyzeClassToIR,
  analyzeInterfaceToIR,
  analyzeTypeAliasToIR,
  createAnalyzerMetadataPolicy,
  resolveTypeNode,
  type IRClassAnalysis,
} from "../analyzer/class-analyzer.js";
import {
  generateClassSchemas,
  type ClassSchemas,
  type StaticSchemaGenerationOptions,
} from "./class-schema.js";
import { generateJsonSchemaFromIR, type JsonSchema2020 } from "../json-schema/ir-generator.js";
import { IR_VERSION, type FieldNode } from "@formspec/core/internals";
import type { ConstraintSemanticDiagnostic } from "@formspec/analysis/internal";
import {
  getDeclarationMetadataPolicy,
  mergeResolvedMetadata,
  normalizeMetadataPolicy,
  resolveFormIRMetadata,
} from "../metadata/index.js";

/**
 * Generated schemas for a discovered declaration or signature type.
 *
 * `uiSchema` is `null` when the discovered type does not have an object-shaped
 * root that can be represented as a JSON Forms layout.
 *
 * @public
 */
export interface DiscoveredTypeSchemas {
  /** JSON Schema 2020-12 for the resolved type. */
  readonly jsonSchema: JsonSchema2020;
  /** UI Schema for object-shaped roots, or `null` when not applicable. */
  readonly uiSchema: UISchema | null;
  /**
   * Resolved type-level metadata used during generation, when available.
   *
   * This preserves explicit and inferred naming metadata such as singular and
   * plural API/display names for consumers that need the resolved values in
   * addition to the emitted schema artifacts.
   */
  readonly resolvedMetadata?: ResolvedMetadata | undefined;
}

/**
 * Supported declaration kinds for declaration-driven schema generation.
 *
 * @public
 */
export type SchemaSourceDeclaration =
  | ts.ClassDeclaration
  | ts.InterfaceDeclaration
  | ts.TypeAliasDeclaration;

/**
 * Supported declaration kinds for standalone metadata resolution.
 *
 * This helper is intentionally limited to named type declarations,
 * methods/functions, and object-like properties. It does not currently expose
 * parameter or variable metadata resolution on the public build surface.
 *
 * @public
 */
export type MetadataSourceDeclaration =
  | SchemaSourceDeclaration
  | ts.MethodDeclaration
  | ts.FunctionDeclaration
  | ts.PropertyDeclaration
  | ts.PropertySignature;

/**
 * Options for generating schemas from a resolved declaration.
 *
 * @public
 */
export interface GenerateSchemasFromDeclarationOptions extends StaticSchemaGenerationOptions {
  /** Supported build context used for checker access and related analysis. */
  readonly context: StaticBuildContext;
  /** Declaration to turn into schemas. */
  readonly declaration: SchemaSourceDeclaration;
}

/**
 * Options for generating schemas from a resolved TypeScript type.
 *
 * @public
 */
export interface GenerateSchemasFromTypeOptions extends StaticSchemaGenerationOptions {
  /** Supported build context used for checker access and related analysis. */
  readonly context: StaticBuildContext;
  /** TypeScript type to turn into schemas. */
  readonly type: ts.Type;
  /**
   * Optional source node associated with the type.
   *
   * When provided, FormSpec uses it as the source location for provenance and
   * inline-type analysis.
   */
  readonly sourceNode?: ts.Node | undefined;
  /** Optional logical name used for anonymous roots. */
  readonly name?: string | undefined;
}

/**
 * Options for generating schemas from a method or function parameter type.
 *
 * @public
 */
export interface GenerateSchemasFromParameterOptions extends StaticSchemaGenerationOptions {
  /** Supported build context used for checker access and related analysis. */
  readonly context: StaticBuildContext;
  /** Parameter declaration whose type should be converted into schemas. */
  readonly parameter: ts.ParameterDeclaration;
}

/**
 * Options for generating schemas from a method or function return type.
 *
 * @public
 */
export interface GenerateSchemasFromReturnTypeOptions extends StaticSchemaGenerationOptions {
  /** Supported build context used for checker access and related analysis. */
  readonly context: StaticBuildContext;
  /** Signature declaration whose return type should be converted into schemas. */
  readonly declaration: ts.SignatureDeclaration;
}

/**
 * Options for resolving metadata from a declaration against the active
 * metadata policy.
 *
 * @public
 */
export interface ResolveDeclarationMetadataOptions extends StaticSchemaGenerationOptions {
  /** Supported build context used for checker access and related analysis. */
  readonly context: StaticBuildContext;
  /** Declaration whose metadata should be resolved. */
  readonly declaration: MetadataSourceDeclaration;
}

function toDiscoveredTypeSchemas(
  result: ClassSchemas,
  resolvedMetadata?: ResolvedMetadata
): DiscoveredTypeSchemas {
  return {
    ...result,
    ...(resolvedMetadata !== undefined && { resolvedMetadata }),
  };
}

function isNamedTypeDeclaration(
  declaration: ts.Declaration
): declaration is ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration {
  return (
    ts.isClassDeclaration(declaration) ||
    ts.isInterfaceDeclaration(declaration) ||
    ts.isTypeAliasDeclaration(declaration)
  );
}

function hasConcreteTypeArguments(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (
    "aliasTypeArguments" in type &&
    Array.isArray(type.aliasTypeArguments) &&
    type.aliasTypeArguments.length > 0
  ) {
    return true;
  }

  if ((type.flags & ts.TypeFlags.Object) === 0) {
    return false;
  }

  const objectType = type as ts.ObjectType;
  if ((objectType.objectFlags & ts.ObjectFlags.Reference) === 0) {
    return false;
  }

  return checker.getTypeArguments(objectType as ts.TypeReference).length > 0;
}

function getNamedTypeDeclaration(
  type: ts.Type
): ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration | undefined {
  const symbol = type.getSymbol();
  if (symbol?.declarations !== undefined) {
    const declaration = symbol.declarations[0];
    if (declaration !== undefined && isNamedTypeDeclaration(declaration)) {
      return declaration;
    }
  }

  const aliasDeclaration = type.aliasSymbol?.declarations?.find(ts.isTypeAliasDeclaration);
  return aliasDeclaration;
}

function getFallbackName(sourceNode: ts.Node | undefined, fallback = "AnonymousType"): string {
  if (sourceNode !== undefined && "name" in sourceNode) {
    const namedNode = sourceNode as ts.Node & { name?: ts.PropertyName | ts.BindingName };
    if (namedNode.name !== undefined && ts.isIdentifier(namedNode.name)) {
      return namedNode.name.text;
    }
  }

  return fallback;
}

function createObjectRootAnalysis(
  name: string,
  properties: readonly ObjectProperty[],
  typeRegistry: Record<string, TypeDefinition>,
  metadata?: ResolvedMetadata,
  annotations?: readonly AnnotationNode[]
): IRClassAnalysis {
  const fields: FieldNode[] = properties.map((property) => ({
    kind: "field",
    name: property.name,
    ...(property.metadata !== undefined && { metadata: property.metadata }),
    type: property.type,
    required: !property.optional,
    constraints: property.constraints,
    annotations: property.annotations,
    provenance: property.provenance,
  }));

  return {
    name,
    ...(metadata !== undefined && { metadata }),
    fields,
    fieldLayouts: fields.map(() => ({})),
    typeRegistry,
    ...(annotations !== undefined && annotations.length > 0 && { annotations }),
    instanceMethods: [],
    staticMethods: [],
    diagnostics: [],
  };
}

interface RootTypeDescriptor {
  readonly name: string;
  readonly metadata?: ResolvedMetadata;
  readonly annotations?: readonly AnnotationNode[];
  readonly type: TypeNode;
}

interface RootTypeOverride {
  readonly name?: string;
  readonly metadata?: ResolvedMetadata;
  readonly annotations?: readonly AnnotationNode[];
}

function omitApiName(metadata: ResolvedMetadata | undefined): ResolvedMetadata | undefined {
  if (metadata?.apiName === undefined) {
    return metadata;
  }

  const { apiName: _apiName, ...rest } = metadata;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function enforceRequiredMetadata(
  metadata: ResolvedMetadata | undefined,
  declarationKind: "type" | "field" | "method",
  logicalName: string,
  options: ResolveDeclarationMetadataOptions
): void {
  const declarationPolicy = getDeclarationMetadataPolicy(
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    normalizeMetadataPolicy(options.metadata),
    declarationKind
  );

  if (metadata?.apiName === undefined && declarationPolicy.apiName.mode === "require-explicit") {
    throw new Error(
      `Metadata policy requires explicit apiName for ${declarationKind} "${logicalName}" on the tsdoc surface.`
    );
  }
  if (
    metadata?.displayName === undefined &&
    declarationPolicy.displayName.mode === "require-explicit"
  ) {
    throw new Error(
      `Metadata policy requires explicit displayName for ${declarationKind} "${logicalName}" on the tsdoc surface.`
    );
  }
  if (
    metadata?.apiNamePlural === undefined &&
    declarationPolicy.apiName.pluralization.mode === "require-explicit"
  ) {
    throw new Error(
      `Metadata policy requires explicit apiNamePlural for ${declarationKind} "${logicalName}" on the tsdoc surface.`
    );
  }
  if (
    metadata?.displayNamePlural === undefined &&
    declarationPolicy.displayName.pluralization.mode === "require-explicit"
  ) {
    throw new Error(
      `Metadata policy requires explicit displayNamePlural for ${declarationKind} "${logicalName}" on the tsdoc surface.`
    );
  }
}

function describeRootType(
  rootType: TypeNode,
  typeRegistry: Readonly<Record<string, TypeDefinition>>,
  fallbackName: string
): RootTypeDescriptor {
  if (rootType.kind !== "reference") {
    return {
      name: fallbackName,
      type: rootType,
    };
  }

  const definition = typeRegistry[rootType.name];
  if (definition === undefined) {
    return {
      name: rootType.name,
      type: rootType,
    };
  }

  return {
    name: definition.name,
    ...(definition.metadata !== undefined && { metadata: definition.metadata }),
    ...(definition.annotations !== undefined &&
      definition.annotations.length > 0 && { annotations: definition.annotations }),
    type: definition.type,
  };
}

function toStandaloneJsonSchema(
  root: RootTypeDescriptor,
  typeRegistry: Record<string, TypeDefinition>,
  options: StaticSchemaGenerationOptions | undefined
): JsonSchema2020 {
  const syntheticFieldMetadata = omitApiName(root.metadata);
  const syntheticField: FieldNode = {
    kind: "field",
    name: "__result",
    ...(syntheticFieldMetadata !== undefined && { metadata: syntheticFieldMetadata }),
    type: root.type,
    required: true,
    constraints: [],
    annotations: [...(root.annotations ?? [])],
    provenance: {
      surface: "tsdoc",
      file: "",
      line: 1,
      column: 0,
    },
  };

  const ir = resolveFormIRMetadata(
    {
      kind: "form-ir",
      name: root.name,
      irVersion: IR_VERSION,
      elements: [syntheticField],
      ...(root.metadata !== undefined && { metadata: root.metadata }),
      ...(root.annotations !== undefined &&
        root.annotations.length > 0 && { rootAnnotations: root.annotations }),
      typeRegistry,
      provenance: syntheticField.provenance,
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
      policy: normalizeMetadataPolicy(options?.metadata),
      surface: "tsdoc",
      rootLogicalName: root.name,
    }
  );

  const schema = generateJsonSchemaFromIR(ir, {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    extensionRegistry: options?.extensionRegistry,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    enumSerialization: options?.enumSerialization,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    vendorPrefix: options?.vendorPrefix,
  });

  const result = schema.properties?.["__result"];
  if (result === undefined) {
    throw new Error("FormSpec failed to extract the standalone schema root from the synthetic IR.");
  }

  if (schema.$defs === undefined || Object.keys(schema.$defs).length === 0) {
    return {
      ...(schema.$schema !== undefined && { $schema: schema.$schema }),
      ...result,
    };
  }

  return {
    ...(schema.$schema !== undefined && { $schema: schema.$schema }),
    ...result,
    $defs: schema.$defs,
  };
}

function generateSchemasFromAnalysis(
  analysis: IRClassAnalysis,
  filePath: string,
  options: StaticSchemaGenerationOptions | undefined
): DiscoveredTypeSchemas {
  return toDiscoveredTypeSchemas(
    generateClassSchemas(
      analysis,
      { file: filePath },
      {
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
        extensionRegistry: options?.extensionRegistry,
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
        enumSerialization: options?.enumSerialization,
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
        metadata: options?.metadata,
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
        vendorPrefix: options?.vendorPrefix,
      }
    ),
    analysis.metadata
  );
}

function generateSchemasFromResolvedType(
  options: GenerateSchemasFromTypeOptions,
  skipNamedDeclaration = false,
  rootOverride?: RootTypeOverride
): DiscoveredTypeSchemas {
  const namedDeclaration =
    skipNamedDeclaration || hasConcreteTypeArguments(options.type, options.context.checker)
      ? undefined
      : getNamedTypeDeclaration(options.type);
  if (namedDeclaration !== undefined) {
    return generateSchemasFromDeclaration({
      ...options,
      declaration: namedDeclaration,
    });
  }

  const filePath =
    options.sourceNode?.getSourceFile().fileName ?? options.context.sourceFile.fileName;
  const typeRegistry: Record<string, TypeDefinition> = {};
  const diagnostics: ConstraintSemanticDiagnostic[] = [];
  const rootType = resolveTypeNode(
    options.type,
    options.context.checker,
    filePath,
    typeRegistry,
    new Set<ts.Type>(),
    options.sourceNode,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    createAnalyzerMetadataPolicy(options.metadata, options.discriminator),
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    options.extensionRegistry,
    diagnostics
  );

  if (diagnostics.length > 0) {
    const diagnosticDetails = diagnostics
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
      .join("; ");
    throw new Error(
      `FormSpec validation failed while generating discovered type schemas. ${diagnosticDetails}`
    );
  }

  const describedRoot = describeRootType(
    rootType,
    typeRegistry,
    options.name ?? getFallbackName(options.sourceNode)
  );
  const mergedMetadata = mergeResolvedMetadata(describedRoot.metadata, rootOverride?.metadata);
  const root: RootTypeDescriptor = {
    ...describedRoot,
    ...(rootOverride?.name !== undefined && { name: rootOverride.name }),
    ...(mergedMetadata !== undefined && { metadata: mergedMetadata }),
    ...(rootOverride?.annotations !== undefined && { annotations: rootOverride.annotations }),
  };

  if (root.type.kind === "object") {
    return generateSchemasFromAnalysis(
      createObjectRootAnalysis(
        options.name ?? root.name,
        root.type.properties,
        typeRegistry,
        root.metadata,
        root.annotations
      ),
      filePath,
      options
    );
  }

  return {
    jsonSchema: toStandaloneJsonSchema(root, typeRegistry, options),
    uiSchema: null,
    ...(root.metadata !== undefined && { resolvedMetadata: root.metadata }),
  };
}

/**
 * Generates schemas from a resolved declaration using the supported public
 * static-build workflow.
 *
 * Named declarations reuse the same analyzer semantics as FormSpec's existing
 * top-level generation APIs. Non-object type aliases fall back to the generic
 * resolved-type entry point.
 *
 * @public
 */
export function generateSchemasFromDeclaration(
  options: GenerateSchemasFromDeclarationOptions
): DiscoveredTypeSchemas {
  const filePath = options.declaration.getSourceFile().fileName;

  if (ts.isClassDeclaration(options.declaration)) {
    return generateSchemasFromAnalysis(
      analyzeClassToIR(
        options.declaration,
        options.context.checker,
        filePath,
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
        options.extensionRegistry,
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
        options.metadata,
        options.discriminator
      ),
      filePath,
      options
    );
  }

  if (ts.isInterfaceDeclaration(options.declaration)) {
    return generateSchemasFromAnalysis(
      analyzeInterfaceToIR(
        options.declaration,
        options.context.checker,
        filePath,
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
        options.extensionRegistry,
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
        options.metadata,
        options.discriminator
      ),
      filePath,
      options
    );
  }

  if (ts.isTypeAliasDeclaration(options.declaration)) {
    const analyzedAlias = analyzeTypeAliasToIR(
      options.declaration,
      options.context.checker,
      filePath,
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
      options.extensionRegistry,
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
      options.metadata,
      options.discriminator
    );
    if (analyzedAlias.ok) {
      return generateSchemasFromAnalysis(analyzedAlias.analysis, filePath, options);
    }
    const aliasRootInfo = analyzeDeclarationRootInfo(
      options.declaration,
      options.context.checker,
      filePath,
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
      options.extensionRegistry,
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
      options.metadata
    );
    if (aliasRootInfo.diagnostics.length > 0) {
      const diagnosticDetails = aliasRootInfo.diagnostics
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
        .join("; ");
      throw new Error(
        `FormSpec validation failed while generating discovered type schemas. ${diagnosticDetails}`
      );
    }

    return generateSchemasFromResolvedType(
      {
        ...options,
        type: options.context.checker.getTypeAtLocation(options.declaration),
        sourceNode: options.declaration,
        name: options.declaration.name.text,
      },
      true,
      {
        name: options.declaration.name.text,
        ...(aliasRootInfo.metadata !== undefined && { metadata: aliasRootInfo.metadata }),
        ...(aliasRootInfo.annotations.length > 0 && { annotations: aliasRootInfo.annotations }),
      }
    );
  }

  const _exhaustive: never = options.declaration;
  return _exhaustive;
}

/**
 * Generates schemas from a resolved TypeScript type.
 *
 * This is the advanced public entry point for build tooling that already uses
 * the TypeScript compiler API to discover types before handing them to
 * FormSpec.
 *
 * @public
 */
export function generateSchemasFromType(
  options: GenerateSchemasFromTypeOptions
): DiscoveredTypeSchemas {
  return generateSchemasFromResolvedType(options);
}

/**
 * Generates schemas for a method or function parameter type.
 *
 * @public
 */
export function generateSchemasFromParameter(
  options: GenerateSchemasFromParameterOptions
): DiscoveredTypeSchemas {
  return generateSchemasFromResolvedType({
    ...options,
    type: options.context.checker.getTypeAtLocation(options.parameter),
    sourceNode: options.parameter,
    name: getFallbackName(options.parameter, "Parameter"),
  });
}

/**
 * Generates schemas for a method or function return type.
 *
 * Awaited `Promise<T>`-style return types are unwrapped before generation.
 *
 * @public
 */
export function generateSchemasFromReturnType(
  options: GenerateSchemasFromReturnTypeOptions
): DiscoveredTypeSchemas {
  const signature = options.context.checker.getSignatureFromDeclaration(options.declaration);
  const returnType =
    signature !== undefined
      ? options.context.checker.getReturnTypeOfSignature(signature)
      : options.context.checker.getTypeAtLocation(options.declaration);
  const type = unwrapPromiseType(options.context.checker, returnType);
  const sourceNode =
    type !== returnType
      ? (unwrapPromiseTypeNode(options.declaration.type) ??
        options.declaration.type ??
        options.declaration)
      : (options.declaration.type ?? options.declaration);

  const fallbackName =
    options.declaration.name !== undefined && ts.isIdentifier(options.declaration.name)
      ? `${options.declaration.name.text}ReturnType`
      : "ReturnType";

  return generateSchemasFromResolvedType({
    ...options,
    type,
    sourceNode,
    name: fallbackName,
  });
}

/**
 * Resolves metadata from a declaration using FormSpec's configured metadata
 * policy for the matching declaration kind.
 *
 * @public
 */
export function resolveDeclarationMetadata(
  options: ResolveDeclarationMetadataOptions
): ResolvedMetadata | undefined {
  const analysis = analyzeMetadataForNodeWithChecker({
    checker: options.context.checker,
    node: options.declaration,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    metadata: options.metadata,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    extensions: options.extensionRegistry?.extensions,
    buildContext: options.context,
  });
  if (analysis === null) {
    return undefined;
  }

  const metadata = analysis.resolvedMetadata;

  enforceRequiredMetadata(metadata, analysis.declarationKind, analysis.logicalName, options);
  return metadata;
}

function unwrapPromiseType(checker: ts.TypeChecker, type: ts.Type): ts.Type {
  if (!("getAwaitedType" in checker) || typeof checker.getAwaitedType !== "function") {
    return type;
  }

  return checker.getAwaitedType(type) ?? type;
}

function unwrapPromiseTypeNode(typeNode: ts.TypeNode | undefined): ts.TypeNode | undefined {
  if (typeNode === undefined) {
    return undefined;
  }

  if (ts.isParenthesizedTypeNode(typeNode)) {
    const unwrapped = unwrapPromiseTypeNode(typeNode.type);
    return unwrapped ?? typeNode;
  }

  return isPromiseTypeReferenceNode(typeNode) ? typeNode.typeArguments[0] : typeNode;
}

function isPromiseTypeReferenceNode(
  typeNode: ts.TypeNode
): typeNode is ts.TypeReferenceNode & { typeArguments: [ts.TypeNode, ...ts.TypeNode[]] } {
  return (
    ts.isTypeReferenceNode(typeNode) &&
    ts.isIdentifier(typeNode.typeName) &&
    typeNode.typeName.text === "Promise" &&
    typeNode.typeArguments !== undefined &&
    typeNode.typeArguments.length > 0
  );
}
