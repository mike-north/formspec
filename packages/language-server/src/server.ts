/**
 * FormSpec Language Server
 *
 * Sets up an LSP server connection and registers handlers for:
 * - `textDocument/completion` — FormSpec JSDoc constraint tag completions
 * - `textDocument/hover` — Documentation for recognized constraint tags
 * - `textDocument/definition` — Go-to-definition (stub, returns null)
 *
 * The packaged language server is a reference implementation built on the same
 * composable helpers that downstream consumers can call directly.
 */

import {
  createConnection,
  Diagnostic,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  type Connection,
  type InitializeResult,
} from "vscode-languageserver/node.js";
import type { ExtensionDefinition } from "@formspec/core";
import type { FormSpecConfig } from "@formspec/config";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getCompletionItemsAtOffset } from "./providers/completion.js";
import { getHoverAtOffset } from "./providers/hover.js";
import { getDefinition } from "./providers/definition.js";
import { getPluginDiagnosticsForDocument, toLspDiagnostics } from "./diagnostics.js";
import {
  fileUriToPathOrNull,
  getPluginCompletionContextForDocument,
  getPluginHoverForDocument,
} from "./plugin-client.js";

const PLUGIN_QUERY_TIMEOUT_ENV_VAR = "FORMSPEC_PLUGIN_QUERY_TIMEOUT_MS";

function dedupeWorkspaceRoots(workspaceRoots: readonly string[]): string[] {
  return [...new Set(workspaceRoots)];
}

function resolvePluginQueryTimeoutMs(explicitTimeoutMs: number | undefined): number | undefined {
  if (explicitTimeoutMs !== undefined) {
    return explicitTimeoutMs;
  }

  const rawValue = process.env[PLUGIN_QUERY_TIMEOUT_ENV_VAR];
  if (rawValue === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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
  /**
   * Optional FormSpec configuration object. When provided, extensions are
   * resolved from `config.extensions` and take precedence over `extensions`.
   */
  readonly config?: FormSpecConfig;
  /** Optional extension definitions whose custom tags should be surfaced by tooling. */
  readonly extensions?: readonly ExtensionDefinition[];
  /** Optional workspace roots to use before initialize() provides them. */
  readonly workspaceRoots?: readonly string[];
  /** Set to false to disable tsserver-plugin semantic enrichment. */
  readonly usePluginTransport?: boolean;
  /** IPC timeout, in milliseconds, for semantic plugin requests. */
  readonly pluginQueryTimeoutMs?: number;
  /** Optional diagnostics publishing mode for the packaged reference LSP. */
  readonly diagnosticsMode?: "off" | "plugin";
  /** Source label to use when publishing plugin-derived diagnostics. */
  readonly diagnosticSource?: string;
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
  const pluginQueryTimeoutMs = resolvePluginQueryTimeoutMs(options.pluginQueryTimeoutMs);
  const diagnosticsMode = options.diagnosticsMode ?? "off";
  const diagnosticSource = options.diagnosticSource ?? "formspec";
  // config.extensions takes precedence over extensions when config is provided
  const effectiveExtensions: readonly ExtensionDefinition[] =
    options.config?.extensions ?? options.extensions ?? [];

  documents.listen(connection);

  async function publishDiagnosticsForDocument(document: TextDocument): Promise<void> {
    if (diagnosticsMode !== "plugin" || options.usePluginTransport === false) {
      return;
    }

    const filePath = fileUriToPathOrNull(document.uri);
    if (filePath === null) {
      return;
    }

    const diagnostics =
      (await getPluginDiagnosticsForDocument(
        workspaceRoots,
        filePath,
        document.getText(),
        pluginQueryTimeoutMs
      )) ?? [];

    void connection.sendDiagnostics({
      uri: document.uri,
      diagnostics: toLspDiagnostics(document, diagnostics, {
        source: diagnosticSource,
      }),
    });
  }

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
            pluginQueryTimeoutMs
          );

    return getCompletionItemsAtOffset(documentText, offset, effectiveExtensions, semanticContext);
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
            pluginQueryTimeoutMs
          );

    return getHoverAtOffset(documentText, offset, effectiveExtensions, semanticHover);
  });

  connection.onDefinition((_params) => {
    // Go-to-definition is not yet implemented.
    return getDefinition();
  });

  documents.onDidOpen(({ document }) => {
    void publishDiagnosticsForDocument(document).catch((error: unknown) => {
      connection.console.error(`[FormSpec] Failed to publish diagnostics: ${String(error)}`);
    });
  });

  documents.onDidChangeContent(({ document }) => {
    void publishDiagnosticsForDocument(document).catch((error: unknown) => {
      connection.console.error(`[FormSpec] Failed to publish diagnostics: ${String(error)}`);
    });
  });

  documents.onDidClose(({ document }) => {
    if (diagnosticsMode === "plugin") {
      void connection.sendDiagnostics({
        uri: document.uri,
        diagnostics: [] satisfies Diagnostic[],
      });
    }
  });

  return connection;
}
