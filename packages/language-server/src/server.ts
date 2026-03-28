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
  TextDocuments,
  TextDocumentSyncKind,
  type Connection,
  type InitializeResult,
} from "vscode-languageserver/node.js";
import type { ExtensionDefinition } from "@formspec/core";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getCompletionItemsAtOffset } from "./providers/completion.js";
import { getHoverAtOffset } from "./providers/hover.js";
import { getDefinition } from "./providers/definition.js";

export interface CreateServerOptions {
  /** Optional extension definitions whose custom tags should be surfaced by tooling. */
  readonly extensions?: readonly ExtensionDefinition[];
}

/**
 * Creates and configures the FormSpec language server connection.
 *
 * Registers LSP capability handlers and returns the connection.
 * Call `connection.listen()` to start accepting messages.
 *
 * @returns The configured LSP connection (not yet listening)
 */
export function createServer(options: CreateServerOptions = {}): Connection {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);

  documents.listen(connection);

  connection.onInitialize((): InitializeResult => {
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
          // Trigger completions inside JSDoc comments for tags and target specifiers
          triggerCharacters: ["@", ":"],
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

  connection.onCompletion((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    const offset = document.offsetAt(params.position);
    return getCompletionItemsAtOffset(document.getText(), offset, options.extensions);
  });

  connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    const offset = document.offsetAt(params.position);
    return getHoverAtOffset(document.getText(), offset, options.extensions);
  });

  connection.onDefinition((_params) => {
    // Go-to-definition is not yet implemented.
    return getDefinition();
  });

  return connection;
}
