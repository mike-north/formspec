import type {
  FormSpecAnalysisDiagnostic,
  FormSpecAnalysisDiagnosticDataValue,
} from "@formspec/analysis";
import type { FormSpecSemanticService } from "./semantic-service.js";

export interface DownstreamAuthoringFeedback {
  readonly code: string;
  readonly severity: FormSpecAnalysisDiagnostic["severity"];
  readonly summary: string;
  readonly details: readonly string[];
  readonly facts: Readonly<Record<string, FormSpecAnalysisDiagnosticDataValue>>;
}

type SemanticDiagnosticsProvider = Pick<FormSpecSemanticService, "getDiagnostics">;

export function collectDownstreamAuthoringFeedback(
  service: SemanticDiagnosticsProvider,
  filePath: string
): readonly DownstreamAuthoringFeedback[] {
  return service
    .getDiagnostics(filePath)
    .diagnostics.map((diagnostic) => renderDownstreamAuthoringDiagnostic(diagnostic));
}

export function renderDownstreamAuthoringDiagnostic(
  diagnostic: FormSpecAnalysisDiagnostic
): DownstreamAuthoringFeedback {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    summary: renderDiagnosticSummary(diagnostic),
    details: renderDiagnosticDetails(diagnostic),
    facts: diagnostic.data,
  };
}

function renderDiagnosticSummary(diagnostic: FormSpecAnalysisDiagnostic): string {
  const tagName = readStringFact(diagnostic, "tagName") ?? "unknown";

  switch (diagnostic.code) {
    case "TYPE_MISMATCH": {
      const targetKind = readStringFact(diagnostic, "targetKind");
      const targetText = readStringFact(diagnostic, "targetText");
      if (targetKind === "path" && targetText !== null) {
        return `Reject @${tagName} for path "${targetText}" because that target resolves to an incompatible type.`;
      }

      return `Reject @${tagName} because the resolved subject type is incompatible with that tag.`;
    }
    case "UNKNOWN_PATH_TARGET": {
      const missingSegment = readStringFact(diagnostic, "missingPathSegment");
      if (missingSegment !== null) {
        return `Reject @${tagName} because the requested path segment "${missingSegment}" does not exist on the resolved subject type.`;
      }

      return `Reject @${tagName} because the requested path target cannot be resolved.`;
    }
    default:
      return `Report ${diagnostic.code} for downstream host rendering.`;
  }
}

function renderDiagnosticDetails(diagnostic: FormSpecAnalysisDiagnostic): readonly string[] {
  const details: string[] = [];
  const placement = readStringFact(diagnostic, "placement");
  if (placement !== null) {
    details.push(`Placement: ${placement}`);
  }

  const targetKind = readStringFact(diagnostic, "targetKind");
  const targetText = readStringFact(diagnostic, "targetText");
  if (targetKind !== null && targetText !== null) {
    details.push(`Target ${targetKind}: ${targetText}`);
  }

  const typescriptDiagnosticCode = readNumberFact(diagnostic, "typescriptDiagnosticCode");
  if (typescriptDiagnosticCode !== null) {
    details.push(`TypeScript diagnostic: TS${String(typescriptDiagnosticCode)}`);
  }

  return details;
}

function readStringFact(diagnostic: FormSpecAnalysisDiagnostic, key: string): string | null {
  const value = diagnostic.data[key];
  return typeof value === "string" ? value : null;
}

function readNumberFact(diagnostic: FormSpecAnalysisDiagnostic, key: string): number | null {
  const value = diagnostic.data[key];
  return typeof value === "number" ? value : null;
}
