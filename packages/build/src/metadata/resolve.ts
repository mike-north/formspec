import type {
  EnumTypeNode,
  FieldNode,
  FormIR,
  FormIRElement,
  MetadataAuthoringSurface,
  ObjectProperty,
  ResolvedMetadata,
  ResolvedScalarMetadata,
  TypeDefinition,
  TypeNode,
} from "@formspec/core/internals";
import type {
  EnumMemberResolutionContext,
  MetadataResolutionContext,
  NormalizedDeclarationMetadataPolicy,
  NormalizedMetadataPolicy,
} from "./policy.js";

interface ExplicitMetadataInput {
  readonly apiName?: string;
  readonly displayName?: string;
  readonly apiNamePlural?: string;
  readonly displayNamePlural?: string;
}

interface ResolveFormIRMetadataOptions {
  readonly policy: NormalizedMetadataPolicy;
  readonly surface: MetadataAuthoringSurface;
  readonly buildContext?: unknown;
  readonly rootLogicalName?: string;
  readonly resolveRootTypeMetadata?: boolean;
}

function toExplicitScalar(value: string | undefined): ResolvedScalarMetadata | undefined {
  return value !== undefined && value.trim() !== "" ? { value, source: "explicit" } : undefined;
}

function toExplicitResolvedMetadata(
  explicit: ExplicitMetadataInput | undefined
): ResolvedMetadata | undefined {
  if (explicit === undefined) {
    return undefined;
  }

  const apiName = toExplicitScalar(explicit.apiName);
  const displayName = toExplicitScalar(explicit.displayName);
  const apiNamePlural = toExplicitScalar(explicit.apiNamePlural);
  const displayNamePlural = toExplicitScalar(explicit.displayNamePlural);
  const metadata: ResolvedMetadata = {
    ...(apiName !== undefined && { apiName }),
    ...(displayName !== undefined && { displayName }),
    ...(apiNamePlural !== undefined && { apiNamePlural }),
    ...(displayNamePlural !== undefined && { displayNamePlural }),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function resolveScalar(
  current: ResolvedScalarMetadata | undefined,
  policy: NormalizedDeclarationMetadataPolicy["apiName"],
  context: MetadataResolutionContext,
  metadataLabel: "apiName" | "displayName"
): ResolvedScalarMetadata | undefined {
  if (current !== undefined) {
    return current;
  }

  if (policy.mode === "require-explicit") {
    throw new Error(
      `Metadata policy requires explicit ${metadataLabel} for ${context.declarationKind} "${context.logicalName}" on the ${context.surface} surface.`
    );
  }

  if (policy.mode !== "infer-if-missing") {
    return undefined;
  }

  const inferredValue = policy.infer(context);
  return inferredValue.trim() !== "" ? { value: inferredValue, source: "inferred" } : undefined;
}

function resolvePlural(
  current: ResolvedScalarMetadata | undefined,
  singular: ResolvedScalarMetadata | undefined,
  policy: NormalizedDeclarationMetadataPolicy["apiName"]["pluralization"],
  context: MetadataResolutionContext,
  metadataLabel: "apiNamePlural" | "displayNamePlural"
): ResolvedScalarMetadata | undefined {
  if (current !== undefined) {
    return current;
  }

  if (policy.mode === "require-explicit") {
    throw new Error(
      `Metadata policy requires explicit ${metadataLabel} for ${context.declarationKind} "${context.logicalName}" on the ${context.surface} surface.`
    );
  }

  if (singular === undefined || policy.mode !== "infer-if-missing") {
    return undefined;
  }

  const pluralValue = policy.inflect({ ...context, singular: singular.value });
  return pluralValue.trim() !== "" ? { value: pluralValue, source: "inferred" } : undefined;
}

function resolveResolvedMetadata(
  current: ResolvedMetadata | undefined,
  policy: NormalizedDeclarationMetadataPolicy,
  context: MetadataResolutionContext
): ResolvedMetadata | undefined {
  const apiName = resolveScalar(current?.apiName, policy.apiName, context, "apiName");
  const displayName = resolveScalar(
    current?.displayName,
    policy.displayName,
    context,
    "displayName"
  );
  const apiNamePlural = resolvePlural(
    current?.apiNamePlural,
    apiName,
    policy.apiName.pluralization,
    context,
    "apiNamePlural"
  );
  const displayNamePlural = resolvePlural(
    current?.displayNamePlural,
    displayName,
    policy.displayName.pluralization,
    context,
    "displayNamePlural"
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

function pickResolvedMetadataValue(
  baseValue: ResolvedScalarMetadata | undefined,
  overlayValue: ResolvedScalarMetadata | undefined
): ResolvedScalarMetadata | undefined {
  if (overlayValue?.source === "explicit") {
    return overlayValue;
  }
  if (baseValue?.source === "explicit") {
    return baseValue;
  }
  return baseValue ?? overlayValue;
}

function resolveEnumMemberDisplayName(
  current: string | undefined,
  policy: NormalizedMetadataPolicy["enumMember"]["displayName"],
  context: EnumMemberResolutionContext
): string | undefined {
  if (current !== undefined) {
    return current;
  }

  if (policy.mode === "require-explicit") {
    throw new Error(
      `Metadata policy requires explicit displayName for enum member "${context.logicalName}" on the ${context.surface} surface.`
    );
  }

  if (policy.mode !== "infer-if-missing") {
    return undefined;
  }

  const inferredValue = policy.infer(context).trim();
  return inferredValue !== "" ? inferredValue : undefined;
}

function resolveEnumTypeMetadata(
  type: EnumTypeNode,
  options: ResolveFormIRMetadataOptions
): EnumTypeNode {
  const members = type.members.map((member) => {
    const displayName = resolveEnumMemberDisplayName(
      member.displayName,
      options.policy.enumMember.displayName,
      {
        surface: options.surface,
        logicalName: String(member.value),
        memberValue: member.value,
        ...(options.buildContext !== undefined && { buildContext: options.buildContext }),
      }
    );

    if (displayName === member.displayName) {
      return member;
    }

    return displayName === undefined
      ? { value: member.value }
      : { value: member.value, displayName };
  });

  return members.some((member, index) => member !== type.members[index])
    ? { ...type, members }
    : type;
}

function resolveTypeNodeMetadata(type: TypeNode, options: ResolveFormIRMetadataOptions): TypeNode {
  switch (type.kind) {
    case "array":
      return {
        ...type,
        items: resolveTypeNodeMetadata(type.items, options),
      };

    case "object":
      return {
        ...type,
        properties: type.properties.map((property) =>
          resolveObjectPropertyMetadata(property, options)
        ),
      };

    case "record":
      return {
        ...type,
        valueType: resolveTypeNodeMetadata(type.valueType, options),
      };

    case "union":
      return {
        ...type,
        members: type.members.map((member) => resolveTypeNodeMetadata(member, options)),
      };

    case "enum":
      return resolveEnumTypeMetadata(type, options);

    case "reference":
    case "primitive":
    case "dynamic":
    case "custom":
      return type;

    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function resolveObjectPropertyMetadata(
  property: ObjectProperty,
  options: ResolveFormIRMetadataOptions
): ObjectProperty {
  const metadata = resolveResolvedMetadata(property.metadata, options.policy.field, {
    surface: options.surface,
    declarationKind: "field",
    logicalName: property.name,
    ...(options.buildContext !== undefined && { buildContext: options.buildContext }),
  });
  return {
    ...property,
    ...(metadata !== undefined && { metadata }),
    type: resolveTypeNodeMetadata(property.type, options),
  };
}

function resolveFieldMetadataNode(
  field: FieldNode,
  options: ResolveFormIRMetadataOptions
): FieldNode {
  const metadata = resolveResolvedMetadata(field.metadata, options.policy.field, {
    surface: options.surface,
    declarationKind: "field",
    logicalName: field.name,
    ...(options.buildContext !== undefined && { buildContext: options.buildContext }),
  });
  return {
    ...field,
    ...(metadata !== undefined && { metadata }),
    type: resolveTypeNodeMetadata(field.type, options),
  };
}

function resolveFormElementMetadata(
  element: FormIRElement,
  options: ResolveFormIRMetadataOptions
): FormIRElement {
  switch (element.kind) {
    case "field":
      return resolveFieldMetadataNode(element, options);

    case "group":
      return {
        ...element,
        elements: element.elements.map((child) => resolveFormElementMetadata(child, options)),
      };

    case "conditional":
      return {
        ...element,
        elements: element.elements.map((child) => resolveFormElementMetadata(child, options)),
      };

    default: {
      const _exhaustive: never = element;
      return _exhaustive;
    }
  }
}

function resolveTypeDefinitionMetadata(
  typeDefinition: TypeDefinition,
  options: ResolveFormIRMetadataOptions
): TypeDefinition {
  const metadata = resolveResolvedMetadata(typeDefinition.metadata, options.policy.type, {
    surface: options.surface,
    declarationKind: "type",
    logicalName: typeDefinition.name,
    ...(options.buildContext !== undefined && { buildContext: options.buildContext }),
  });
  return {
    ...typeDefinition,
    ...(metadata !== undefined && { metadata }),
    type: resolveTypeNodeMetadata(typeDefinition.type, options),
  };
}

export function resolveMetadata(
  explicit: ExplicitMetadataInput | undefined,
  policy: NormalizedDeclarationMetadataPolicy,
  context: MetadataResolutionContext
): ResolvedMetadata | undefined {
  return resolveResolvedMetadata(toExplicitResolvedMetadata(explicit), policy, context);
}

export function mergeResolvedMetadata(
  baseMetadata: ResolvedMetadata | undefined,
  overlayMetadata: ResolvedMetadata | undefined
): ResolvedMetadata | undefined {
  const apiName = pickResolvedMetadataValue(baseMetadata?.apiName, overlayMetadata?.apiName);
  const displayName = pickResolvedMetadataValue(
    baseMetadata?.displayName,
    overlayMetadata?.displayName
  );
  const apiNamePlural = pickResolvedMetadataValue(
    baseMetadata?.apiNamePlural,
    overlayMetadata?.apiNamePlural
  );
  const displayNamePlural = pickResolvedMetadataValue(
    baseMetadata?.displayNamePlural,
    overlayMetadata?.displayNamePlural
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

export function getSerializedName(
  logicalName: string,
  metadata: ResolvedMetadata | undefined
): string {
  return metadata?.apiName?.value ?? logicalName;
}

export function getDisplayName(metadata: ResolvedMetadata | undefined): string | undefined {
  return metadata?.displayName?.value;
}

export function resolveFormIRMetadata(ir: FormIR, options: ResolveFormIRMetadataOptions): FormIR {
  const metadata =
    options.resolveRootTypeMetadata === false
      ? ir.metadata
      : resolveResolvedMetadata(ir.metadata, options.policy.type, {
          surface: options.surface,
          declarationKind: "type",
          logicalName: options.rootLogicalName ?? ir.name ?? "FormSpec",
          ...(options.buildContext !== undefined && { buildContext: options.buildContext }),
        });

  return {
    ...ir,
    ...(metadata !== undefined && { metadata }),
    elements: ir.elements.map((element) => resolveFormElementMetadata(element, options)),
    typeRegistry: Object.fromEntries(
      Object.entries(ir.typeRegistry).map(([name, definition]) => [
        name,
        resolveTypeDefinitionMetadata(definition, options),
      ])
    ),
  };
}
