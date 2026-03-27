import {
  BUILTIN_CONSTRAINT_DEFINITIONS,
  isBuiltinConstraintName,
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
export type FormSpecTargetKind = "none" | "path" | "member";

export interface FormSpecTagMetadata {
  readonly canonicalName: string;
  readonly valueKind: FormSpecValueKind | null;
  readonly requiresArgument: boolean;
  readonly supportedTargets: readonly FormSpecTargetKind[];
  readonly allowDuplicates: boolean;
  readonly category:
    | "constraint"
    | "annotation"
    | "structure"
    | "ecosystem";
}

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

const EXTRA_TAGS = {
  displayName: {
    requiresArgument: true,
    supportedTargets: ["none", "member"] as const,
    allowDuplicates: false,
    category: "annotation" as const,
  },
  description: {
    requiresArgument: true,
    supportedTargets: ["none"] as const,
    allowDuplicates: false,
    category: "annotation" as const,
  },
  format: {
    requiresArgument: true,
    supportedTargets: ["none"] as const,
    allowDuplicates: false,
    category: "annotation" as const,
  },
  placeholder: {
    requiresArgument: true,
    supportedTargets: ["none"] as const,
    allowDuplicates: false,
    category: "annotation" as const,
  },
  order: {
    requiresArgument: true,
    supportedTargets: ["none"] as const,
    allowDuplicates: false,
    category: "annotation" as const,
  },
  apiName: {
    requiresArgument: true,
    supportedTargets: ["none", "member"] as const,
    allowDuplicates: false,
    category: "annotation" as const,
  },
  group: {
    requiresArgument: true,
    supportedTargets: ["none"] as const,
    allowDuplicates: false,
    category: "structure" as const,
  },
  showWhen: {
    requiresArgument: true,
    supportedTargets: ["none"] as const,
    allowDuplicates: true,
    category: "structure" as const,
  },
  hideWhen: {
    requiresArgument: true,
    supportedTargets: ["none"] as const,
    allowDuplicates: true,
    category: "structure" as const,
  },
  enableWhen: {
    requiresArgument: true,
    supportedTargets: ["none"] as const,
    allowDuplicates: true,
    category: "structure" as const,
  },
  disableWhen: {
    requiresArgument: true,
    supportedTargets: ["none"] as const,
    allowDuplicates: true,
    category: "structure" as const,
  },
  defaultValue: {
    requiresArgument: true,
    supportedTargets: ["none"] as const,
    allowDuplicates: false,
    category: "ecosystem" as const,
  },
  deprecated: {
    requiresArgument: false,
    supportedTargets: ["none"] as const,
    allowDuplicates: false,
    category: "ecosystem" as const,
  },
  example: {
    requiresArgument: true,
    supportedTargets: ["none"] as const,
    allowDuplicates: true,
    category: "ecosystem" as const,
  },
  remarks: {
    requiresArgument: true,
    supportedTargets: ["none"] as const,
    allowDuplicates: false,
    category: "ecosystem" as const,
  },
  see: {
    requiresArgument: true,
    supportedTargets: ["none"] as const,
    allowDuplicates: true,
    category: "ecosystem" as const,
  },
} as const;

function getBuiltinValueKind(name: BuiltinConstraintName): FormSpecValueKind {
  if (INTEGER_VALUE_TAGS.has(name)) return "integer";
  if (JSON_VALUE_TAGS.has(name)) return "json";
  if (BOOLEAN_VALUE_TAGS.has(name)) return "boolean";
  if (STRING_VALUE_TAGS.has(name)) return "string";
  return "number";
}

const BUILTIN_METADATA = Object.fromEntries(
  (Object.keys(BUILTIN_CONSTRAINT_DEFINITIONS) as BuiltinConstraintName[]).map((name) => [
    name,
    {
      canonicalName: name,
      valueKind: getBuiltinValueKind(name),
      requiresArgument: true,
      supportedTargets: ["none", "path"] as const,
      allowDuplicates: false,
      category: "constraint" as const,
    } satisfies FormSpecTagMetadata,
  ])
) as unknown as Record<BuiltinConstraintName, FormSpecTagMetadata>;

const extraTagEntries: Array<readonly [string, FormSpecTagMetadata]> = Object.entries(EXTRA_TAGS).map(
  ([canonicalName, meta]) => [
    canonicalName,
    {
      canonicalName,
      valueKind: JSON_VALUE_TAGS.has(canonicalName)
        ? "json"
        : BOOLEAN_VALUE_TAGS.has(canonicalName)
          ? "boolean"
            : INTEGER_VALUE_TAGS.has(canonicalName)
              ? "integer"
              : SIGNED_INTEGER_VALUE_TAGS.has(canonicalName)
                ? "signedInteger"
              : STRING_VALUE_TAGS.has(canonicalName)
                ? "string"
                : CONDITION_VALUE_TAGS.has(canonicalName)
                ? "condition"
                : null,
      ...meta,
    },
  ]
);

export const FORM_SPEC_TAGS: ReadonlyMap<string, FormSpecTagMetadata> = new Map(
  [
    ...Object.entries(BUILTIN_METADATA),
    ...extraTagEntries,
  ] satisfies ReadonlyArray<readonly [string, FormSpecTagMetadata]>
);

export function normalizeFormSpecTagName(rawName: string): string {
  return normalizeConstraintTagName(rawName);
}

export function getTagMetadata(rawName: string): FormSpecTagMetadata | null {
  const normalized = normalizeFormSpecTagName(rawName);
  return FORM_SPEC_TAGS.get(normalized) ?? null;
}

export function isKnownFormSpecTag(rawName: string): boolean {
  const normalized = normalizeFormSpecTagName(rawName);
  return FORM_SPEC_TAGS.has(normalized) || isBuiltinConstraintName(normalized);
}

export const NON_NEGATIVE_INTEGER_TAGS = new Set(
  [...FORM_SPEC_TAGS.values()].flatMap((tag) =>
    tag.valueKind === "integer" ? [tag.canonicalName] : []
  )
);

export const JSON_VALUE_TAGS_SET = new Set(
  [...FORM_SPEC_TAGS.values()].flatMap((tag) => (tag.valueKind === "json" ? [tag.canonicalName] : []))
);
