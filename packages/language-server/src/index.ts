/**
 * \@formspec/language-server
 *
 * Language server for FormSpec — provides completions, hover documentation,
 * and go-to-definition for FormSpec JSDoc constraint tags (`@Minimum`,
 * `@Maximum`, `@Pattern`, etc.) in TypeScript files.
 *
 * This package implements the Language Server Protocol (LSP) using the
 * `vscode-languageserver` library. Cheap syntax-local behaviors stay in the
 * LSP process, while TypeScript-project-aware semantics are supplied by
 * `@formspec/ts-plugin` over a local manifest + IPC transport.
 *
 * The packaged server acts as a reference implementation over the composable
 * completion, hover, and diagnostics helpers exported from this package.
 *
 * @example
 * ```ts
 * import { createServer } from '@formspec/language-server';
 *
 * const connection = createServer();
 * connection.listen();
 * ```
 *
 * @packageDocumentation
 */

export { createServer } from "./server.js";
export type { CreateServerOptions } from "./server.js";
export type {
  CommentSourceSpan,
  CommentSpan,
  FormSpecAnalysisDiagnostic,
  FormSpecAnalysisDiagnosticCategory,
  FormSpecAnalysisDiagnosticDataValue,
  FormSpecAnalysisDiagnosticLocation,
} from "@formspec/analysis/protocol";
export {
  getPluginDiagnosticsForDocument,
  toLspDiagnostics,
  type ToLspDiagnosticsOptions,
} from "./diagnostics.js";
export { getCompletionItems } from "./providers/completion.js";
export { getHoverForTag } from "./providers/hover.js";
export { getDefinition } from "./providers/definition.js";
