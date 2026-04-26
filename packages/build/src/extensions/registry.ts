/**
 * Extension registry for resolving custom types, constraints, and annotations
 * during JSON Schema generation and IR validation.
 *
 * The registry is created from a list of {@link ExtensionDefinition} objects
 * and provides O(1) lookup by fully-qualified ID (extensionId + "/" + name).
 *
 * @packageDocumentation
 */

import type * as ts from "typescript";
import type {
  ExtensionDefinition,
  CustomTypeRegistration,
  CustomConstraintRegistration,
  CustomAnnotationRegistration,
  ConstraintTagRegistration,
  BuiltinConstraintBroadeningRegistration,
} from "@formspec/core/internals";
import {
  BUILTIN_CONSTRAINT_DEFINITIONS,
  normalizeConstraintTagName,
} from "@formspec/core/internals";
import {
  getTagDefinition,
  normalizeFormSpecTagName,
  getRegistryLogger,
  _validateExtensionSetup,
  logSetupDiagnostics,
  type ExtensionTagSource,
  type SetupDiagnostic,
} from "@formspec/analysis/internal";

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * The result of a successful extension type lookup.
 *
 * Returned by {@link ExtensionRegistry.findTypeByName},
 * {@link ExtensionRegistry.findTypeByBrand}, and
 * {@link ExtensionRegistry.findTypeBySymbol}.
 *
 * @public
 */
export interface ExtensionTypeLookupResult {
  /** The fully-qualified extension ID (e.g., "x-stripe/monetary"). */
  readonly extensionId: string;
  /** The custom type registration matched by this lookup. */
  readonly registration: CustomTypeRegistration;
}

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
   * Setup diagnostics detected during registry construction.
   *
   * These diagnostics represent configuration errors in the extension
   * registrations — e.g. unsupported TypeScript built-in type overrides,
   * invalid type-name identifiers, or duplicate registrations. They are
   * computed ONCE at `createExtensionRegistry` call time (§4 Phase 4 Slice C)
   * and carried on the registry so consumers can emit them without re-running
   * the validation on every analysis call.
   *
   * Consumers should check this array at the start of each analysis pass and
   * short-circuit if it is non-empty — the registry is unusable for
   * constraint-type validation when setup diagnostics are present.
   *
   * @internal
   */
  readonly setupDiagnostics: readonly SetupDiagnostic[];

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
  findTypeByName(typeName: string): ExtensionTypeLookupResult | undefined;
  /**
   * Look up a custom type registration by a brand identifier.
   *
   * This is used during class analysis to resolve extension-defined custom types
   * via structural brand detection (`unique symbol` computed property keys).
   * Brand identifiers are stored as plain strings, so they must be unique
   * across all extensions loaded into the registry.
   *
   * @param brand - The identifier text of the `unique symbol` brand variable.
   */
  findTypeByBrand(brand: string): ExtensionTypeLookupResult | undefined;

  /**
   * Look up a custom type by its TypeScript symbol identity.
   *
   * Built from `defineCustomType<T>()` type parameter extraction in the config file.
   * This is the most precise detection path — it uses `ts.Symbol` identity, which is
   * immune to import aliases and name collisions.
   *
   * Returns `undefined` until {@link MutableExtensionRegistry.setSymbolMap} has been
   * called (i.e., before the TypeScript program is available), or when the symbol is
   * not registered via a type parameter.
   *
   * @param symbol - The canonical TypeScript symbol to look up.
   */
  findTypeBySymbol(symbol: ts.Symbol): ExtensionTypeLookupResult | undefined;

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

/**
 * Mutable extension registry used internally by the build pipeline.
 *
 * Extends {@link ExtensionRegistry} with `setSymbolMap`, which must be called
 * after the TypeScript program is created. Consumer code should accept only
 * the read-only {@link ExtensionRegistry} interface.
 *
 * @public
 */
export interface MutableExtensionRegistry extends ExtensionRegistry {
  /**
   * Sets the symbol map built from config AST analysis.
   *
   * Called after the TypeScript program is created and the config file is analyzed.
   * Prior to this call, {@link ExtensionRegistry.findTypeBySymbol} always returns
   * `undefined`.
   *
   * @param map - A map from canonical `ts.Symbol` to the matching registry entry.
   */
  setSymbolMap(map: Map<ts.Symbol, ExtensionTypeLookupResult>): void;
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

const BUILTIN_METADATA_TAGS = new Set(["apiName", "displayName"]);
const RESERVED_UNSUPPORTED_TAGS = new Set(["description"]);

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
    // Include customTypes so _validateExtensionSetup can check tsTypeNames for
    // unsupported built-in overrides and invalid identifier patterns.
    ...(extension.types !== undefined
      ? {
          customTypes: extension.types.map((type) => ({
            // tsTypeNames: deprecated in favour of symbol-based detection, but
            // still required for name-based validation in _validateExtensionSetup
            // until the bridge is fully retired (see §synthetic-checker-retirement §4C).
            tsTypeNames: type.tsTypeNames ?? [type.typeName],
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
): MutableExtensionRegistry {
  // §8.3c — log registry construction at debug so setup-diagnostic emission is
  // observable across repeated calls (e.g. snapshot-driven consumers per §9 #19).
  const registryLog = getRegistryLogger();
  registryLog.debug("createExtensionRegistry: constructing", {
    extensionCount: extensions.length,
    extensionIds: extensions.map((e) => e.extensionId),
  });

  // §4 Phase 4 Slice C — validate extension type-name registrations ONCE at
  // construction time. Consumers pull `registry.setupDiagnostics` at the start
  // of each analysis pass instead of re-running validation per synthetic batch.
  const extensionTagSources = buildConstraintTagSources(extensions);
  const setupDiagnostics = _validateExtensionSetup(extensionTagSources);
  logSetupDiagnostics(registryLog, {
    diagnosticCount: setupDiagnostics.length,
    codes: setupDiagnostics.map((d) => d.kind),
  });

  // extensionTagSources is already computed above for _validateExtensionSetup;
  // reuse it here to avoid a second pass over the extensions array.
  const reservedTagSources = extensionTagSources;
  let symbolMap = new Map<ts.Symbol, ExtensionTypeLookupResult>();
  const typeMap = new Map<string, CustomTypeRegistration>();
  const typeNameMap = new Map<string, ExtensionTypeLookupResult>();
  const brandMap = new Map<string, ExtensionTypeLookupResult>();
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
        if (RESERVED_UNSUPPORTED_TAGS.has(canonicalTagName)) {
          throw new Error(`Extension tag "@${canonicalTagName}" is reserved and unsupported.`);
        }
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
        if (RESERVED_UNSUPPORTED_TAGS.has(canonicalTagName)) {
          throw new Error(`Metadata tag "@${canonicalTagName}" is reserved and unsupported.`);
        }
        if (constraintTagMap.has(canonicalTagName)) {
          throw new Error(
            `Metadata tag "@${canonicalTagName}" conflicts with existing FormSpec tag "@${canonicalTagName}".`
          );
        }
        if (
          Object.hasOwn(
            BUILTIN_CONSTRAINT_DEFINITIONS,
            normalizeConstraintTagName(canonicalTagName)
          )
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

  registryLog.debug("createExtensionRegistry: complete", {
    typeCount: typeMap.size,
    constraintCount: constraintMap.size,
    constraintTagCount: constraintTagMap.size,
    broadeningCount: builtinBroadeningMap.size,
    annotationCount: annotationMap.size,
    metadataSlotCount: metadataSlotMap.size,
    setupDiagnosticCount: setupDiagnostics.length,
  });

  return {
    extensions,
    setupDiagnostics,
    findType: (typeId: string) => typeMap.get(typeId),
    findTypeByName: (typeName: string) => typeNameMap.get(typeName),
    findTypeByBrand: (brand: string) => brandMap.get(brand),
    findTypeBySymbol: (symbol: ts.Symbol) => symbolMap.get(symbol),
    setSymbolMap: (map) => {
      symbolMap = map;
    },
    findConstraint: (constraintId: string) => constraintMap.get(constraintId),
    findConstraintTag: (tagName: string) => constraintTagMap.get(normalizeFormSpecTagName(tagName)),
    findBuiltinConstraintBroadening: (typeId: string, tagName: string) =>
      builtinBroadeningMap.get(`${typeId}:${tagName}`),
    findAnnotation: (annotationId: string) => annotationMap.get(annotationId),
  };
}
