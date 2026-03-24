/**
 * Class schema generator.
 *
 * Generates JSON Schema and FormSpec/UI Schema from statically analyzed
 * class fields and decorators.
 */

import type * as ts from "typescript";
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
import { resolveTypeConstraints } from "../analyzer/constraint-resolver.js";
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
    // Generate JSON Schema for field — pass defsRegistry to lift named types
    const { jsonSchema: baseSchema } = convertType(field.type, checker, defsRegistry);
    // Apply decorator constraints first
    const withDecorators = applyDecoratorsToSchema(baseSchema, field.decorators);

    // Resolve constraints inherited from type alias chain, then merge with
    // field-level comment tags (field tags override type alias tags)
    const { tags: typeAliasTags } = resolveTypeConstraints(field.typeNode, checker);
    const allCommentTags = [...typeAliasTags, ...field.commentTags];

    const fieldSchema = applyCommentTagsToSchema(withDecorators, allCommentTags);
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

    // Generate FormSpec field — UI schema always inlines nested fields
    const formSpecField = createFormSpecField(
      field.name,
      field.type,
      field.decorators,
      field.optional,
      checker
    );
    applyCommentTagsToFormSpecField(formSpecField, allCommentTags);
    uxElements.push(formSpecField);
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
export function generateFieldSchema(
  field: FieldInfo,
  checker: ts.TypeChecker
): JsonSchema {
  const { jsonSchema: baseSchema } = convertType(field.type, checker);
  return applyDecoratorsToSchema(baseSchema, field.decorators);
}

/**
 * Applies TSDoc comment tag constraints to a JSON Schema.
 */
function applyCommentTagsToSchema(
  schema: JsonSchema,
  commentTags: CommentTagInfo[]
): JsonSchema {
  const result = { ...schema };

  for (const tag of commentTags) {
    switch (tag.tagName) {
      // Numeric constraints
      case "minimum":
        if (typeof tag.value === "number") result.minimum = tag.value;
        break;
      case "maximum":
        if (typeof tag.value === "number") result.maximum = tag.value;
        break;
      case "exclusiveMinimum":
        if (typeof tag.value === "number") result.exclusiveMinimum = tag.value;
        break;
      case "exclusiveMaximum":
        if (typeof tag.value === "number") result.exclusiveMaximum = tag.value;
        break;
      case "multipleOf":
        if (typeof tag.value === "number") result.multipleOf = tag.value;
        break;

      // String constraints
      case "minLength":
        if (typeof tag.value === "number") result.minLength = tag.value;
        break;
      case "maxLength":
        if (typeof tag.value === "number") result.maxLength = tag.value;
        break;
      case "pattern":
        if (typeof tag.value === "string") result.pattern = tag.value;
        break;

      // Array constraints
      case "minItems":
        if (typeof tag.value === "number") result.minItems = tag.value;
        break;
      case "maxItems":
        if (typeof tag.value === "number") result.maxItems = tag.value;
        break;
      case "uniqueItems":
        result.uniqueItems = true;
        break;

      // Annotations
      case "displayName":
        if (typeof tag.value === "string") result.title = tag.value;
        break;
      case "description":
        if (typeof tag.value === "string") result.description = tag.value;
        break;
      case "defaultValue":
        if (tag.value !== undefined) result.default = tag.value;
        break;
      case "deprecated":
        result.deprecated = true;
        break;
      case "const":
        if (tag.value !== undefined) result.const = tag.value;
        break;
      case "format":
        if (typeof tag.value === "string") result.format = tag.value;
        break;
      case "maxSigFig":
        if (typeof tag.value === "number") {
          (result as Record<string, unknown>)["x-formspec-maxSigFig"] = tag.value;
        }
        break;
      case "maxDecimalPlaces":
        if (typeof tag.value === "number") {
          (result as Record<string, unknown>)["x-formspec-maxDecimalPlaces"] = tag.value;
        }
        break;
    }
  }

  return result;
}

/**
 * Applies TSDoc comment tag constraints to a FormSpec field.
 */
function applyCommentTagsToFormSpecField(
  field: FormSpecField,
  commentTags: CommentTagInfo[]
): void {
  for (const tag of commentTags) {
    switch (tag.tagName) {
      case "displayName":
        if (typeof tag.value === "string") field.label = tag.value;
        break;
      case "description":
        if (typeof tag.value === "string") field.description = tag.value;
        break;
      case "minimum":
        if (typeof tag.value === "number") field.min = tag.value;
        break;
      case "maximum":
        if (typeof tag.value === "number") field.max = tag.value;
        break;
      case "minLength":
        if (typeof tag.value === "number") field.minLength = tag.value;
        break;
      case "maxLength":
        if (typeof tag.value === "number") field.maxLength = tag.value;
        break;
      case "minItems":
        if (typeof tag.value === "number") field.minItems = tag.value;
        break;
      case "maxItems":
        if (typeof tag.value === "number") field.maxItems = tag.value;
        break;
      case "pattern":
        if (typeof tag.value === "string") field.pattern = tag.value;
        break;
      case "placeholder":
        if (typeof tag.value === "string") field.placeholder = tag.value;
        break;
      case "group":
        if (typeof tag.value === "string") field.group = tag.value;
        break;
      case "order":
        if (typeof tag.value === "number") field.order = tag.value;
        break;
      case "showWhen": {
        if (typeof tag.value === "string") {
          const spaceIdx = tag.value.indexOf(" ");
          if (spaceIdx > 0) {
            field.showWhen = {
              field: tag.value.substring(0, spaceIdx),
              value: tag.value.substring(spaceIdx + 1),
            };
          }
        }
        break;
      }
      case "hideWhen": {
        if (typeof tag.value === "string") {
          const spaceIdx = tag.value.indexOf(" ");
          if (spaceIdx > 0) {
            field.hideWhen = {
              field: tag.value.substring(0, spaceIdx),
              value: tag.value.substring(spaceIdx + 1),
            };
          }
        }
        break;
      }
    }
  }
}
