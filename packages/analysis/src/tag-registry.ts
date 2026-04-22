import {
  BUILTIN_CONSTRAINT_DEFINITIONS,
  normalizeConstraintTagName,
  type BuiltinConstraintName,
  type MetadataDeclarationKind,
  type MetadataSlotRegistration,
} from "@formspec/core/internals";

export type FormSpecValueKind =
  | "number"
  | "integer"
  | "signedInteger"
  | "string"
  | "json"
  | "boolean"
  | "condition";

/**
 * Target syntaxes that a FormSpec tag can accept.
 *
 * @public
 */
export type FormSpecTargetKind = "none" | "path" | "member" | "variant";
export type FormSpecTagCategory = "constraint" | "annotation" | "structure" | "ecosystem";

/**
 * Declaration contexts where a FormSpec tag may appear.
 *
 * @public
 */
export type FormSpecPlacement =
  | "class"
  | "class-field"
  | "class-method"
  | "interface"
  | "interface-field"
  | "type-alias"
  | "type-alias-field"
  | "variable"
  | "function"
  | "function-parameter"
  | "method-parameter";

export type SemanticCapability =
  | "numeric-comparable"
  | "string-like"
  | "array-like"
  | "enum-member-addressable"
  | "json-like"
  | "condition-like"
  | "object-like";

export interface TagSignatureParameter {
  readonly kind: "value" | "target-path" | "target-member" | "target-variant";
  readonly label: string;
  readonly optional?: boolean;
  readonly capability?: SemanticCapability;
  readonly valueKind?: FormSpecValueKind;
}

export interface TagSignature {
  readonly label: string;
  readonly placements: readonly FormSpecPlacement[];
  readonly parameters: readonly TagSignatureParameter[];
}

export interface TagDefinition {
  readonly canonicalName: string;
  readonly valueKind: FormSpecValueKind | null;
  readonly requiresArgument: boolean;
  readonly supportedTargets: readonly FormSpecTargetKind[];
  readonly allowDuplicates: boolean;
  readonly category: FormSpecTagCategory;
  readonly placements: readonly FormSpecPlacement[];
  /**
   * The semantic capabilities required of the field type for this tag to be
   * applicable. At most one capability may be declared per tag.
   *
   * The "at most one" invariant is structural: all `capabilitiesForValueKind`
   * return paths yield 0 or 1 elements, and no tag definition supplies 2+
   * capabilities. The tuple type enforces this at the type level so future
   * additions that accidentally provide two capabilities produce a type error.
   */
  readonly capabilities: readonly [SemanticCapability] | readonly [];
  readonly completionDetail: string;
  readonly hoverSummary: string;
  readonly hoverMarkdown: string;
  readonly signatures: readonly TagSignature[];
}

export type FormSpecTagDefinition = TagDefinition;
export type FormSpecTagOverload = TagSignature;
export type FormSpecTagParameter = TagSignatureParameter;

export interface ExtensionConstraintTagSource {
  readonly tagName: string;
}

/**
 * Synthetic type declaration info for extension-registered custom types.
 * Used to emit type aliases in the synthetic program so declarations
 * referencing these types can be included in supportingDeclarations.
 */
export interface ExtensionCustomTypeSource {
  /** TypeScript surface names that resolve to this type (e.g., ['Decimal']) */
  readonly tsTypeNames: readonly string[];
}

export interface ExtensionTagSource {
  readonly extensionId: string;
  readonly constraintTags?: readonly ExtensionConstraintTagSource[];
  readonly metadataSlots?: readonly MetadataSlotRegistration[];
  /** Custom types registered by this extension */
  readonly customTypes?: readonly ExtensionCustomTypeSource[];
}

export const FORM_SPEC_PLACEMENTS = [
  "class",
  "class-field",
  "class-method",
  "interface",
  "interface-field",
  "type-alias",
  "type-alias-field",
  "variable",
  "function",
  "function-parameter",
  "method-parameter",
] as const satisfies readonly FormSpecPlacement[];

export const FORM_SPEC_TARGET_KINDS = [
  "none",
  "path",
  "member",
  "variant",
] as const satisfies readonly FormSpecTargetKind[];

const FIELD_PLACEMENTS = [
  "class-field",
  "interface-field",
  "type-alias-field",
  "variable",
  "function-parameter",
  "method-parameter",
] as const satisfies readonly FormSpecPlacement[];

const TYPE_PLACEMENTS = [
  "class",
  "interface",
  "type-alias",
] as const satisfies readonly FormSpecPlacement[];

const DECLARATION_PLACEMENTS = [
  "class-method",
  "function",
] as const satisfies readonly FormSpecPlacement[];

const ALL_PLACEMENTS = [
  ...TYPE_PLACEMENTS,
  ...FIELD_PLACEMENTS,
  ...DECLARATION_PLACEMENTS,
] as const satisfies readonly FormSpecPlacement[];

const INTEGER_VALUE_TAGS = new Set(["minLength", "maxLength", "minItems", "maxItems"]);
const SIGNED_INTEGER_VALUE_TAGS = new Set(["order"]);
const JSON_VALUE_TAGS = new Set(["const", "enumOptions"]);
const BOOLEAN_VALUE_TAGS = new Set(["uniqueItems"]);
const STRING_VALUE_TAGS = new Set([
  "pattern",
  "displayName",
  "description",
  "format",
  "placeholder",
  "group",
  "example",
  "remarks",
  "see",
  "apiName",
]);
const CONDITION_VALUE_TAGS = new Set(["showWhen", "hideWhen", "enableWhen", "disableWhen"]);

const CONSTRAINT_COMPLETION_DETAIL: Record<string, string> = {
  minimum: "Minimum numeric value (inclusive). Example: `@minimum 0`",
  maximum: "Maximum numeric value (inclusive). Example: `@maximum 100`",
  exclusiveMinimum: "Minimum numeric value (exclusive). Example: `@exclusiveMinimum 0`",
  exclusiveMaximum: "Maximum numeric value (exclusive). Example: `@exclusiveMaximum 100`",
  multipleOf: "Value must be a multiple of this number. Example: `@multipleOf 0.01`",
  minLength: "Minimum string length. Example: `@minLength 1`",
  maxLength: "Maximum string length. Example: `@maxLength 255`",
  minItems: "Minimum number of array items. Example: `@minItems 1`",
  maxItems: "Maximum number of array items. Example: `@maxItems 10`",
  uniqueItems: "Require all array items to be distinct. Example: `@uniqueItems`",
  pattern: "Regular expression pattern for string validation. Example: `@pattern ^[a-z]+$`",
  enumOptions: 'Inline JSON array of allowed enum values. Example: `@enumOptions ["a","b","c"]`',
  const: 'Require a constant JSON value. Example: `@const "USD"`',
};

const CONSTRAINT_HOVER_DOCS: Record<string, string> = {
  minimum: [
    "**@minimum** `<number>`",
    "",
    "Sets an inclusive lower bound on a numeric field.",
    "",
    "Maps to `minimum` in JSON Schema.",
    "",
    "**Signature:** `@minimum [:path] <number>`",
  ].join("\n"),
  maximum: [
    "**@maximum** `<number>`",
    "",
    "Sets an inclusive upper bound on a numeric field.",
    "",
    "Maps to `maximum` in JSON Schema.",
    "",
    "**Signature:** `@maximum [:path] <number>`",
  ].join("\n"),
  exclusiveMinimum: [
    "**@exclusiveMinimum** `<number>`",
    "",
    "Sets an exclusive lower bound on a numeric field.",
    "",
    "Maps to `exclusiveMinimum` in JSON Schema.",
    "",
    "**Signature:** `@exclusiveMinimum [:path] <number>`",
  ].join("\n"),
  exclusiveMaximum: [
    "**@exclusiveMaximum** `<number>`",
    "",
    "Sets an exclusive upper bound on a numeric field.",
    "",
    "Maps to `exclusiveMaximum` in JSON Schema.",
    "",
    "**Signature:** `@exclusiveMaximum [:path] <number>`",
  ].join("\n"),
  multipleOf: [
    "**@multipleOf** `<number>`",
    "",
    "Requires the numeric value to be a multiple of the given number.",
    "",
    "Maps to `multipleOf` in JSON Schema.",
    "",
    "**Signature:** `@multipleOf [:path] <number>`",
  ].join("\n"),
  minLength: [
    "**@minLength** `<integer>`",
    "",
    "Sets a minimum character length on a string field.",
    "",
    "Maps to `minLength` in JSON Schema.",
    "",
    "**Signature:** `@minLength [:path] <integer>`",
  ].join("\n"),
  maxLength: [
    "**@maxLength** `<integer>`",
    "",
    "Sets a maximum character length on a string field.",
    "",
    "Maps to `maxLength` in JSON Schema.",
    "",
    "**Signature:** `@maxLength [:path] <integer>`",
  ].join("\n"),
  minItems: [
    "**@minItems** `<integer>`",
    "",
    "Sets a minimum number of items in an array field.",
    "",
    "Maps to `minItems` in JSON Schema.",
    "",
    "**Signature:** `@minItems [:path] <integer>`",
  ].join("\n"),
  maxItems: [
    "**@maxItems** `<integer>`",
    "",
    "Sets a maximum number of items in an array field.",
    "",
    "Maps to `maxItems` in JSON Schema.",
    "",
    "**Signature:** `@maxItems [:path] <integer>`",
  ].join("\n"),
  uniqueItems: [
    "**@uniqueItems**",
    "",
    "Requires all items in an array field to be distinct.",
    "",
    "Maps to `uniqueItems` in JSON Schema.",
    "",
    "**Signature:** `@uniqueItems [:path]`",
  ].join("\n"),
  pattern: [
    "**@pattern** `<regex>`",
    "",
    "Sets a regular expression pattern that a string field must match.",
    "",
    "Maps to `pattern` in JSON Schema.",
    "",
    "**Signature:** `@pattern [:path] <regex>`",
  ].join("\n"),
  enumOptions: [
    "**@enumOptions** `<json-array>`",
    "",
    "Specifies the allowed values for an enum field as an inline JSON array.",
    "",
    "Maps to `enum` in JSON Schema.",
    "",
    "**Signature:** `@enumOptions <json-array>`",
  ].join("\n"),
  const: [
    "**@const** `<json-literal>`",
    "",
    "Requires the field value to equal a single constant JSON value.",
    "",
    "Maps to `const` in JSON Schema.",
    "",
    "**Signature:** `@const [:path] <json-literal>`",
  ].join("\n"),
};

const CONSTRAINT_HOVER_SUMMARIES: Record<BuiltinConstraintName, string> = {
  minimum: "Sets an inclusive lower bound on a numeric field.",
  maximum: "Sets an inclusive upper bound on a numeric field.",
  exclusiveMinimum: "Sets an exclusive lower bound on a numeric field.",
  exclusiveMaximum: "Sets an exclusive upper bound on a numeric field.",
  multipleOf: "Requires the numeric value to be a multiple of the given number.",
  minLength: "Sets a minimum character length on a string field.",
  maxLength: "Sets a maximum character length on a string field.",
  minItems: "Sets a minimum number of items in an array field.",
  maxItems: "Sets a maximum number of items in an array field.",
  uniqueItems: "Requires all items in an array field to be distinct.",
  pattern: "Sets a regular expression pattern that a string field must match.",
  enumOptions: "Specifies the allowed values for an enum field as an inline JSON array.",
  const: "Requires the field value to equal a single constant JSON value.",
};

type SupportedSignatureTarget = Exclude<FormSpecTargetKind, "none">;

interface ExtraTagSpec {
  readonly requiresArgument: boolean;
  readonly supportedTargets: readonly FormSpecTargetKind[];
  readonly allowDuplicates: boolean;
  readonly category: FormSpecTagCategory;
  readonly placements: readonly FormSpecPlacement[];
  readonly completionDetail: string;
  readonly hoverSummary: string;
  readonly valueKind?: FormSpecValueKind | null;
  readonly valueLabel?: string;
  readonly targetPlacements?: Partial<
    Record<SupportedSignatureTarget, readonly FormSpecPlacement[]>
  >;
}

function inferValueKind(name: string): FormSpecValueKind | null {
  if (INTEGER_VALUE_TAGS.has(name)) return "integer";
  if (SIGNED_INTEGER_VALUE_TAGS.has(name)) return "signedInteger";
  if (JSON_VALUE_TAGS.has(name)) return "json";
  if (BOOLEAN_VALUE_TAGS.has(name)) return "boolean";
  if (STRING_VALUE_TAGS.has(name)) return "string";
  if (CONDITION_VALUE_TAGS.has(name)) return "condition";
  return null;
}

function getBuiltinValueKind(name: BuiltinConstraintName): FormSpecValueKind {
  return inferValueKind(name) ?? "number";
}

function getBuiltinConstraintCapability(name: BuiltinConstraintName): SemanticCapability {
  switch (name) {
    case "minimum":
    case "maximum":
    case "exclusiveMinimum":
    case "exclusiveMaximum":
    case "multipleOf":
      return "numeric-comparable";
    case "minLength":
    case "maxLength":
    case "pattern":
      return "string-like";
    case "minItems":
    case "maxItems":
    case "uniqueItems":
      return "array-like";
    case "enumOptions":
      return "enum-member-addressable";
    case "const":
      return "json-like";
    default: {
      const exhaustive: never = name;
      return exhaustive;
    }
  }
}

function capabilitiesForValueKind(
  valueKind: FormSpecValueKind | null
): readonly [SemanticCapability] | readonly [] {
  switch (valueKind) {
    case "number":
    case "integer":
    case "signedInteger":
      return ["numeric-comparable"] as const;
    case "string":
      return ["string-like"] as const;
    case "json":
      return ["json-like"] as const;
    case "condition":
      return ["condition-like"] as const;
    case "boolean":
    case null:
      return [] as const;
    default: {
      const exhaustive: never = valueKind;
      return exhaustive;
    }
  }
}

function valueLabelForKind(valueKind: FormSpecValueKind | null, fallback = "<value>"): string {
  switch (valueKind) {
    case "number":
      return "<number>";
    case "integer":
    case "signedInteger":
      return "<integer>";
    case "string":
      return "<text>";
    case "json":
      return "<json>";
    case "condition":
      return "<condition>";
    case "boolean":
    case null:
      return "";
    default: {
      const exhaustive: never = valueKind;
      void exhaustive;
      return fallback;
    }
  }
}

function targetLabelForKind(kind: SupportedSignatureTarget): string {
  switch (kind) {
    case "path":
      return "[:path]";
    case "member":
      return ":member";
    case "variant":
      return ":variant";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function parameterKindForTarget(
  targetKind: SupportedSignatureTarget
): TagSignatureParameter["kind"] {
  switch (targetKind) {
    case "path":
      return "target-path";
    case "member":
      return "target-member";
    case "variant":
      return "target-variant";
    default: {
      const exhaustive: never = targetKind;
      return exhaustive;
    }
  }
}

function createTargetParameter(
  targetKind: SupportedSignatureTarget,
  valueKind: FormSpecValueKind | null,
  pathCapability?: SemanticCapability
): TagSignatureParameter {
  const base: TagSignatureParameter = {
    kind: parameterKindForTarget(targetKind),
    label: targetLabelForKind(targetKind),
    optional: targetKind === "path",
  };

  if (targetKind === "path") {
    const capability = pathCapability ?? capabilitiesForValueKind(valueKind)[0];
    return capability === undefined ? base : { ...base, capability };
  }

  if (targetKind === "member") {
    return { ...base, capability: "enum-member-addressable" };
  }

  return base;
}

function createSignature(
  name: string,
  placements: readonly FormSpecPlacement[],
  targetKind: SupportedSignatureTarget | null,
  valueKind: FormSpecValueKind | null,
  valueLabel: string,
  pathCapability?: SemanticCapability
): TagSignature {
  const parameters: TagSignatureParameter[] = [];

  if (targetKind !== null) {
    parameters.push(createTargetParameter(targetKind, valueKind, pathCapability));
  }
  if (valueLabel !== "") {
    parameters.push(
      valueKind === null
        ? {
            kind: "value",
            label: valueLabel,
          }
        : {
            kind: "value",
            label: valueLabel,
            valueKind,
          }
    );
  }

  const targetLabel = targetKind === null ? "" : ` ${targetLabelForKind(targetKind)}`;
  const valueLabelSuffix = valueLabel === "" ? "" : ` ${valueLabel}`;

  return {
    label: `@${name}${targetLabel}${valueLabelSuffix}`,
    placements,
    parameters,
  };
}

function buildHoverMarkdown(
  name: string,
  hoverSummary: string,
  signatures: readonly TagSignature[],
  valueLabel: string
): string {
  const header = valueLabel === "" ? `**@${name}**` : `**@${name}** \`${valueLabel}\``;
  const signatureLines =
    signatures.length === 1
      ? [`**Signature:** \`${signatures[0]?.label ?? `@${name}`}\``]
      : ["**Signatures:**", ...signatures.map((signature) => `- \`${signature.label}\``)];

  return [header, "", hoverSummary, "", ...signatureLines].join("\n");
}

function makeConstraintSignatures(name: BuiltinConstraintName): readonly TagSignature[] {
  const valueKind = getBuiltinValueKind(name);
  const subjectCapability = getBuiltinConstraintCapability(name);
  const valueLabel =
    name === "pattern"
      ? "<regex>"
      : name === "enumOptions"
        ? "<json-array>"
        : name === "const"
          ? "<json-literal>"
          : valueLabelForKind(valueKind);

  return [
    createSignature(name, FIELD_PLACEMENTS, null, valueKind, valueLabel),
    createSignature(name, FIELD_PLACEMENTS, "path", valueKind, valueLabel, subjectCapability),
  ];
}

const BUILTIN_TAG_DEFINITIONS = Object.fromEntries(
  (Object.keys(BUILTIN_CONSTRAINT_DEFINITIONS) as BuiltinConstraintName[]).map((name) => {
    const valueKind = getBuiltinValueKind(name);
    const subjectCapability = getBuiltinConstraintCapability(name);
    return [
      name,
      {
        canonicalName: name,
        valueKind,
        requiresArgument: valueKind !== "boolean",
        supportedTargets: ["none", "path"] as const,
        allowDuplicates: false,
        category: "constraint" as const,
        placements: FIELD_PLACEMENTS,
        capabilities: [subjectCapability] as const,
        completionDetail: CONSTRAINT_COMPLETION_DETAIL[name] ?? `@${name}`,
        hoverSummary: CONSTRAINT_HOVER_SUMMARIES[name],
        hoverMarkdown: CONSTRAINT_HOVER_DOCS[name] ?? `**@${name}**`,
        signatures: makeConstraintSignatures(name),
      } satisfies TagDefinition,
    ];
  })
) as Record<string, TagDefinition>;

const EXTRA_TAG_SPECS = {
  displayName: {
    requiresArgument: true,
    supportedTargets: ["none", "member", "variant"],
    allowDuplicates: false,
    category: "annotation",
    placements: [...TYPE_PLACEMENTS, ...FIELD_PLACEMENTS],
    completionDetail: "Display label for a type, field, or enum member.",
    hoverSummary: "Provides a user-facing display label.",
    valueLabel: "<label>",
    targetPlacements: {
      member: FIELD_PLACEMENTS,
      variant: TYPE_PLACEMENTS,
    },
  },
  description: {
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: false,
    category: "annotation",
    placements: [...TYPE_PLACEMENTS, ...FIELD_PLACEMENTS],
    completionDetail: "Description text for a type or field.",
    hoverSummary: "Provides descriptive documentation for a type or field.",
  },
  format: {
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: false,
    category: "annotation",
    placements: FIELD_PLACEMENTS,
    completionDetail: "Format hint for a field.",
    hoverSummary: "Provides a format hint for a field.",
    valueLabel: "<format>",
  },
  placeholder: {
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: false,
    category: "annotation",
    placements: FIELD_PLACEMENTS,
    completionDetail: "Placeholder text for a field.",
    hoverSummary: "Provides placeholder text for a field.",
  },
  order: {
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: false,
    category: "annotation",
    placements: FIELD_PLACEMENTS,
    completionDetail: "Field display order hint.",
    hoverSummary: "Provides an integer ordering hint for UI layout.",
  },
  apiName: {
    requiresArgument: true,
    supportedTargets: ["none", "member", "variant"],
    allowDuplicates: false,
    category: "annotation",
    placements: [...TYPE_PLACEMENTS, ...FIELD_PLACEMENTS],
    completionDetail: "API-facing serialized name for a type, field, or variant.",
    hoverSummary: "Overrides the serialized API name used in generated schema output.",
    valueLabel: "<identifier>",
    targetPlacements: {
      member: FIELD_PLACEMENTS,
      variant: TYPE_PLACEMENTS,
    },
  },
  group: {
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: false,
    category: "structure",
    placements: FIELD_PLACEMENTS,
    completionDetail: "Assigns a field to a UI group.",
    hoverSummary: "Assigns the field to a named grouping container.",
    valueLabel: "<group>",
  },
  showWhen: {
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: true,
    category: "structure",
    placements: FIELD_PLACEMENTS,
    completionDetail: "Conditional visibility rule.",
    hoverSummary: "Shows the field only when the condition is satisfied.",
  },
  hideWhen: {
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: true,
    category: "structure",
    placements: FIELD_PLACEMENTS,
    completionDetail: "Conditional visibility suppression rule.",
    hoverSummary: "Hides the field when the condition is satisfied.",
  },
  enableWhen: {
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: true,
    category: "structure",
    placements: FIELD_PLACEMENTS,
    completionDetail: "Conditional interactivity rule.",
    hoverSummary: "Enables the field only when the condition is satisfied.",
  },
  disableWhen: {
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: true,
    category: "structure",
    placements: FIELD_PLACEMENTS,
    completionDetail: "Conditional disablement rule.",
    hoverSummary: "Disables the field when the condition is satisfied.",
  },
  defaultValue: {
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: false,
    category: "ecosystem",
    placements: FIELD_PLACEMENTS,
    completionDetail: "Default JSON value for a field.",
    hoverSummary: "Provides a default JSON value for ecosystem integrations.",
    valueLabel: "<value>",
  },
  deprecated: {
    requiresArgument: false,
    supportedTargets: ["none"],
    allowDuplicates: false,
    category: "ecosystem",
    placements: ALL_PLACEMENTS,
    completionDetail: "Marks a declaration as deprecated.",
    hoverSummary: "Marks the declaration as deprecated.",
  },
  example: {
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: true,
    category: "ecosystem",
    placements: [...TYPE_PLACEMENTS, ...FIELD_PLACEMENTS],
    completionDetail: "Example serialized value.",
    hoverSummary: "Provides an example value for documentation and tooling.",
  },
  discriminator: {
    requiresArgument: true,
    supportedTargets: ["path"],
    allowDuplicates: false,
    category: "annotation",
    placements: TYPE_PLACEMENTS,
    completionDetail: "Declare a discriminator field for a generic object type.",
    hoverSummary: "Declares the field used as the discriminator for a generic object type.",
    valueLabel: "<typeParam>",
  },
  remarks: {
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: false,
    category: "ecosystem",
    placements: ALL_PLACEMENTS,
    completionDetail: "Additional remarks text.",
    hoverSummary: "Provides additional remarks for the declaration.",
  },
  see: {
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: true,
    category: "ecosystem",
    placements: ALL_PLACEMENTS,
    completionDetail: "Reference to related documentation.",
    hoverSummary: "References related documentation or declarations.",
    valueLabel: "<reference>",
  },
} as const satisfies Record<string, ExtraTagSpec>;

function buildExtraTagDefinition(canonicalName: string, spec: ExtraTagSpec): TagDefinition {
  const valueKind = spec.valueKind ?? inferValueKind(canonicalName);
  const valueLabel = spec.requiresArgument ? (spec.valueLabel ?? valueLabelForKind(valueKind)) : "";
  const signatures: TagSignature[] = [];

  if (spec.supportedTargets.includes("none")) {
    signatures.push(createSignature(canonicalName, spec.placements, null, valueKind, valueLabel));
  }
  if (spec.supportedTargets.includes("path")) {
    signatures.push(
      createSignature(
        canonicalName,
        spec.targetPlacements?.path ?? spec.placements,
        "path",
        valueKind,
        valueLabel
      )
    );
  }
  if (spec.supportedTargets.includes("member")) {
    signatures.push(
      createSignature(
        canonicalName,
        spec.targetPlacements?.member ?? spec.placements,
        "member",
        valueKind,
        valueLabel
      )
    );
  }
  if (spec.supportedTargets.includes("variant")) {
    signatures.push(
      createSignature(
        canonicalName,
        spec.targetPlacements?.variant ?? spec.placements,
        "variant",
        valueKind,
        valueLabel
      )
    );
  }

  return {
    canonicalName,
    valueKind,
    requiresArgument: spec.requiresArgument,
    supportedTargets: spec.supportedTargets,
    allowDuplicates: spec.allowDuplicates,
    category: spec.category,
    placements: spec.placements,
    // Capabilities express a *field-type* requirement (e.g. `@minLength` needs
    // a string-like field). Only constraint-category tags carry that meaning;
    // annotation, structure, and ecosystem tags describe or decorate the field
    // regardless of its type, so their value-kind must not leak into a field
    // constraint. `EXTRA_TAG_SPECS` currently has no constraint entries, but
    // we keep the `spec.category === "constraint"` check for future-proofing.
    capabilities: spec.category === "constraint" ? capabilitiesForValueKind(valueKind) : ([] as const),
    completionDetail: spec.completionDetail,
    hoverSummary: spec.hoverSummary,
    hoverMarkdown: buildHoverMarkdown(canonicalName, spec.hoverSummary, signatures, valueLabel),
    signatures,
  };
}

function placementsForMetadataDeclarationKinds(
  declarationKinds: readonly MetadataDeclarationKind[]
): readonly FormSpecPlacement[] {
  const placements = new Set<FormSpecPlacement>();

  for (const declarationKind of declarationKinds) {
    switch (declarationKind) {
      case "type":
        for (const placement of TYPE_PLACEMENTS) {
          placements.add(placement);
        }
        break;
      case "field":
        for (const placement of FIELD_PLACEMENTS) {
          placements.add(placement);
        }
        break;
      case "method":
        placements.add("class-method");
        placements.add("function");
        break;
      default: {
        const _exhaustive: never = declarationKind;
        return _exhaustive;
      }
    }
  }

  return [...placements];
}

function buildExtensionMetadataTagDefinition(
  extensionId: string,
  slot: MetadataSlotRegistration
): TagDefinition {
  const canonicalName = normalizeFormSpecTagName(slot.tagName);
  const supportsQualifiers = (slot.qualifiers?.length ?? 0) > 0;
  if (slot.allowBare === false && !supportsQualifiers) {
    throw new Error(
      `Metadata tag "@${canonicalName}" must allow bare usage or declare at least one qualifier.`
    );
  }
  const supportedTargets: readonly FormSpecTargetKind[] = supportsQualifiers
    ? slot.allowBare === false
      ? ["variant"]
      : ["none", "variant"]
    : slot.allowBare === false
      ? []
      : ["none"];
  const placements = placementsForMetadataDeclarationKinds(slot.declarationKinds);
  const signatures: TagSignature[] = [];
  const valueKind = "string";

  if (supportedTargets.includes("none")) {
    signatures.push(createSignature(canonicalName, placements, null, valueKind, "<value>"));
  }
  if (supportedTargets.includes("variant")) {
    signatures.push(createSignature(canonicalName, placements, "variant", valueKind, "<value>"));
  }

  return {
    canonicalName,
    valueKind,
    requiresArgument: true,
    supportedTargets,
    allowDuplicates: false,
    category: "annotation",
    placements,
    // Extension metadata tags are always annotations — they attach a typed
    // value to a declaration without constraining the declaration's type.
    // See `buildExtraTagDefinition` for the rationale.
    capabilities: [] as const,
    completionDetail: `Extension metadata tag from ${extensionId}`,
    hoverSummary: `Extension-defined metadata tag from \`${extensionId}\`.`,
    hoverMarkdown: [
      `**@${canonicalName}** \`<value>\``,
      "",
      `Extension-defined metadata tag from \`${extensionId}\`.`,
      "",
      signatures.map((signature) => `**Signature:** \`${signature.label}\``).join("\n"),
    ].join("\n"),
    signatures,
  };
}

const EXTRA_TAG_DEFINITIONS: Record<string, TagDefinition> = Object.fromEntries(
  Object.entries(EXTRA_TAG_SPECS).map(([canonicalName, spec]) => [
    canonicalName,
    buildExtraTagDefinition(canonicalName, spec),
  ])
);

export function normalizeFormSpecTagName(rawName: string): string {
  return normalizeConstraintTagName(rawName);
}

export function getTagDefinition(
  rawName: string,
  extensions?: readonly ExtensionTagSource[]
): TagDefinition | null {
  const normalized = normalizeFormSpecTagName(rawName);
  const builtin = BUILTIN_TAG_DEFINITIONS[normalized];
  if (builtin !== undefined) {
    return builtin;
  }

  const extra = EXTRA_TAG_DEFINITIONS[normalized];
  if (extra !== undefined) {
    return extra;
  }

  const extensionRegistration = getExtensionConstraintTags(extensions).find(
    (tag) => tag.tagName === normalized
  );

  if (extensionRegistration !== undefined) {
    return {
      canonicalName: extensionRegistration.tagName,
      valueKind: null,
      requiresArgument: true,
      supportedTargets: ["none"] as const,
      allowDuplicates: true,
      category: "constraint",
      placements: FIELD_PLACEMENTS,
      capabilities: [] as const,
      completionDetail: `Extension constraint tag from ${extensionRegistration.extensionId}`,
      hoverSummary: `Extension-defined constraint tag from \`${extensionRegistration.extensionId}\`.`,
      hoverMarkdown: [
        `**@${extensionRegistration.tagName}** \`<value>\``,
        "",
        `Extension-defined constraint tag from \`${extensionRegistration.extensionId}\`.`,
        "",
        `**Signature:** \`@${extensionRegistration.tagName} <value>\``,
      ].join("\n"),
      signatures: [
        {
          label: `@${extensionRegistration.tagName} <value>`,
          placements: FIELD_PLACEMENTS,
          parameters: [{ kind: "value", label: "<value>" }],
        },
      ],
    };
  }

  const extensionMetadata = getExtensionMetadataSlots(extensions).find(
    (slot) => slot.tagName === normalized
  );
  return extensionMetadata === undefined
    ? null
    : buildExtensionMetadataTagDefinition(extensionMetadata.extensionId, extensionMetadata.slot);
}

export function getConstraintTagDefinitions(
  extensions?: readonly ExtensionTagSource[]
): readonly TagDefinition[] {
  const builtins = Object.values(BUILTIN_TAG_DEFINITIONS);
  const custom = getExtensionConstraintTags(extensions)
    .map((tag) => getTagDefinition(tag.tagName, extensions))
    .filter((tag): tag is TagDefinition => tag !== null);
  return [...builtins, ...custom];
}

export function getAllTagDefinitions(
  extensions?: readonly ExtensionTagSource[]
): readonly TagDefinition[] {
  const builtins = Object.values(BUILTIN_TAG_DEFINITIONS);
  const extras = Object.values(EXTRA_TAG_DEFINITIONS);
  const custom = getExtensionConstraintTags(extensions)
    .map((tag) => getTagDefinition(tag.tagName, extensions))
    .filter((tag): tag is TagDefinition => tag !== null);
  const customMetadata = getExtensionMetadataSlots(extensions)
    .map((slot) => getTagDefinition(slot.tagName, extensions))
    .filter((tag): tag is TagDefinition => tag !== null);
  return [...builtins, ...extras, ...custom, ...customMetadata];
}

export function getTagHoverMarkdown(
  rawName: string,
  extensions?: readonly ExtensionTagSource[]
): string | null {
  return getTagDefinition(rawName, extensions)?.hoverMarkdown ?? null;
}

function getExtensionConstraintTags(
  extensions: readonly ExtensionTagSource[] | undefined
): readonly { extensionId: string; tagName: string }[] {
  return (
    extensions?.flatMap((extension) => {
      const tagRecords = extension.constraintTags ?? [];
      return tagRecords.map((tag) => ({
        extensionId: extension.extensionId,
        tagName: normalizeFormSpecTagName(tag.tagName),
      }));
    }) ?? []
  );
}

function getExtensionMetadataSlots(
  extensions: readonly ExtensionTagSource[] | undefined
): readonly { extensionId: string; tagName: string; slot: MetadataSlotRegistration }[] {
  return (
    extensions?.flatMap((extension) =>
      (extension.metadataSlots ?? []).map((slot) => ({
        extensionId: extension.extensionId,
        tagName: normalizeFormSpecTagName(slot.tagName),
        slot,
      }))
    ) ?? []
  );
}
