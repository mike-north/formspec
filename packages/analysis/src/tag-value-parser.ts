import {
  BUILTIN_CONSTRAINT_DEFINITIONS,
  isBuiltinConstraintName,
} from "@formspec/core/internals";
import type {
  AnnotationNode,
  BuiltinConstraintBroadeningRegistration,
  ConstraintNode,
  ConstraintTagRegistration,
  CustomConstraintRegistration,
  ExtensionDefinition,
  JsonValue,
  LengthConstraintNode,
  NumericConstraintNode,
  PathTarget,
  Provenance,
  TypeNode,
} from "@formspec/core";
import { parseTagSyntax } from "./comment-syntax.js";

const NUMERIC_CONSTRAINT_MAP: Record<string, NumericConstraintNode["constraintKind"]> = {
  minimum: "minimum",
  maximum: "maximum",
  exclusiveMinimum: "exclusiveMinimum",
  exclusiveMaximum: "exclusiveMaximum",
  multipleOf: "multipleOf",
};

const LENGTH_CONSTRAINT_MAP: Record<string, LengthConstraintNode["constraintKind"]> = {
  minLength: "minLength",
  maxLength: "maxLength",
  minItems: "minItems",
  maxItems: "maxItems",
};

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export interface ConstraintTagParseRegistryLike {
  readonly extensions: readonly ExtensionDefinition[];
  findConstraint(constraintId: string): CustomConstraintRegistration | undefined;
  findConstraintTag(tagName: string):
    | {
        readonly extensionId: string;
        readonly registration: ConstraintTagRegistration;
      }
    | undefined;
  findBuiltinConstraintBroadening(
    typeId: string,
    tagName: string
  ):
    | {
        readonly extensionId: string;
        readonly registration: BuiltinConstraintBroadeningRegistration;
      }
    | undefined;
}

export interface ParseConstraintTagValueOptions {
  readonly registry?: ConstraintTagParseRegistryLike;
  readonly fieldType?: TypeNode;
}

function syntaxOptions(
  registry: ConstraintTagParseRegistryLike | undefined
): Parameters<typeof parseTagSyntax>[2] {
  return registry?.extensions !== undefined ? { extensions: registry.extensions } : undefined;
}

export function parseConstraintTagValue(
  tagName: string,
  text: string,
  provenance: Provenance,
  options?: ParseConstraintTagValueOptions
): ConstraintNode | null {
  const customConstraint = parseExtensionConstraintTagValue(tagName, text, provenance, options);
  if (customConstraint !== null) {
    return customConstraint;
  }

  if (!isBuiltinConstraintName(tagName)) {
    return null;
  }

  const parsedTag = parseTagSyntax(tagName, text, syntaxOptions(options?.registry));
  if (parsedTag.target !== null && !parsedTag.target.valid) {
    return null;
  }

  const effectiveText = parsedTag.argumentText;
  const path = parsedTag.target?.path ?? undefined;
  const expectedType = BUILTIN_CONSTRAINT_DEFINITIONS[tagName];

  if (expectedType !== "boolean" && effectiveText.trim() === "") {
    return null;
  }

  if (expectedType === "number") {
    const value = Number(effectiveText);
    if (Number.isNaN(value)) {
      return null;
    }

    const numericKind = NUMERIC_CONSTRAINT_MAP[tagName as keyof typeof NUMERIC_CONSTRAINT_MAP];
    if (numericKind !== undefined) {
      return {
        kind: "constraint",
        constraintKind: numericKind,
        value,
        ...(path !== undefined && { path }),
        provenance,
      };
    }

    const lengthKind = LENGTH_CONSTRAINT_MAP[tagName as keyof typeof LENGTH_CONSTRAINT_MAP];
    if (lengthKind !== undefined) {
      return {
        kind: "constraint",
        constraintKind: lengthKind,
        value,
        ...(path !== undefined && { path }),
        provenance,
      };
    }

    return null;
  }

  if (expectedType === "boolean") {
    const trimmed = effectiveText.trim();
    if (trimmed !== "" && trimmed !== "true") {
      return null;
    }

    if (tagName === "uniqueItems") {
      return {
        kind: "constraint",
        constraintKind: "uniqueItems",
        value: true,
        ...(path !== undefined && { path }),
        provenance,
      };
    }

    return null;
  }

  if (expectedType === "json") {
    if (tagName === "const") {
      const trimmedText = effectiveText.trim();
      if (trimmedText === "") {
        return null;
      }

      try {
        const parsed = JSON.parse(trimmedText) as JsonValue;
        return {
          kind: "constraint",
          constraintKind: "const",
          value: parsed,
          ...(path !== undefined && { path }),
          provenance,
        };
      } catch {
        return {
          kind: "constraint",
          constraintKind: "const",
          value: trimmedText,
          ...(path !== undefined && { path }),
          provenance,
        };
      }
    }

    const parsed = tryParseJson(effectiveText);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const members: (string | number)[] = [];
    for (const item of parsed) {
      if (typeof item === "string" || typeof item === "number") {
        members.push(item);
        continue;
      }

      if (typeof item === "object" && item !== null && "id" in item) {
        const id = (item as Record<string, unknown>)["id"];
        if (typeof id === "string" || typeof id === "number") {
          members.push(id);
        }
      }
    }

    return {
      kind: "constraint",
      constraintKind: "allowedMembers",
      members,
      ...(path !== undefined && { path }),
      provenance,
    };
  }

  return {
    kind: "constraint",
    constraintKind: "pattern",
    pattern: effectiveText,
    ...(path !== undefined && { path }),
    provenance,
  };
}

export function parseDefaultValueTagValue(text: string, provenance: Provenance): AnnotationNode {
  const trimmed = text.trim();
  let value: JsonValue;

  if (trimmed === "null") {
    value = null;
  } else if (trimmed === "true") {
    value = true;
  } else if (trimmed === "false") {
    value = false;
  } else {
    const parsed = tryParseJson(trimmed);
    value = parsed !== null ? (parsed as JsonValue) : trimmed;
  }

  return {
    kind: "annotation",
    annotationKind: "defaultValue",
    value,
    provenance,
  };
}

function parseExtensionConstraintTagValue(
  tagName: string,
  text: string,
  provenance: Provenance,
  options?: ParseConstraintTagValueOptions
): ConstraintNode | null {
  const parsedTag = parseTagSyntax(tagName, text, syntaxOptions(options?.registry));
  if (parsedTag.target !== null && !parsedTag.target.valid) {
    return null;
  }

  const effectiveText = parsedTag.argumentText;
  const path = parsedTag.target?.path ?? undefined;
  const registry = options?.registry;
  if (registry === undefined) {
    return null;
  }

  if (effectiveText.trim() === "") {
    return null;
  }

  const directTag = registry.findConstraintTag(tagName);
  if (directTag !== undefined) {
    return makeCustomConstraintNode(
      directTag.extensionId,
      directTag.registration.constraintName,
      directTag.registration.parseValue(effectiveText),
      provenance,
      path,
      registry
    );
  }

  if (!isBuiltinConstraintName(tagName)) {
    return null;
  }

  const broadenedTypeId = getBroadenedCustomTypeId(options?.fieldType);
  if (broadenedTypeId === undefined) {
    return null;
  }

  const broadened = registry.findBuiltinConstraintBroadening(broadenedTypeId, tagName);
  if (broadened === undefined) {
    return null;
  }

  return makeCustomConstraintNode(
    broadened.extensionId,
    broadened.registration.constraintName,
    broadened.registration.parseValue(effectiveText),
    provenance,
    path,
    registry
  );
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

function makeCustomConstraintNode(
  extensionId: string,
  constraintName: string,
  payload: JsonValue,
  provenance: Provenance,
  path: PathTarget | undefined,
  registry: ConstraintTagParseRegistryLike
): ConstraintNode {
  const constraintId = `${extensionId}/${constraintName}`;
  const registration = registry.findConstraint(constraintId);
  if (registration === undefined) {
    throw new Error(
      `Custom TSDoc tag resolved to unregistered constraint "${constraintId}". Register the constraint before using its tag.`
    );
  }

  return {
    kind: "constraint",
    constraintKind: "custom",
    constraintId,
    payload,
    compositionRule: registration.compositionRule,
    ...(path !== undefined && { path }),
    provenance,
  };
}
