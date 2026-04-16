import type {
  FieldNode,
  FormIR,
  FormIRElement,
  ObjectProperty,
  TypeDefinition,
  TypeNode,
} from "@formspec/core/internals";
import { getSerializedName } from "./resolve.js";

interface SerializedNameEntry {
  readonly logicalName: string;
  readonly serializedName: string;
  readonly category: "field" | "object property" | "type definition";
}

function assertUniqueSerializedNames(entries: readonly SerializedNameEntry[], scope: string): void {
  const seen = new Map<string, SerializedNameEntry>();

  for (const entry of entries) {
    const previous = seen.get(entry.serializedName);
    if (previous !== undefined) {
      if (previous.logicalName === entry.logicalName && previous.category === entry.category) {
        continue;
      }
      throw new Error(
        `Serialized name collision in ${scope}: ${previous.category} "${previous.logicalName}" and ${entry.category} "${entry.logicalName}" both resolve to "${entry.serializedName}".`
      );
    }
    seen.set(entry.serializedName, entry);
  }
}

function collectFlattenedFields(elements: readonly FormIRElement[]): FieldNode[] {
  const fields: FieldNode[] = [];

  for (const element of elements) {
    switch (element.kind) {
      case "field":
        fields.push(element);
        break;
      case "group":
      case "conditional":
        fields.push(...collectFlattenedFields(element.elements));
        break;
      default: {
        const exhaustive: never = element;
        void exhaustive;
      }
    }
  }

  return fields;
}

function validateObjectProperties(properties: readonly ObjectProperty[], scope: string): void {
  assertUniqueSerializedNames(
    properties.map((property) => ({
      logicalName: property.name,
      serializedName: getSerializedName(property.name, property.metadata),
      category: "object property" as const,
    })),
    scope
  );

  for (const property of properties) {
    validateTypeNode(
      property.type,
      `${scope}.${getSerializedName(property.name, property.metadata)}`
    );
  }
}

function validateTypeNode(type: TypeNode, scope: string): void {
  switch (type.kind) {
    case "array":
      validateTypeNode(type.items, `${scope}[]`);
      break;
    case "object":
      validateObjectProperties(type.properties, scope);
      break;
    case "record":
      validateTypeNode(type.valueType, `${scope}.*`);
      break;
    case "union":
      type.members.forEach((member, index) => {
        validateTypeNode(member, `${scope}|${String(index)}`);
      });
      break;
    case "reference":
    case "primitive":
    case "enum":
    case "dynamic":
    case "custom":
      break;
    default: {
      const exhaustive: never = type;
      void exhaustive;
    }
  }
}

function validateTypeDefinitions(typeRegistry: FormIR["typeRegistry"]): void {
  const definitions = Object.values(typeRegistry);
  assertUniqueSerializedNames(
    definitions.map((definition) => ({
      logicalName: definition.name,
      serializedName: getSerializedName(definition.name, definition.metadata),
      category: "type definition" as const,
    })),
    "$defs"
  );

  for (const definition of definitions) {
    validateTypeDefinition(definition);
  }
}

function validateTypeDefinition(definition: TypeDefinition): void {
  validateTypeNode(
    definition.type,
    `type "${getSerializedName(definition.name, definition.metadata)}"`
  );
}

export function assertNoSerializedNameCollisions(ir: FormIR): void {
  assertUniqueSerializedNames(
    collectFlattenedFields(ir.elements).map((field) => ({
      logicalName: field.name,
      serializedName: getSerializedName(field.name, field.metadata),
      category: "field" as const,
    })),
    "form root"
  );

  for (const field of collectFlattenedFields(ir.elements)) {
    validateTypeNode(field.type, `field "${getSerializedName(field.name, field.metadata)}"`);
  }

  validateTypeDefinitions(ir.typeRegistry);
}
