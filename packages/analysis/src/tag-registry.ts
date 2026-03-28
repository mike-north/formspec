import {
  BUILTIN_CONSTRAINT_DEFINITIONS,
  normalizeConstraintTagName,
  type BuiltinConstraintName,
} from "@formspec/core";

export type FormSpecValueKind =
  | "number"
  | "integer"
  | "signedInteger"
  | "string"
  | "json"
  | "boolean"
  | "condition";

export type FormSpecTargetKind = "none" | "path" | "member" | "variant";
export type FormSpecTagCategory = "constraint" | "annotation" | "structure" | "ecosystem";

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
  | "condition-like";

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
  readonly capabilities: readonly SemanticCapability[];
  readonly completionDetail: string;
  readonly hoverMarkdown: string;
  readonly signatures: readonly TagSignature[];
}

export type FormSpecTagDefinition = TagDefinition;
export type FormSpecTagOverload = TagSignature;
export type FormSpecTagParameter = TagSignatureParameter;

export interface ExtensionConstraintTagSource {
  readonly tagName: string;
}

export interface ExtensionTagSource {
  readonly extensionId: string;
  readonly constraintTags?: readonly ExtensionConstraintTagSource[];
}

const FIELD_PLACEMENTS = [
  "class-field",
  "interface-field",
  "type-alias-field",
  "variable",
  "function-parameter",
  "method-parameter",
] as const satisfies readonly FormSpecPlacement[];

const TYPE_PLACEMENTS = ["class", "interface", "type-alias"] as const satisfies readonly FormSpecPlacement[];

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

function getBuiltinValueKind(name: BuiltinConstraintName): FormSpecValueKind {
  if (INTEGER_VALUE_TAGS.has(name)) return "integer";
  if (JSON_VALUE_TAGS.has(name)) return "json";
  if (BOOLEAN_VALUE_TAGS.has(name)) return "boolean";
  if (STRING_VALUE_TAGS.has(name)) return "string";
  return "number";
}

function capabilitiesForValueKind(valueKind: FormSpecValueKind | null): readonly SemanticCapability[] {
  switch (valueKind) {
    case "number":
    case "integer":
      return ["numeric-comparable"];
    case "string":
      return ["string-like"];
    case "json":
      return ["json-like"];
    case "boolean":
      return [];
    case "condition":
      return ["condition-like"];
    case "signedInteger":
      return ["numeric-comparable"];
    case null:
      return [];
    default: {
      const _exhaustive: never = valueKind;
      return _exhaustive;
    }
  }
}

function makeConstraintSignature(name: BuiltinConstraintName): TagSignature {
  const valueKind = getBuiltinValueKind(name);
  const valueLabel =
    valueKind === "integer"
      ? "<integer>"
      : valueKind === "json"
        ? "<json>"
        : valueKind === "boolean"
          ? ""
          : "<number>";

  const parameters: TagSignatureParameter[] = [];
  const capability = capabilitiesForValueKind(valueKind)[0];
  parameters.push({
    kind: "target-path",
    label: "[:path]",
    optional: true,
    ...(capability !== undefined && { capability }),
  });
  if (valueLabel !== "") {
    parameters.push({
      kind: "value",
      label: valueLabel,
      valueKind,
    });
  }

  return {
    label: `@${name}${valueLabel === "" ? " [:path]" : ` [:path] ${valueLabel}`}`,
    placements: FIELD_PLACEMENTS,
    parameters,
  };
}

const BUILTIN_TAG_DEFINITIONS = Object.fromEntries(
  (Object.keys(BUILTIN_CONSTRAINT_DEFINITIONS) as BuiltinConstraintName[]).map((name) => {
    const valueKind = getBuiltinValueKind(name);
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
        capabilities: capabilitiesForValueKind(valueKind),
        completionDetail: CONSTRAINT_COMPLETION_DETAIL[name] ?? `@${name}`,
        hoverMarkdown: CONSTRAINT_HOVER_DOCS[name] ?? `**@${name}**`,
        signatures: [makeConstraintSignature(name)],
      } satisfies TagDefinition,
    ];
  })
) as Record<string, TagDefinition>;

const EXTRA_TAGS = {
  displayName: {
    valueKind: "string",
    requiresArgument: true,
    supportedTargets: ["none", "member", "variant"],
    allowDuplicates: false,
    category: "annotation",
    placements: [...TYPE_PLACEMENTS, ...FIELD_PLACEMENTS],
    completionDetail: "Display label for a type, field, or enum member.",
    hoverMarkdown: "**@displayName** `<label>`\n\nProvides a user-facing display label.",
    signatures: [
      {
        label: "@displayName <label>",
        placements: [...TYPE_PLACEMENTS, ...FIELD_PLACEMENTS],
        parameters: [{ kind: "value", label: "<label>", valueKind: "string" }],
      },
      {
        label: "@displayName :member <label>",
        placements: FIELD_PLACEMENTS,
        parameters: [
          { kind: "target-member", label: ":member", optional: false, capability: "enum-member-addressable" },
          { kind: "value", label: "<label>", valueKind: "string" },
        ],
      },
      {
        label: "@displayName :variant <label>",
        placements: FIELD_PLACEMENTS,
        parameters: [
          { kind: "target-variant", label: ":variant", optional: false },
          { kind: "value", label: "<label>", valueKind: "string" },
        ],
      },
    ],
  },
  description: {
    valueKind: "string",
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: false,
    category: "annotation",
    placements: [...TYPE_PLACEMENTS, ...FIELD_PLACEMENTS],
    completionDetail: "Description text for a type or field.",
    hoverMarkdown: "**@description** `<text>`\n\nProvides descriptive documentation for a type or field.",
    signatures: [
      {
        label: "@description <text>",
        placements: [...TYPE_PLACEMENTS, ...FIELD_PLACEMENTS],
        parameters: [{ kind: "value", label: "<text>", valueKind: "string" }],
      },
    ],
  },
  format: {
    valueKind: "string",
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: false,
    category: "annotation",
    placements: FIELD_PLACEMENTS,
    completionDetail: "Format hint for a field.",
    hoverMarkdown: "**@format** `<format>`\n\nProvides a format hint for a field.",
    signatures: [
      {
        label: "@format <format>",
        placements: FIELD_PLACEMENTS,
        parameters: [{ kind: "value", label: "<format>", valueKind: "string" }],
      },
    ],
  },
  placeholder: {
    valueKind: "string",
    requiresArgument: true,
    supportedTargets: ["none"],
    allowDuplicates: false,
    category: "annotation",
    placements: FIELD_PLACEMENTS,
    completionDetail: "Placeholder text for a field.",
    hoverMarkdown: "**@placeholder** `<text>`\n\nProvides placeholder text for a field.",
    signatures: [
      {
        label: "@placeholder <text>",
        placements: FIELD_PLACEMENTS,
        parameters: [{ kind: "value", label: "<text>", valueKind: "string" }],
      },
    ],
  },
} as const;

const EXTRA_TAG_DEFINITIONS: Record<string, TagDefinition> = Object.fromEntries(
  Object.entries(EXTRA_TAGS).map(([canonicalName, tag]) => [
    canonicalName,
    {
      canonicalName,
      valueKind: tag.valueKind,
      requiresArgument: tag.requiresArgument,
      supportedTargets: tag.supportedTargets,
      allowDuplicates: tag.allowDuplicates,
      category: tag.category,
      placements: tag.placements,
      capabilities: capabilitiesForValueKind(tag.valueKind),
      completionDetail: tag.completionDetail,
      hoverMarkdown: tag.hoverMarkdown,
      signatures: tag.signatures,
    } satisfies TagDefinition,
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

  const extensionRegistration = getExtensionConstraintTags(extensions)
    .find((tag) => tag.tagName === normalized);

  if (extensionRegistration === undefined) {
    return null;
  }

  return {
    canonicalName: extensionRegistration.tagName,
    valueKind: null,
    requiresArgument: true,
    supportedTargets: ["none"] as const,
    allowDuplicates: true,
    category: "constraint",
    placements: FIELD_PLACEMENTS,
    capabilities: [],
    completionDetail: `Extension constraint tag from ${extensionRegistration.extensionId}`,
    hoverMarkdown: [
      `**@${extensionRegistration.tagName}** \`<value>\``,
      "",
      `Extension-defined constraint tag from \`${extensionRegistration.extensionId}\`.`,
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

export function getConstraintTagDefinitions(
  extensions?: readonly ExtensionTagSource[]
): readonly TagDefinition[] {
  const builtins = Object.values(BUILTIN_TAG_DEFINITIONS);
  const custom =
    getExtensionConstraintTags(extensions)
      .map((tag) => getTagDefinition(tag.tagName, extensions))
      .filter((tag): tag is TagDefinition => tag !== null);
  return [...builtins, ...custom];
}

export function getAllTagDefinitions(
  extensions?: readonly ExtensionTagSource[]
): readonly TagDefinition[] {
  const builtins = Object.values(BUILTIN_TAG_DEFINITIONS);
  const extras = Object.values(EXTRA_TAG_DEFINITIONS);
  const custom =
    getExtensionConstraintTags(extensions)
      .map((tag) => getTagDefinition(tag.tagName, extensions))
      .filter((tag): tag is TagDefinition => tag !== null);
  return [...builtins, ...extras, ...custom];
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
        tagName: tag.tagName,
      }));
    }) ?? []
  );
}
