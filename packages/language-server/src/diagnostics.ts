import type {
  FormSpecAnalysisDiagnostic,
  FormSpecAnalysisDiagnosticLocation,
} from "@formspec/analysis";
import {
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  Location,
  Range,
  type Diagnostic,
} from "vscode-languageserver/node.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { fileUriToPathOrNull } from "./plugin-client.js";
export { getPluginDiagnosticsForDocument } from "./plugin-client.js";

/**
 * Options for converting canonical FormSpec diagnostics into LSP diagnostics.
 *
 * @public
 */
export interface ToLspDiagnosticsOptions {
  /** Source label shown by LSP clients. Defaults to `formspec`. */
  readonly source?: string;
}

/**
 * Converts canonical FormSpec diagnostics into LSP diagnostics.
 *
 * Downstream consumers that want complete white-label control can ignore this
 * helper and render their own messages from `code` + `data`.
 *
 * @public
 */
export function toLspDiagnostics(
  document: TextDocument,
  diagnostics: readonly FormSpecAnalysisDiagnostic[],
  options: ToLspDiagnosticsOptions = {}
): Diagnostic[] {
  const source = options.source ?? "formspec";
  return diagnostics.map((diagnostic) => {
    const relatedInformation = toRelatedInformation(document, diagnostic.relatedLocations);
    return {
      range: spanToRange(document, diagnostic.range.start, diagnostic.range.end),
      severity: toLspSeverity(diagnostic.severity),
      source,
      code: diagnostic.code,
      message: diagnostic.message,
      ...(relatedInformation === undefined ? {} : { relatedInformation }),
      data: {
        ...diagnostic.data,
        category: diagnostic.category,
      },
    };
  });
}

function spanToRange(document: TextDocument, start: number, end: number): Range {
  return Range.create(document.positionAt(start), document.positionAt(end));
}

function toLspSeverity(severity: FormSpecAnalysisDiagnostic["severity"]): DiagnosticSeverity {
  switch (severity) {
    case "error":
      return DiagnosticSeverity.Error;
    case "warning":
      return DiagnosticSeverity.Warning;
    case "info":
      return DiagnosticSeverity.Information;
    default:
      return DiagnosticSeverity.Information;
  }
}

function toRelatedInformation(
  document: TextDocument,
  locations: readonly FormSpecAnalysisDiagnosticLocation[]
): DiagnosticRelatedInformation[] | undefined {
  if (locations.length === 0) {
    return undefined;
  }

  const currentDocumentFilePath = getDocumentFilePath(document);
  const relatedInformation = locations
    .filter((location) => location.filePath === currentDocumentFilePath)
    .map((location) =>
      DiagnosticRelatedInformation.create(
        Location.create(
          document.uri,
          spanToRange(document, location.range.start, location.range.end)
        ),
        location.message ?? "Related FormSpec location"
      )
    );

  return relatedInformation.length === 0 ? undefined : relatedInformation;
}

function getDocumentFilePath(document: TextDocument): string | null {
  return fileUriToPathOrNull(document.uri);
}
