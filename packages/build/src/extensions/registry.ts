/**
 * Extension registry for resolving custom types, constraints, and annotations
 * during JSON Schema generation and IR validation.
 *
 * The registry is created from a list of {@link ExtensionDefinition} objects
 * and provides O(1) lookup by fully-qualified ID (extensionId + "/" + name).
 *
 * @packageDocumentation
 */

import type {
  ExtensionDefinition,
  CustomTypeRegistration,
  CustomConstraintRegistration,
  CustomAnnotationRegistration,
  ConstraintTagRegistration,
  BuiltinConstraintBroadeningRegistration,
} from "@formspec/core";
import {
  BUILTIN_CONSTRAINT_DEFINITIONS,
  normalizeConstraintTagName,
} from "@formspec/core/internals";
import {
  getTagDefinition,
  normalizeFormSpecTagName,
  type ExtensionTagSource,
} from "@formspec/analysis/internal";

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * A registry of extensions that provides lookup by fully-qualified ID.
 *
 * Type IDs follow the format: `<extensionId>/<typeName>`
 * Constraint IDs follow the format: `<extensionId>/<constraintName>`
 * Annotation IDs follow the format: `<extensionId>/<annotationName>`
 *
 * @public
 */
export interface ExtensionRegistry {
  /** The extensions registered in this registry (in registration order). */
  readonly extensions: readonly ExtensionDefinition[];

  /**
   * Look up a custom type registration by its fully-qualified type ID.
   *
   * @param typeId - The fully-qualified type ID (e.g., "x-stripe/monetary/Decimal").
   * @returns The registration if found, otherwise `undefined`.
   */
  findType(typeId: string): CustomTypeRegistration | undefined;
  /**
   * Look up a custom type registration by a TypeScript-facing type name.
   *
   * This is used during TSDoc/class analysis to resolve extension-defined
   * custom types from source-level declarations.
   */
  findTypeByName(
    typeName: string
  ): { readonly extensionId: string; readonly registration: CustomTypeRegistration } | undefined;
  /**
   * Look up a custom type registration by a brand identifier.
   *
   * This is used during class analysis to resolve extension-defined custom types
   * via structural brand detection (`unique symbol` computed property keys).
   *
   * @param brand - The identifier text of the `unique symbol` brand variable.
   */
  findTypeByBrand(
    brand: string
  ): { readonly extensionId: string; readonly registration: CustomTypeRegistration } | undefined;

  /**
   * Look up a custom constraint registration by its fully-qualified constraint ID.
   *
   * @param constraintId - The fully-qualified constraint ID.
   * @returns The registration if found, otherwise `undefined`.
   */
  findConstraint(constraintId: string): CustomConstraintRegistration | undefined;
  /**
   * Look up a TSDoc custom constraint-tag registration by tag name.
   */
  findConstraintTag(tagName: string):
    | {
        readonly extensionId: string;
        readonly registration: ConstraintTagRegistration;
      }
    | undefined;
  /**
   * Look up built-in tag broadening for a given custom type ID.
   */
  findBuiltinConstraintBroadening(
    typeId: string,
    tagName: string
  ):
    | {
        readonly extensionId: string;
        readonly registration: BuiltinConstraintBroadeningRegistration;
      }
    | undefined;

  /**
   * Look up a custom annotation registration by its fully-qualified annotation ID.
   *
   * @param annotationId - The fully-qualified annotation ID.
   * @returns The registration if found, otherwise `undefined`.
   */
  findAnnotation(annotationId: string): CustomAnnotationRegistration | undefined;
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

const BUILTIN_METADATA_TAGS = new Set(["apiName", "displayName"]);

function buildConstraintTagSources(
  extensions: readonly ExtensionDefinition[]
): readonly ExtensionTagSource[] {
  return extensions.map((extension) => ({
    extensionId: extension.extensionId,
    ...(extension.constraintTags !== undefined
      ? {
          constraintTags: extension.constraintTags.map((tag) => ({
            tagName: normalizeFormSpecTagName(tag.tagName),
          })),
        }
      : {}),
  }));
}

/**
 * Creates an extension registry from a list of extension definitions.
 *
 * The registry indexes all types, constraints, and annotations by their
 * fully-qualified IDs (`<extensionId>/<name>`) for O(1) lookup during
 * generation and validation.
 *
 * @param extensions - The extension definitions to register.
 * @returns An {@link ExtensionRegistry} instance.
 * @throws If duplicate type/constraint/annotation IDs are detected across extensions.
 *
 * @public
 */
export function createExtensionRegistry(
  extensions: readonly ExtensionDefinition[]
): ExtensionRegistry {
  const reservedTagSources = buildConstraintTagSources(extensions);
  const typeMap = new Map<string, CustomTypeRegistration>();
  const typeNameMap = new Map<
    string,
    { readonly extensionId: string; readonly registration: CustomTypeRegistration }
  >();
  const brandMap = new Map<
    string,
    { readonly extensionId: string; readonly registration: CustomTypeRegistration }
  >();
  const constraintMap = new Map<string, CustomConstraintRegistration>();
  const constraintTagMap = new Map<
    string,
    { readonly extensionId: string; readonly registration: ConstraintTagRegistration }
  >();
  const builtinBroadeningMap = new Map<
    string,
    { readonly extensionId: string; readonly registration: BuiltinConstraintBroadeningRegistration }
  >();
  const annotationMap = new Map<string, CustomAnnotationRegistration>();
  const metadataSlotMap = new Map<string, true>();
  const metadataTagMap = new Map<string, true>();

  for (const ext of extensions) {
    if (ext.types !== undefined) {
      for (const type of ext.types) {
        const qualifiedId = `${ext.extensionId}/${type.typeName}`;
        if (typeMap.has(qualifiedId)) {
          throw new Error(`Duplicate custom type ID: "${qualifiedId}"`);
        }
        typeMap.set(qualifiedId, type);

        for (const sourceTypeName of type.tsTypeNames ?? [type.typeName]) {
          if (typeNameMap.has(sourceTypeName)) {
            throw new Error(`Duplicate custom type source name: "${sourceTypeName}"`);
          }
          typeNameMap.set(sourceTypeName, {
            extensionId: ext.extensionId,
            registration: type,
          });
        }

        if (type.brand !== undefined) {
          if (type.brand === "__integerBrand") {
            throw new Error(
              `Brand "__integerBrand" is reserved for the builtin Integer type and cannot be registered by extensions`
            );
          }
          if (brandMap.has(type.brand)) {
            throw new Error(`Duplicate custom type brand: "${type.brand}"`);
          }
          brandMap.set(type.brand, {
            extensionId: ext.extensionId,
            registration: type,
          });
        }

        if (type.builtinConstraintBroadenings !== undefined) {
          for (const broadening of type.builtinConstraintBroadenings) {
            const key = `${qualifiedId}:${broadening.tagName}`;
            if (builtinBroadeningMap.has(key)) {
              throw new Error(`Duplicate built-in constraint broadening: "${key}"`);
            }
            builtinBroadeningMap.set(key, {
              extensionId: ext.extensionId,
              registration: broadening,
            });
          }
        }
      }
    }

    if (ext.constraints !== undefined) {
      for (const constraint of ext.constraints) {
        const qualifiedId = `${ext.extensionId}/${constraint.constraintName}`;
        if (constraintMap.has(qualifiedId)) {
          throw new Error(`Duplicate custom constraint ID: "${qualifiedId}"`);
        }
        constraintMap.set(qualifiedId, constraint);
      }
    }

    if (ext.constraintTags !== undefined) {
      for (const tag of ext.constraintTags) {
        const canonicalTagName = normalizeFormSpecTagName(tag.tagName);
        if (constraintTagMap.has(canonicalTagName)) {
          throw new Error(`Duplicate custom constraint tag: "@${canonicalTagName}"`);
        }
        constraintTagMap.set(canonicalTagName, {
          extensionId: ext.extensionId,
          registration: tag,
        });
      }
    }

    if (ext.annotations !== undefined) {
      for (const annotation of ext.annotations) {
        const qualifiedId = `${ext.extensionId}/${annotation.annotationName}`;
        if (annotationMap.has(qualifiedId)) {
          throw new Error(`Duplicate custom annotation ID: "${qualifiedId}"`);
        }
        annotationMap.set(qualifiedId, annotation);
      }
    }

    if (ext.metadataSlots !== undefined) {
      for (const slot of ext.metadataSlots) {
        if (metadataSlotMap.has(slot.slotId)) {
          throw new Error(`Duplicate metadata slot ID: "${slot.slotId}"`);
        }
        metadataSlotMap.set(slot.slotId, true);

        const canonicalTagName = normalizeFormSpecTagName(slot.tagName);
        if (slot.allowBare === false && (slot.qualifiers?.length ?? 0) === 0) {
          throw new Error(
            `Metadata tag "@${canonicalTagName}" must allow bare usage or declare at least one qualifier.`
          );
        }
        if (metadataTagMap.has(canonicalTagName)) {
          throw new Error(`Duplicate metadata tag: "@${canonicalTagName}"`);
        }
        if (BUILTIN_METADATA_TAGS.has(canonicalTagName)) {
          throw new Error(
            `Metadata tag "@${canonicalTagName}" conflicts with built-in metadata tags.`
          );
        }
        if (constraintTagMap.has(canonicalTagName)) {
          throw new Error(
            `Metadata tag "@${canonicalTagName}" conflicts with existing FormSpec tag "@${canonicalTagName}".`
          );
        }
        if (
          Object.hasOwn(BUILTIN_CONSTRAINT_DEFINITIONS, normalizeConstraintTagName(canonicalTagName))
        ) {
          throw new Error(
            `Metadata tag "@${canonicalTagName}" conflicts with existing FormSpec tag "@${normalizeConstraintTagName(canonicalTagName)}".`
          );
        }
        const existingTag = getTagDefinition(canonicalTagName, reservedTagSources);
        if (existingTag !== null) {
          throw BUILTIN_METADATA_TAGS.has(existingTag.canonicalName)
            ? new Error(
                `Metadata tag "@${canonicalTagName}" conflicts with built-in metadata tags.`
              )
            : new Error(
                `Metadata tag "@${canonicalTagName}" conflicts with existing FormSpec tag "@${existingTag.canonicalName}".`
              );
        }
        metadataTagMap.set(canonicalTagName, true);
      }
    }
  }

  return {
    extensions,
    findType: (typeId: string) => typeMap.get(typeId),
    findTypeByName: (typeName: string) => typeNameMap.get(typeName),
    findTypeByBrand: (brand: string) => brandMap.get(brand),
    findConstraint: (constraintId: string) => constraintMap.get(constraintId),
    findConstraintTag: (tagName: string) =>
      constraintTagMap.get(normalizeFormSpecTagName(tagName)),
    findBuiltinConstraintBroadening: (typeId: string, tagName: string) =>
      builtinBroadeningMap.get(`${typeId}:${tagName}`),
    findAnnotation: (annotationId: string) => annotationMap.get(annotationId),
  };
}
