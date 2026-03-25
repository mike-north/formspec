/**
 * Class schema generator.
 *
 * Generates JSON Schema and FormSpec/UI Schema from statically analyzed
 * class fields and decorators.
 */

import * as ts from "typescript";
import type { ClassAnalysis, FieldInfo } from "../analyzer/class-analyzer.js";
import {
  convertType,
  applyDecoratorsToSchema,
  createFormSpecField,
  DefsRegistry,
  type JsonSchema,
  type FormSpecField,
} from "../analyzer/type-converter.js";
import type { CommentTagInfo } from "../analyzer/comment-tag-extractor.js";
import { resolveTypeConstraints, type AliasChainEntry } from "../analyzer/constraint-resolver.js";
import { validateConstraints, type ConstraintViolation } from "../analyzer/constraint-validator.js";
import { checkTypeApplicability } from "../analyzer/type-applicability.js";

/**
 * Generated schemas for a class.
 */
export interface ClassSchemas {
  /** JSON Schema for validation */
  jsonSchema: JsonSchema;
  /** FormSpec/UI Schema for rendering */
  uxSpec: {
    elements: FormSpecField[];
  };
  /** Constraint violations found during schema generation */
  diagnostics: ConstraintViolation[];
}

/**
 * Describes how a TSDoc tag maps to JSON Schema and FormSpec field properties.
 */
export interface TagMapping {
  /** JSON Schema property name (e.g., "minimum", "title") */
  jsonSchemaKey?: string;
  /** FormSpec field property name (e.g., "min", "label") */
  formSpecKey?: string;
  /** Extension keyword for vendor-specific keywords (e.g., "x-formspec-maxSigFig") */
  extensionKey?: string;
  /** Value type expected from the tag */
  valueType: "number" | "string" | "boolean" | "bare";
}

/**
 * Mapping table from TSDoc tag names to their JSON Schema and FormSpec targets.
 */
export const TAG_MAPPINGS: Record<string, TagMapping> = {
  minimum: { jsonSchemaKey: "minimum", formSpecKey: "min", valueType: "number" },
  maximum: { jsonSchemaKey: "maximum", formSpecKey: "max", valueType: "number" },
  exclusiveMinimum: { jsonSchemaKey: "exclusiveMinimum", valueType: "number" },
  exclusiveMaximum: { jsonSchemaKey: "exclusiveMaximum", valueType: "number" },
  multipleOf: { jsonSchemaKey: "multipleOf", valueType: "number" },
  minLength: { jsonSchemaKey: "minLength", formSpecKey: "minLength", valueType: "number" },
  maxLength: { jsonSchemaKey: "maxLength", formSpecKey: "maxLength", valueType: "number" },
  pattern: { jsonSchemaKey: "pattern", formSpecKey: "pattern", valueType: "string" },
  minItems: { jsonSchemaKey: "minItems", formSpecKey: "minItems", valueType: "number" },
  maxItems: { jsonSchemaKey: "maxItems", formSpecKey: "maxItems", valueType: "number" },
  uniqueItems: { jsonSchemaKey: "uniqueItems", valueType: "bare" },
  displayName: { jsonSchemaKey: "title", formSpecKey: "label", valueType: "string" },
  description: { jsonSchemaKey: "description", formSpecKey: "description", valueType: "string" },
  defaultValue: { jsonSchemaKey: "default", valueType: "string" },
  deprecated: { jsonSchemaKey: "deprecated", valueType: "bare" },
  const: { jsonSchemaKey: "const", valueType: "string" },
  format: { jsonSchemaKey: "format", valueType: "string" },
  placeholder: { formSpecKey: "placeholder", valueType: "string" },
  group: { formSpecKey: "group", valueType: "string" },
  order: { formSpecKey: "order", valueType: "number" },
  maxSigFig: { extensionKey: "x-formspec-maxSigFig", valueType: "number" },
  maxDecimalPlaces: { extensionKey: "x-formspec-maxDecimalPlaces", valueType: "number" },
  // Note: @remarks and @example are handled specially in applyCommentTagsToSchema,
  // not through TAG_MAPPINGS. @remarks is a fallback for @description (only applied
  // if no explicit @description is present). @example values are collected into an array.
};


/**
 * Generates JSON Schema and FormSpec from a class analysis.
 *
 * Uses static type information and decorator metadata to build
 * complete schema definitions for a class's fields.
 *
 * @param analysis - The class analysis result
 * @param checker - TypeScript type checker
 * @returns Generated JSON Schema and FormSpec
 */
export function generateClassSchemas(
  analysis: ClassAnalysis,
  checker: ts.TypeChecker
): ClassSchemas {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  const uxElements: FormSpecField[] = [];
  const defsRegistry = new DefsRegistry();
  const allDiagnostics: ConstraintViolation[] = [];

  for (const field of analysis.fields) {
    // Resolve constraints from type alias chain — also returns aliasChain for
    // allOf + $ref composition, and diagnostics for broadening violations.
    const {
      tags: typeAliasTags,
      diagnostics: resolverDiagnostics,
      aliasChain,
    } = resolveTypeConstraints(field.name, field.typeNode, checker);

    // Surface broadening diagnostics (already include fieldName from the resolver)
    allDiagnostics.push(...resolverDiagnostics);

    // Determine whether this field uses a constrained type alias chain.
    // If so, register each alias in $defs and use $ref/$allOf for the field.
    const constrainedAliasChain = aliasChain.filter((e) => e.tags.length > 0);
    const hasConstrainedAlias = constrainedAliasChain.length > 0;

    // All comment tags for this field (alias chain + field-level)
    // Used for type applicability checking and UX schema generation.
    const allCommentTags: CommentTagInfo[] = [...typeAliasTags, ...field.commentTags];

    let fieldSchema: JsonSchema;

    if (hasConstrainedAlias) {
      // Register the alias chain in $defs (root-first)
      registerAliasChainInDefs(aliasChain, field.type, checker, defsRegistry);

      // The leaf alias is the first entry (aliasChain is leaf-first).
      // aliasChain is non-empty here because hasConstrainedAlias is true,
      // which requires constrainedAliasChain.length > 0, which requires aliasChain.length > 0.
      const leafAlias = aliasChain[0];
      if (!leafAlias)
        throw new Error(
          "Invariant violation: aliasChain is empty despite hasConstrainedAlias being true"
        );

      // Apply any decorator constraints
      const decoratorSchema = applyDecoratorsToSchema({}, field.decorators);
      const hasDecoratorConstraints = Object.keys(decoratorSchema).length > 0;
      const hasFieldCommentConstraints = field.commentTags.length > 0;

      if (hasFieldCommentConstraints || hasDecoratorConstraints) {
        // Field adds its own constraints on top of the alias — wrap in allOf
        const useSiteSchema = applyCommentTagsToSchema(decoratorSchema, field.commentTags);
        fieldSchema = {
          allOf: [{ $ref: `#/$defs/${leafAlias.name}` }, useSiteSchema],
        };
      } else {
        // Field has no additional constraints — plain $ref
        fieldSchema = { $ref: `#/$defs/${leafAlias.name}` };
      }
    } else {
      // No constrained alias — use the existing flat approach
      const { jsonSchema: baseSchema } = convertType(field.type, checker, defsRegistry);
      const withDecorators = applyDecoratorsToSchema(baseSchema, field.decorators);
      fieldSchema = applyCommentTagsToSchema(withDecorators, allCommentTags);
    }

    properties[field.name] = fieldSchema;

    // Check type applicability — verify tags match the field's TypeScript type
    const applicabilityViolations = checkTypeApplicability(
      field.name,
      field.type,
      allCommentTags,
      checker
    );
    allDiagnostics.push(...applicabilityViolations);

    // Validate merged constraints for contradictions
    const violations = validateConstraints(field.name, fieldSchema);
    allDiagnostics.push(...violations);

    // Track required fields
    if (!field.optional) {
      required.push(field.name);
    }

    // Generate FormSpec field — UI schema always inlines nested fields.
    // The UX schema uses all resolved constraint values (alias chain + field-level).
    const formSpecField = createFormSpecField(
      field.name,
      field.type,
      field.decorators,
      field.optional,
      checker
    );
    applyCommentTagsToFormSpecField(formSpecField, allCommentTags);
    resolveConditionValueTypes(formSpecField, analysis, checker);
    uxElements.push(formSpecField);
  }

  // Surface any $defs name-collision warnings from the registry as diagnostics.
  for (const warning of defsRegistry.warnings) {
    allDiagnostics.push({
      fieldName: "(type-system)",
      severity: "warning",
      message: warning,
    });
  }

  // Build complete JSON Schema, including $defs if any named types were found
  const jsonSchema: JsonSchema = {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    ...(defsRegistry.size > 0 ? { $defs: defsRegistry.toObject() } : {}),
  };

  // Build FormSpec/UI Schema
  const uxSpec = {
    elements: uxElements,
  };

  return { jsonSchema, uxSpec, diagnostics: allDiagnostics };
}

/**
 * Generates JSON Schema for a single field.
 *
 * Useful for generating schemas for method return types
 * or individual field extraction.
 *
 * @param field - The field information
 * @param checker - TypeScript type checker
 * @returns JSON Schema for the field's type
 */
export function generateFieldSchema(field: FieldInfo, checker: ts.TypeChecker): JsonSchema {
  const { jsonSchema: baseSchema } = convertType(field.type, checker);
  return applyDecoratorsToSchema(baseSchema, field.decorators);
}

/**
 * Registers all constrained type aliases in a chain as $defs entries.
 *
 * The chain is expected in leaf-first order (as returned by resolveTypeConstraints).
 * This function processes from root to leaf so that parent $defs entries exist
 * before a child alias references them via $ref.
 *
 * Root aliases (no parent alias) get: `{ type: "<base>", ...constraints }`
 * Derived aliases (has parent alias) get: `{ allOf: [{ $ref: "#/$defs/<parent>" }, constraints] }`
 *
 * Aliases without constraints are only registered if they appear as a parent
 * of a constrained alias (to keep the $ref chain intact).
 */
function registerAliasChainInDefs(
  aliasChain: AliasChainEntry[],
  fieldType: ts.Type,
  checker: ts.TypeChecker,
  defsRegistry: DefsRegistry
): void {
  // aliasChain is leaf-first; process root-first to register parents before children
  const rootFirst = [...aliasChain].reverse();

  for (const entry of rootFirst) {
    if (defsRegistry.has(entry.name)) continue;

    if (entry.parentName !== undefined && defsRegistry.has(entry.parentName)) {
      // This alias has a registered parent — use allOf + $ref
      if (entry.tags.length > 0) {
        const constraintSchema = applyCommentTagsToSchema({}, entry.tags);
        defsRegistry.set(entry.name, {
          allOf: [{ $ref: `#/$defs/${entry.parentName}` }, constraintSchema],
        });
      } else {
        // Plain alias with no own constraints but a named parent — just $ref
        defsRegistry.set(entry.name, { $ref: `#/$defs/${entry.parentName}` });
      }
    } else {
      // Root of chain (parent is a primitive or no registered parent alias)
      if (entry.tags.length > 0) {
        // Derive the base type schema from the TypeScript type of the field
        const { jsonSchema: baseSchema } = convertType(fieldType, checker);
        const constrained = applyCommentTagsToSchema({ ...baseSchema }, entry.tags);
        defsRegistry.set(entry.name, constrained);
      }
      // Aliases with no tags and no named parent don't need a $defs entry
    }
  }
}

/**
 * Applies TSDoc comment tag constraints to a JSON Schema using TAG_MAPPINGS.
 */
function applyCommentTagsToSchema(schema: JsonSchema, commentTags: CommentTagInfo[]): JsonSchema {
  const result: Record<string, unknown> = { ...schema };
  const examples: unknown[] = [];

  for (const tag of commentTags) {
    // Collect @example values into an array (JSON Schema "examples")
    if (tag.tagName === "example" && tag.value !== undefined) {
      examples.push(tag.value);
      continue;
    }

    // @remarks is a fallback for @description — only apply if no @description present
    if (tag.tagName === "remarks" && typeof tag.value === "string") {
      if (result["description"] === undefined) {
        result["description"] = tag.value;
      }
      continue;
    }

    const mapping = TAG_MAPPINGS[tag.tagName];
    if (!mapping) continue;

    if (mapping.jsonSchemaKey) {
      if (mapping.valueType === "bare") {
        result[mapping.jsonSchemaKey] = true;
      } else if (tag.value !== undefined) {
        const valueTypeMatches =
          mapping.valueType === "number"
            ? typeof tag.value === "number"
            : mapping.valueType === "string"
              ? typeof tag.value === "string"
              : typeof tag.value === "boolean";
        if (valueTypeMatches || tag.tagName === "defaultValue" || tag.tagName === "const") {
          result[mapping.jsonSchemaKey] = tag.value;
        }
      }
    }

    if (mapping.extensionKey !== undefined && typeof tag.value === "number") {
      result[mapping.extensionKey] = tag.value;
    }
  }

  // Emit collected examples
  if (examples.length > 0) {
    result["examples"] = examples;
  }

  return result as JsonSchema;
}

/**
 * Applies TSDoc comment tag constraints to a FormSpec field using TAG_MAPPINGS.
 *
 * Note: showWhen and hideWhen are compound-value tags that cannot be expressed
 * in the simple TAG_MAPPINGS table; they are handled separately.
 */
function applyCommentTagsToFormSpecField(
  field: FormSpecField,
  commentTags: CommentTagInfo[]
): void {
  const fieldRecord = field as unknown as Record<string, unknown>;

  for (const tag of commentTags) {
    const mapping = TAG_MAPPINGS[tag.tagName];
    if (mapping?.formSpecKey) {
      if (mapping.valueType === "bare") continue;
      // After the bare-guard, mapping.valueType is narrowed to "number" | "string" | "boolean"
      const valueTypeMatches = typeof tag.value === mapping.valueType;
      if (valueTypeMatches) {
        fieldRecord[mapping.formSpecKey] = tag.value;
      }
    }
  }

  for (const tag of commentTags) {
    if (tag.tagName === "showWhen" || tag.tagName === "hideWhen") {
      if (typeof tag.value !== "string") continue;
      const spaceIdx = tag.value.indexOf(" ");
      if (spaceIdx <= 0) continue;
      const parsed = {
        field: tag.value.substring(0, spaceIdx),
        value: tag.value.substring(spaceIdx + 1),
      };
      if (tag.tagName === "showWhen") field.showWhen = parsed;
      else field.hideWhen = parsed;
    }
  }
}

/**
 * Resolves the TypeScript type of a field by name from a ClassAnalysis.
 *
 * @param fieldName - The field name to look up
 * @param analysis - The class analysis containing all fields
 * @returns The resolved TypeScript type, or undefined if the field is not found
 */
function resolveFieldType(
  fieldName: string,
  analysis: ClassAnalysis
): ts.Type | undefined {
  const field = analysis.fields.find((f) => f.name === fieldName);
  return field?.type;
}

/**
 * Parses a showWhen/hideWhen condition value to match the TypeScript type of the
 * referenced target field.
 *
 * - boolean field → parse "true"/"false" to boolean
 * - number field → parse via Number()
 * - string / string-literal-union field → keep as string
 * - unresolvable field (targetFieldType is undefined) → keep as string
 *
 * @param rawValue - The raw string value from the TSDoc tag
 * @param targetFieldType - The resolved TypeScript type of the referenced field
 * @returns The parsed value with the appropriate JavaScript type
 */
function parseConditionValue(
  rawValue: string,
  targetFieldType: ts.Type | undefined
): unknown {
  if (!targetFieldType) return rawValue;

  // Strip null/undefined from unions to get the effective non-nullable types.
  // For `boolean | null` TypeScript emits `true | false | null` (3 members).
  // We must perform all type checks on the stripped set, not on the original
  // union, so that nullable variants are handled identically to their non-
  // nullable counterparts.
  let effectiveType = targetFieldType;
  let nonNullTypes: ts.Type[] | undefined;
  if (targetFieldType.isUnion()) {
    nonNullTypes = targetFieldType.types.filter(
      (t) => !(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
    );
    if (nonNullTypes.length === 1 && nonNullTypes[0] !== undefined) {
      // Single non-null type — unwrap to a scalar for the checks below.
      effectiveType = nonNullTypes[0];
    }
    // NOTE: if nonNullTypes.length > 1 (e.g. true | false after stripping null),
    // we do NOT set effectiveType — instead we check nonNullTypes directly below.
  }

  // Boolean (intrinsic boolean type or a BooleanLiteral after unwrapping)
  if (
    effectiveType.flags & ts.TypeFlags.Boolean ||
    effectiveType.flags & ts.TypeFlags.BooleanLiteral
  ) {
    if (rawValue === "true") return true;
    if (rawValue === "false") return false;
    return rawValue;
  }

  // Boolean expressed as a union of true | false — check the non-null filtered
  // types so that `boolean | null` (true | false | null after stripping → [true, false])
  // is correctly identified as boolean, not left as the 3-member original union.
  const typesToCheck = nonNullTypes ?? (effectiveType.isUnion() ? effectiveType.types : undefined);
  if (typesToCheck !== undefined) {
    const isBooleanUnion =
      typesToCheck.length === 2 &&
      typesToCheck.every((t) => Boolean(t.flags & ts.TypeFlags.BooleanLiteral));
    if (isBooleanUnion) {
      if (rawValue === "true") return true;
      if (rawValue === "false") return false;
      return rawValue;
    }
  }

  // Number (intrinsic number type or NumberLiteral after unwrapping)
  if (
    effectiveType.flags & ts.TypeFlags.Number ||
    effectiveType.flags & ts.TypeFlags.NumberLiteral
  ) {
    const num = Number(rawValue);
    if (Number.isFinite(num)) return num;
    return rawValue;
  }

  // Number literal union — check non-null filtered types
  if (typesToCheck !== undefined) {
    const allNumbers =
      typesToCheck.length > 0 &&
      typesToCheck.every((t) => Boolean(t.flags & ts.TypeFlags.NumberLiteral));
    if (allNumbers) {
      const num = Number(rawValue);
      if (Number.isFinite(num)) return num;
    }
  }

  // String / string-literal union → keep as string
  return rawValue;
}

/**
 * Post-processes showWhen/hideWhen on a FormSpec field to apply type-aware value
 * parsing based on the referenced field's TypeScript type.
 *
 * Must be called after applyCommentTagsToFormSpecField so that showWhen/hideWhen
 * have already been populated with their raw string values.
 *
 * @param field - The FormSpec field whose showWhen/hideWhen to post-process
 * @param analysis - The class analysis used to look up referenced field types
 * @param checker - TypeScript type checker (passed for symmetry with surrounding API)
 */
function resolveConditionValueTypes(
  field: FormSpecField,
  analysis: ClassAnalysis,
  _checker: ts.TypeChecker
): void {
  if (field.showWhen !== undefined) {
    const targetType = resolveFieldType(field.showWhen.field, analysis);
    field.showWhen = {
      field: field.showWhen.field,
      value: parseConditionValue(String(field.showWhen.value), targetType),
    };
  }
  if (field.hideWhen !== undefined) {
    const targetType = resolveFieldType(field.hideWhen.field, analysis);
    field.hideWhen = {
      field: field.hideWhen.field,
      value: parseConditionValue(String(field.hideWhen.value), targetType),
    };
  }
}
