/**
 * FormSpec Language Server
 *
 * Sets up an LSP server connection and registers handlers for:
 * - `textDocument/completion` — FormSpec JSDoc constraint tag completions
 * - `textDocument/hover` — Documentation for recognized constraint tags
 * - `textDocument/definition` — Go-to-definition (stub, returns null)
 *
 * Diagnostics are intentionally omitted per design decision A7.
 */

import {
  createConnection,
  ProposedFeatures,
  TextDocumentSyncKind,
  type Connection,
  type InitializeResult,
} from "vscode-languageserver/node.js";
import { getCompletionItems } from "./providers/completion.js";
import { getHoverForTag } from "./providers/hover.js";
import { getDefinition } from "./providers/definition.js";

/**
 * Creates and configures the FormSpec language server connection.
 *
 * Registers LSP capability handlers and returns the connection.
 * Call `connection.listen()` to start accepting messages.
 *
 * @returns The configured LSP connection (not yet listening)
 */
export function createServer(): Connection {
  const connection = createConnection(ProposedFeatures.all);

  connection.onInitialize((): InitializeResult => {
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
          // Trigger completions inside JSDoc comments when `@` is typed
          triggerCharacters: ["@"],
        },
        hoverProvider: true,
        definitionProvider: true,
      },
      serverInfo: {
        name: "formspec-language-server",
        version: "0.1.0",
      },
    };
  });

  connection.onCompletion(() => {
    // Return all FormSpec constraint tag completions.
    // Future phases will add context-aware filtering based on field type and
    // cursor position within JSDoc comment ranges.
    return getCompletionItems();
  });

  connection.onHover((_params) => {
    // Extract the word under the cursor and look up hover documentation.
    // This is a stub — precise JSDoc token detection (checking that the
    // cursor is within a JSDoc comment and extracting the tag name) will be
    // added in a future phase.
    //
    // For now we return null to signal no hover is available until the
    // token extraction is implemented.
    return getHoverForTag("");
  });

  connection.onDefinition((_params) => {
    // Go-to-definition is not yet implemented.
    return getDefinition();
  });

  return connection;
}
