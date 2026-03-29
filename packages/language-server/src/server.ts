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
import {
  fileUriToPathOrNull,
  getPluginCompletionContextForDocument,
  getPluginHoverForDocument,
} from "./plugin-client.js";

function dedupeWorkspaceRoots(workspaceRoots: readonly string[]): string[] {
  return [...new Set(workspaceRoots)];
}

function getWorkspaceRootsFromInitializeParams(params: {
  readonly workspaceFolders?: readonly { readonly uri: string }[] | null;
  readonly rootUri?: string | null;
  readonly rootPath?: string | null;
}): string[] {
  const workspaceFolders =
    params.workspaceFolders
      ?.map((workspaceFolder) => fileUriToPathOrNull(workspaceFolder.uri))
      .filter((workspaceRoot): workspaceRoot is string => workspaceRoot !== null) ?? [];
  const rootUri =
    params.rootUri === null || params.rootUri === undefined
      ? null
      : fileUriToPathOrNull(params.rootUri);
  const rootPath = params.rootPath ?? null;

  return dedupeWorkspaceRoots([
    ...workspaceFolders,
    ...(rootUri === null ? [] : [rootUri]),
    ...(rootPath === null ? [] : [rootPath]),
  ]);
}

/**
 * Public configuration for constructing the FormSpec language server.
 *
 * @public
 */
export interface CreateServerOptions {
  /** Optional extension definitions whose custom tags should be surfaced by tooling. */
  readonly extensions?: readonly ExtensionDefinition[];
  /** Optional workspace roots to use before initialize() provides them. */
  readonly workspaceRoots?: readonly string[];
  /** Set to false to disable tsserver-plugin semantic enrichment. */
  readonly usePluginTransport?: boolean;
  /** IPC timeout, in milliseconds, for semantic plugin requests. */
  readonly pluginQueryTimeoutMs?: number;
}

/**
 * Creates and configures the FormSpec language server connection.
 *
 * Registers LSP capability handlers and returns the connection.
 * Call `connection.listen()` to start accepting messages.
 *
 * @returns The configured LSP connection (not yet listening)
 * @public
 */
export function createServer(options: CreateServerOptions = {}): Connection {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);
  let workspaceRoots = [...(options.workspaceRoots ?? [])];

  documents.listen(connection);

  connection.onInitialize((params): InitializeResult => {
    workspaceRoots = dedupeWorkspaceRoots([
      ...getWorkspaceRootsFromInitializeParams(params),
      ...workspaceRoots,
    ]);

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

  connection.onCompletion(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    const offset = document.offsetAt(params.position);
    const documentText = document.getText();
    const filePath = fileUriToPathOrNull(params.textDocument.uri);
    const semanticContext =
      options.usePluginTransport === false || filePath === null
        ? null
        : await getPluginCompletionContextForDocument(
            workspaceRoots,
            filePath,
            documentText,
            offset,
            options.pluginQueryTimeoutMs
          );

    return getCompletionItemsAtOffset(documentText, offset, options.extensions, semanticContext);
  });

  connection.onHover(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    const offset = document.offsetAt(params.position);
    const documentText = document.getText();
    const filePath = fileUriToPathOrNull(params.textDocument.uri);
    const semanticHover =
      options.usePluginTransport === false || filePath === null
        ? null
        : await getPluginHoverForDocument(
            workspaceRoots,
            filePath,
            documentText,
            offset,
            options.pluginQueryTimeoutMs
          );

    return getHoverAtOffset(documentText, offset, options.extensions, semanticHover);
  });

  connection.onDefinition((_params) => {
    // Go-to-definition is not yet implemented.
    return getDefinition();
  });

  return connection;
}
