/**
 * TSDoc canonicalizer — assembles an {@link IRClassAnalysis} into a canonical
 * {@link FormIR}, applying layout metadata from `@Group` and `@ShowWhen`
 * decorators.
 *
 * The analysis functions in `class-analyzer.ts` produce `FieldNode[]`,
 * `fieldLayouts`, and `typeRegistry` directly. This canonicalizer uses
 * the layout metadata to wrap fields in `GroupLayoutNode` and
 * `ConditionalLayoutNode` elements.
 */

import type {
  FormIR,
  FormIRElement,
  FieldNode,
  GroupLayoutNode,
  ConditionalLayoutNode,
  Provenance,
} from "@formspec/core";
import { IR_VERSION } from "@formspec/core";
import type { IRClassAnalysis, FieldLayoutMetadata } from "../analyzer/class-analyzer.js";

/**
 * Source-level metadata for provenance tracking.
 */
export interface TSDocSource {
  /** Absolute path to the source file. */
  readonly file: string;
}

/**
 * Wraps an {@link IRClassAnalysis} (from `analyzeClassToIR`,
 * `analyzeInterfaceToIR`, or `analyzeTypeAliasToIR`) into a canonical
 * {@link FormIR}.
 *
 * Fields with `@Group` decorators are grouped into `GroupLayoutNode` elements.
 * Fields with `@ShowWhen` decorators are wrapped in `ConditionalLayoutNode` elements.
 * When both are present, the conditional wraps the field inside the group.
 *
 * @param analysis - IR analysis result (fields are already FieldNode[])
 * @param source - Optional source file metadata for provenance
 * @returns The canonical FormIR
 */
export function canonicalizeTSDoc(analysis: IRClassAnalysis, source?: TSDocSource): FormIR {
  const file = source?.file ?? "";

  const provenance: Provenance = {
    surface: "tsdoc",
    file,
    line: 1,
    column: 0,
  };

  const elements = assembleElements(analysis.fields, analysis.fieldLayouts, provenance);

  return {
    kind: "form-ir",
    irVersion: IR_VERSION,
    elements,
    typeRegistry: analysis.typeRegistry,
    provenance,
  };
}

/**
 * Assembles flat fields and their layout metadata into a tree of
 * `FormIRElement[]` with groups and conditionals.
 *
 * Fields are processed in order. Consecutive fields with the same
 * `@Group` label are collected into a single `GroupLayoutNode`.
 * Fields with `@ShowWhen` are wrapped in `ConditionalLayoutNode`.
 */
function assembleElements(
  fields: readonly FieldNode[],
  layouts: readonly FieldLayoutMetadata[],
  provenance: Provenance
): readonly FormIRElement[] {
  const elements: FormIRElement[] = [];

  // Group consecutive fields with the same group label together.
  // We use an ordered map to preserve insertion order of groups.
  const groupMap = new Map<string, FormIRElement[]>();
  const topLevelOrder: (
    | { type: "group"; label: string }
    | { type: "element"; element: FormIRElement }
  )[] = [];

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const layout = layouts[i];
    if (!field || !layout) continue;

    // Wrap in conditional if @ShowWhen is present
    const element = wrapInConditional(field, layout, provenance);

    if (layout.groupLabel !== undefined) {
      const label = layout.groupLabel;
      let groupElements = groupMap.get(label);
      if (!groupElements) {
        groupElements = [];
        groupMap.set(label, groupElements);
        topLevelOrder.push({ type: "group", label });
      }
      groupElements.push(element);
    } else {
      topLevelOrder.push({ type: "element", element });
    }
  }

  // Assemble the final element array in order
  for (const entry of topLevelOrder) {
    if (entry.type === "group") {
      const groupElements = groupMap.get(entry.label);
      if (groupElements) {
        const groupNode: GroupLayoutNode = {
          kind: "group",
          label: entry.label,
          elements: groupElements,
          provenance,
        };
        elements.push(groupNode);
        // Clear so duplicate group labels in topLevelOrder don't re-emit
        groupMap.delete(entry.label);
      }
    } else {
      elements.push(entry.element);
    }
  }

  return elements;
}

/**
 * Wraps a field in a `ConditionalLayoutNode` if the layout has `showWhen` metadata.
 */
function wrapInConditional(
  field: FieldNode,
  layout: FieldLayoutMetadata,
  provenance: Provenance
): FormIRElement {
  if (layout.showWhen === undefined) {
    return field;
  }

  const conditional: ConditionalLayoutNode = {
    kind: "conditional",
    fieldName: layout.showWhen.field,
    value: layout.showWhen.value,
    elements: [field],
    provenance,
  };

  return conditional;
}
