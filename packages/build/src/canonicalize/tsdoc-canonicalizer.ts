/**
 * TSDoc canonicalizer — thin wrapper that assembles an {@link IRClassAnalysis}
 * into a canonical {@link FormIR}.
 *
 * The analysis functions in `class-analyzer.ts` already produce `FieldNode[]`
 * and `typeRegistry` directly, so this wrapper adds only the top-level FormIR
 * envelope and provenance.
 */

import type { FormIR, Provenance } from "@formspec/core";
import { IR_VERSION } from "@formspec/core";
import type { IRClassAnalysis } from "../analyzer/class-analyzer.js";

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
 * @param analysis - IR analysis result (fields are already FieldNode[])
 * @param source - Optional source file metadata for provenance
 * @returns The canonical FormIR
 */
export function canonicalizeTSDoc(
  analysis: IRClassAnalysis,
  source?: TSDocSource
): FormIR {
  const file = source?.file ?? "";

  const provenance: Provenance = {
    surface: "tsdoc",
    file,
    line: 1,
    column: 0,
  };

  return {
    kind: "form-ir",
    irVersion: IR_VERSION,
    elements: analysis.fields,
    typeRegistry: analysis.typeRegistry,
    provenance,
  };
}
