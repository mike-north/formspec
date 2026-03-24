/**
 * @formspec/language-server
 *
 * Language server for FormSpec — provides completions, hover documentation,
 * and go-to-definition for FormSpec JSDoc constraint tags (`@Minimum`,
 * `@Maximum`, `@Pattern`, etc.) in TypeScript files.
 *
 * This package implements the Language Server Protocol (LSP) using the
 * `vscode-languageserver` library. Constraint names are sourced from
 * `BUILTIN_CONSTRAINT_DEFINITIONS` in `@formspec/core`, ensuring the
 * language server stays in sync with the single source of truth.
 *
 * Diagnostics are intentionally omitted per design decision A7.
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
export { getCompletionItems } from "./providers/completion.js";
export { getHoverForTag } from "./providers/hover.js";
export { getDefinition } from "./providers/definition.js";
