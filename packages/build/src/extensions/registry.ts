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

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * A registry of extensions that provides lookup by fully-qualified ID.
 *
 * Type IDs follow the format: `<extensionId>/<typeName>`
 * Constraint IDs follow the format: `<extensionId>/<constraintName>`
 * Annotation IDs follow the format: `<extensionId>/<annotationName>`
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
   * Look up a custom constraint registration by its fully-qualified constraint ID.
   *
   * @param constraintId - The fully-qualified constraint ID.
   * @returns The registration if found, otherwise `undefined`.
   */
  findConstraint(constraintId: string): CustomConstraintRegistration | undefined;
  /**
   * Look up a TSDoc custom constraint-tag registration by tag name.
   */
  findConstraintTag(tagName: string): {
    readonly extensionId: string;
    readonly registration: ConstraintTagRegistration;
  } | undefined;
  /**
   * Look up built-in tag broadening for a given custom type ID.
   */
  findBuiltinConstraintBroadening(
    typeId: string,
    tagName: string
  ): {
    readonly extensionId: string;
    readonly registration: BuiltinConstraintBroadeningRegistration;
  } | undefined;

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
 */
export function createExtensionRegistry(
  extensions: readonly ExtensionDefinition[]
): ExtensionRegistry {
  const typeMap = new Map<string, CustomTypeRegistration>();
  const typeNameMap = new Map<
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
        if (constraintTagMap.has(tag.tagName)) {
          throw new Error(`Duplicate custom constraint tag: "@${tag.tagName}"`);
        }
        constraintTagMap.set(tag.tagName, {
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
  }

  return {
    extensions,
    findType: (typeId: string) => typeMap.get(typeId),
    findTypeByName: (typeName: string) => typeNameMap.get(typeName),
    findConstraint: (constraintId: string) => constraintMap.get(constraintId),
    findConstraintTag: (tagName: string) => constraintTagMap.get(tagName),
    findBuiltinConstraintBroadening: (typeId: string, tagName: string) =>
      builtinBroadeningMap.get(`${typeId}:${tagName}`),
    findAnnotation: (annotationId: string) => annotationMap.get(annotationId),
  };
}
