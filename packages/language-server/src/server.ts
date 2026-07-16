/**
 * FormSpec Language Server
 *
 * Sets up an LSP server connection and registers handlers for:
 * - `textDocument/completion` — FormSpec JSDoc constraint tag completions
 * - `textDocument/hover` — Documentation for recognized constraint tags
 *
 * Go-to-definition for `{@link}` references (per 004 §5.4) is handled by the
 * TypeScript language service itself, not this server — this server does not
 * advertise `definitionProvider`.
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
import { getPluginDiagnosticsForDocument, toLspDiagnostics } from "./diagnostics.js";
import {
  fileUriToPathOrNull,
  getPluginCompletionContextForDocument,
  getPluginHoverForDocument,
} from "./plugin-client.js";
import { createLogger } from "./logger.js";

const PLUGIN_QUERY_TIMEOUT_ENV_VAR = "FORMSPEC_PLUGIN_QUERY_TIMEOUT_MS";

/**
 * Default debounce window, in milliseconds, applied to diagnostics republishing
 * triggered by document content changes. Collapses bursts of keystrokes into a
 * single plugin query.
 */
const DEFAULT_DIAGNOSTICS_DEBOUNCE_MS = 250;

/**
 * Default interval, in milliseconds, at which the server re-queries diagnostics
 * for open documents whose plugin snapshot was stale/unavailable, so results
 * are published once the snapshot transitions to fresh (without an edit).
 */
const DEFAULT_DIAGNOSTICS_FRESHNESS_POLL_MS = 500;

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

/**
 * Resolves a timer-interval option to a finite, non-negative millisecond value.
 *
 * A `NaN`, negative, or non-finite (e.g. `Infinity`) value would make
 * `setTimeout` behave as `0`, which for the freshness poll causes it to spin
 * aggressively while the plugin is stale. Such values fall back to the default.
 */
function resolveIntervalMs(explicitValue: number | undefined, defaultValue: number): number {
  if (explicitValue === undefined) {
    return defaultValue;
  }

  return Number.isFinite(explicitValue) && explicitValue >= 0 ? explicitValue : defaultValue;
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
  /**
   * Debounce window, in milliseconds, for republishing diagnostics after
   * document content changes. Rapid successive edits collapse into a single
   * plugin query. Defaults to 250ms.
   */
  readonly diagnosticsDebounceMs?: number;
  /**
   * Interval, in milliseconds, at which diagnostics are re-queried for open
   * documents whose plugin snapshot was stale/unavailable, so they publish once
   * the snapshot becomes fresh without requiring an edit. Defaults to 500ms.
   */
  readonly diagnosticsFreshnessPollMs?: number;
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
  const log = createLogger("formspec:lsp", connection);
  const documents = new TextDocuments(TextDocument);
  let workspaceRoots = [...(options.workspaceRoots ?? [])];
  const pluginQueryTimeoutMs = resolvePluginQueryTimeoutMs(options.pluginQueryTimeoutMs);
  const diagnosticsMode = options.diagnosticsMode ?? "off";
  const diagnosticSource = options.diagnosticSource ?? "formspec";
  const diagnosticsDebounceMs = resolveIntervalMs(
    options.diagnosticsDebounceMs,
    DEFAULT_DIAGNOSTICS_DEBOUNCE_MS
  );
  const diagnosticsFreshnessPollMs = resolveIntervalMs(
    options.diagnosticsFreshnessPollMs,
    DEFAULT_DIAGNOSTICS_FRESHNESS_POLL_MS
  );

  // Highest document version already published for each URI. Guards against
  // out-of-order/slow plugin responses clobbering a newer publish.
  const lastPublishedVersionByUri = new Map<string, number>();
  // URIs whose most recent query found the plugin snapshot stale/unavailable.
  // Re-queried on the freshness poll until the snapshot transitions to fresh.
  const staleDocumentUris = new Set<string>();
  // Pending content-change debounce timers, keyed by URI.
  const debounceTimersByUri = new Map<string, ReturnType<typeof setTimeout>>();
  let freshnessPollTimer: ReturnType<typeof setTimeout> | undefined;
  // config.extensions takes precedence over extensions when config is provided
  const effectiveExtensions: readonly ExtensionDefinition[] =
    options.config?.extensions ?? options.extensions ?? [];

  log.info("FormSpec language server initializing");
  documents.listen(connection);

  async function publishDiagnosticsForDocument(document: TextDocument): Promise<void> {
    if (diagnosticsMode !== "plugin" || options.usePluginTransport === false) {
      return;
    }

    const filePath = fileUriToPathOrNull(document.uri);
    if (filePath === null) {
      return;
    }

    // Capture the version at call time so a slow/out-of-order response can be
    // dropped once a newer version has already been published for this URI.
    const documentUri = document.uri;
    const requestedVersion = document.version;

    const diagnostics = await getPluginDiagnosticsForDocument(
      workspaceRoots,
      filePath,
      document.getText(),
      pluginQueryTimeoutMs
    );

    // The document may have been closed while the query was in flight. onDidClose
    // has already cleared its diagnostics, so drop the result entirely: do not
    // republish for a no-longer-open URI, and do not re-arm the stale poll for it.
    if (documents.get(documentUri) === undefined) {
      return;
    }

    // Per-URI monotonic publishing: ignore any result older than what we have
    // already published, whether it is empty, stale, or a full set.
    const lastPublishedVersion = lastPublishedVersionByUri.get(documentUri);
    if (lastPublishedVersion !== undefined && requestedVersion < lastPublishedVersion) {
      return;
    }

    if (diagnostics === null) {
      // The plugin snapshot is stale/unavailable for this revision (missing
      // transport, source-hash mismatch, or query timeout). Do not clobber
      // previously-published diagnostics with an empty set; instead re-poll and
      // publish once the snapshot becomes fresh.
      staleDocumentUris.add(documentUri);
      scheduleFreshnessPoll();
      return;
    }

    staleDocumentUris.delete(documentUri);
    lastPublishedVersionByUri.set(documentUri, requestedVersion);

    log.debug(`Publishing ${String(diagnostics.length)} diagnostic(s) for ${documentUri}`);
    void connection.sendDiagnostics({
      uri: documentUri,
      diagnostics: toLspDiagnostics(document, diagnostics, {
        source: diagnosticSource,
      }),
    });
  }

  function publishDiagnosticsForDocumentSafely(document: TextDocument): void {
    void publishDiagnosticsForDocument(document).catch((error: unknown) => {
      connection.console.error(`[FormSpec] Failed to publish diagnostics: ${String(error)}`);
    });
  }

  function scheduleDebouncedPublish(document: TextDocument): void {
    const existingTimer = debounceTimersByUri.get(document.uri);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => {
      debounceTimersByUri.delete(document.uri);
      publishDiagnosticsForDocumentSafely(document);
    }, diagnosticsDebounceMs);
    debounceTimersByUri.set(document.uri, timer);
  }

  function scheduleFreshnessPoll(): void {
    if (freshnessPollTimer !== undefined) {
      return;
    }
    freshnessPollTimer = setTimeout(() => {
      freshnessPollTimer = undefined;
      void repollStaleDocuments();
    }, diagnosticsFreshnessPollMs);
  }

  async function repollStaleDocuments(): Promise<void> {
    const staleUris = [...staleDocumentUris];
    // Cleared up front; documents still stale after re-query re-add themselves
    // (via the null branch of publishDiagnosticsForDocument), which re-arms the
    // poll. Closed documents simply drop out.
    staleDocumentUris.clear();
    for (const uri of staleUris) {
      const document = documents.get(uri);
      if (document === undefined) {
        continue;
      }
      await publishDiagnosticsForDocument(document).catch((error: unknown) => {
        connection.console.error(`[FormSpec] Failed to publish diagnostics: ${String(error)}`);
      });
    }
  }

  connection.onInitialize((params): InitializeResult => {
    workspaceRoots = dedupeWorkspaceRoots([
      ...getWorkspaceRootsFromInitializeParams(params),
      ...workspaceRoots,
    ]);
    log.info(`Connection initialized with ${String(workspaceRoots.length)} workspace root(s)`);

    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
          // Trigger completions inside JSDoc comments for tags and target specifiers
          triggerCharacters: ["@", ":"],
        },
        hoverProvider: true,
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

  documents.onDidOpen(({ document }) => {
    log.debug(`Document opened: ${document.uri}`);
    // Publish immediately on open so freshly-opened documents surface
    // diagnostics without waiting for a debounce interval.
    publishDiagnosticsForDocumentSafely(document);
  });

  documents.onDidChangeContent(({ document }) => {
    log.debug(`Document changed: ${document.uri}`);
    // Debounced: a burst of keystrokes collapses into a single plugin query.
    scheduleDebouncedPublish(document);
  });

  documents.onDidClose(({ document }) => {
    const existingTimer = debounceTimersByUri.get(document.uri);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
      debounceTimersByUri.delete(document.uri);
    }
    staleDocumentUris.delete(document.uri);
    lastPublishedVersionByUri.delete(document.uri);
    if (diagnosticsMode === "plugin") {
      void connection.sendDiagnostics({
        uri: document.uri,
        diagnostics: [] satisfies Diagnostic[],
      });
    }
  });

  return connection;
}
