/**
 * \@formspec/language-server
 *
 * Language server for FormSpec — provides completions and hover documentation
 * for FormSpec JSDoc constraint tags (`@Minimum`, `@Maximum`, `@Pattern`,
 * etc.) in TypeScript files. Go-to-definition for `{@link}` references is
 * handled by the TypeScript language service itself (004 §5.4); this server
 * does not advertise `definitionProvider`.
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
  DSLPolicy,
  FormSpecConfig,
  FormSpecPackageOverride,
  FormSpecSerializationConfig,
} from "@formspec/config";
export type { ExtensionDefinition } from "@formspec/core";
export type {
  CommentSourceSpan,
  CommentSpan,
  FormSpecAnalysisDiagnostic,
  FormSpecAnalysisDiagnosticCategory,
  FormSpecAnalysisDiagnosticDataValue,
  FormSpecAnalysisDiagnosticLocation,
} from "@formspec/analysis";
export {
  getPluginDiagnosticsForDocument,
  toLspDiagnostics,
  type ToLspDiagnosticsOptions,
} from "./diagnostics.js";
export { getCompletionItems } from "./providers/completion.js";
export { getHoverForTag } from "./providers/hover.js";
export { fileUriToPathOrNull } from "./plugin-client.js";
