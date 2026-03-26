/**
 * Mixed-authoring schema generator.
 *
 * Composes a statically analyzed TSDoc/class/interface/type-alias model with
 * ChainDSL-authored field overlays. The static model remains authoritative for
 * structure and constraints; overlays may add runtime field behavior such as
 * dynamic enum or dynamic schema metadata.
 */

import type {
  AnnotationNode,
  AnyField,
  FieldNode,
  FormIRElement,
  FormSpec,
  TypeNode,
} from "@formspec/core";
import type { GenerateJsonSchemaFromIROptions, JsonSchema2020 } from "../json-schema/ir-generator.js";
import { generateJsonSchemaFromIR } from "../json-schema/ir-generator.js";
import { generateUiSchemaFromIR } from "../ui-schema/ir-generator.js";
import type { UISchema } from "../ui-schema/types.js";
import { canonicalizeChainDSL, canonicalizeTSDoc, type TSDocSource } from "../canonicalize/index.js";
import { createProgramContext, findClassByName, findInterfaceByName, findTypeAliasByName } from "../analyzer/program.js";
import {
  analyzeClassToIR,
  analyzeInterfaceToIR,
  analyzeTypeAliasToIR,
  type IRClassAnalysis,
} from "../analyzer/class-analyzer.js";

/**
 * Result of generating schemas from a mixed-authoring composition.
 */
export interface MixedAuthoringSchemas {
  /** JSON Schema 2020-12 for validation. */
  readonly jsonSchema: JsonSchema2020;
  /** JSON Forms UI Schema for rendering. */
  readonly uiSchema: UISchema;
}

/**
 * Options for generating mixed-authoring schemas.
 *
 * The `typeName` can resolve to a class, interface, or object type alias, just
 * like `generateSchemas()`.
 */
export interface BuildMixedAuthoringSchemasOptions extends GenerateJsonSchemaFromIROptions {
  /** Path to the TypeScript source file. */
  readonly filePath: string;
  /** Name of the class, interface, or type alias to analyze. */
  readonly typeName: string;
  /** ChainDSL field overlays to apply to the static model. */
  readonly overlays: FormSpec<readonly AnyField[]>;
}

/**
 * Builds JSON Schema and UI Schema from a TSDoc-derived model with ChainDSL
 * field overlays.
 *
 * Overlays are matched by field name. The static model wins for structure,
 * ordering, and constraints; ChainDSL overlays may contribute dynamic runtime
 * field metadata such as dynamic enum or dynamic schema keywords, and may fill
 * in missing annotations.
 */
export function buildMixedAuthoringSchemas(
  options: BuildMixedAuthoringSchemasOptions
): MixedAuthoringSchemas {
  const { filePath, typeName, overlays, ...schemaOptions } = options;
  const analysis = analyzeNamedType(filePath, typeName);
  const composedAnalysis = composeAnalysisWithOverlays(analysis, overlays);
  const ir = canonicalizeTSDoc(composedAnalysis, { file: filePath });

  return {
    jsonSchema: generateJsonSchemaFromIR(ir, schemaOptions),
    uiSchema: generateUiSchemaFromIR(ir),
  };
}

function analyzeNamedType(filePath: string, typeName: string): IRClassAnalysis {
  const ctx = createProgramContext(filePath);
  const source: TSDocSource = { file: filePath };

  const classDecl = findClassByName(ctx.sourceFile, typeName);
  if (classDecl !== null) {
    return analyzeClassToIR(classDecl, ctx.checker, source.file);
  }

  const interfaceDecl = findInterfaceByName(ctx.sourceFile, typeName);
  if (interfaceDecl !== null) {
    return analyzeInterfaceToIR(interfaceDecl, ctx.checker, source.file);
  }

  const typeAlias = findTypeAliasByName(ctx.sourceFile, typeName);
  if (typeAlias !== null) {
    const result = analyzeTypeAliasToIR(typeAlias, ctx.checker, source.file);
    if (result.ok) {
      return result.analysis;
    }
    throw new Error(result.error);
  }

  throw new Error(
    `Type "${typeName}" not found as a class, interface, or type alias in ${filePath}`
  );
}

function composeAnalysisWithOverlays(
  analysis: IRClassAnalysis,
  overlays: FormSpec<readonly AnyField[]>
): IRClassAnalysis {
  const overlayIR = canonicalizeChainDSL(overlays);
  const overlayFields = collectOverlayFields(overlayIR.elements);

  if (overlayFields.length === 0) {
    return analysis;
  }

  const overlayByName = new Map<string, FieldNode>();
  for (const field of overlayFields) {
    if (overlayByName.has(field.name)) {
      throw new Error(`Mixed-authoring overlays define "${field.name}" more than once`);
    }
    overlayByName.set(field.name, field);
  }

  const mergedFields: FieldNode[] = [];

  for (const baseField of analysis.fields) {
    const overlayField = overlayByName.get(baseField.name);
    if (overlayField === undefined) {
      mergedFields.push(baseField);
      continue;
    }

    mergedFields.push(mergeFieldOverlay(baseField, overlayField));
    overlayByName.delete(baseField.name);
  }

  if (overlayByName.size > 0) {
    const unknownFields = [...overlayByName.keys()].sort().join(", ");
    throw new Error(
      `Mixed-authoring overlays reference fields that are not present in the static model: ${unknownFields}`
    );
  }

  return {
    ...analysis,
    fields: mergedFields,
  };
}

function collectOverlayFields(elements: readonly FormIRElement[]): FieldNode[] {
  const fields: FieldNode[] = [];

  for (const element of elements) {
    switch (element.kind) {
      case "field":
        fields.push(element);
        break;
      case "group":
        fields.push(...collectOverlayFields(element.elements));
        break;
      case "conditional":
        fields.push(...collectOverlayFields(element.elements));
        break;
      default: {
        const _exhaustive: never = element;
        void _exhaustive;
      }
    }
  }

  return fields;
}

function mergeFieldOverlay(baseField: FieldNode, overlayField: FieldNode): FieldNode {
  return {
    ...baseField,
    type: mergeFieldType(baseField.type, overlayField.type),
    annotations: mergeAnnotations(baseField.annotations, overlayField.annotations),
  };
}

function mergeFieldType(baseType: TypeNode, overlayType: TypeNode): TypeNode {
  if (overlayType.kind === "dynamic") {
    return overlayType;
  }

  return baseType;
}

function mergeAnnotations(
  baseAnnotations: readonly AnnotationNode[],
  overlayAnnotations: readonly AnnotationNode[]
): AnnotationNode[] {
  const baseKeys = new Set(baseAnnotations.map(annotationKey));
  const overlayOnly = overlayAnnotations.filter((annotation) => !baseKeys.has(annotationKey(annotation)));
  return [...overlayOnly, ...baseAnnotations];
}

function annotationKey(annotation: AnnotationNode): string {
  return annotation.annotationKind === "custom"
    ? `${annotation.annotationKind}:${annotation.annotationId}`
    : annotation.annotationKind;
}
