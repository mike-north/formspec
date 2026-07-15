import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineConstraintTag, defineExtension } from "@formspec/core/internals";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

/** Creates an externally-resolvable promise for driving overlapping async publishes. */
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Flushes pending microtasks so awaited publish continuations run to completion. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

const mocks = vi.hoisted(() => {
  const connection = {
    onInitialize: vi.fn(),
    onCompletion: vi.fn(),
    onHover: vi.fn(),
    onDefinition: vi.fn(),
    sendDiagnostics: vi.fn(),
    console: {
      error: vi.fn(),
    },
  };
  const documents = {
    listen: vi.fn(),
    get: vi.fn(),
    onDidOpen: vi.fn(),
    onDidChangeContent: vi.fn(),
    onDidClose: vi.fn(),
  };
  const textDocuments = vi.fn(function TextDocuments() {
    return documents;
  });

  return {
    connection,
    documents,
    textDocuments,
    getCompletionItemsAtOffset: vi.fn(() => []),
    getHoverAtOffset: vi.fn(() => null),
    getDefinition: vi.fn(() => null),
    getPluginCompletionContextForDocument: vi.fn(() => Promise.resolve(null)),
    getPluginHoverForDocument: vi.fn(() => Promise.resolve(null)),
    getPluginDiagnosticsForDocument: vi.fn(() => Promise.resolve(null)),
    toLspDiagnostics: vi.fn(() => []),
  };
});

vi.mock("vscode-languageserver/node.js", () => ({
  createConnection: vi.fn(() => mocks.connection),
  ProposedFeatures: { all: {} },
  TextDocuments: mocks.textDocuments,
  TextDocumentSyncKind: { Incremental: 2 },
}));

vi.mock("vscode-languageserver-textdocument", () => ({
  TextDocument: vi.fn(),
}));

vi.mock("../src/providers/completion.js", () => ({
  getCompletionItemsAtOffset: mocks.getCompletionItemsAtOffset,
}));

vi.mock("../src/providers/hover.js", () => ({
  getHoverAtOffset: mocks.getHoverAtOffset,
}));

vi.mock("../src/providers/definition.js", () => ({
  getDefinition: mocks.getDefinition,
}));

vi.mock("../src/diagnostics.js", () => ({
  getPluginDiagnosticsForDocument: mocks.getPluginDiagnosticsForDocument,
  toLspDiagnostics: mocks.toLspDiagnostics,
}));

vi.mock("../src/plugin-client.js", () => ({
  fileUriToPathOrNull: vi.fn((uri: string) => (uri.startsWith("file://") ? uri.slice(7) : null)),
  getPluginCompletionContextForDocument: mocks.getPluginCompletionContextForDocument,
  getPluginHoverForDocument: mocks.getPluginHoverForDocument,
}));

describe("createServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPluginCompletionContextForDocument.mockResolvedValue(null);
    mocks.getPluginHoverForDocument.mockResolvedValue(null);
    mocks.getPluginDiagnosticsForDocument.mockResolvedValue(null as never);
    mocks.toLspDiagnostics.mockReturnValue([] as never);
  });

  it("forwards extension definitions to completion and hover providers", async () => {
    const extension = defineExtension({
      extensionId: "x-test/numeric",
      constraintTags: [
        defineConstraintTag({
          tagName: "maxSigFig",
          constraintName: "MaxSigFig",
          parseValue: (raw) => Number(raw.trim()),
        }),
      ],
    });

    const { createServer } = await import("../src/server.js");
    createServer({ extensions: [extension], pluginQueryTimeoutMs: 1_500 });

    const completionRegistration = mocks.connection.onCompletion.mock.calls[0];
    const hoverRegistration = mocks.connection.onHover.mock.calls[0];
    const completionHandler =
      typeof completionRegistration?.[0] === "function"
        ? (completionRegistration[0] as (_params: unknown) => unknown)
        : undefined;
    const hoverHandler =
      typeof hoverRegistration?.[0] === "function"
        ? (hoverRegistration[0] as (_params: unknown) => unknown)
        : undefined;

    mocks.documents.get.mockReturnValue({
      getText: () => "/** @min */",
      offsetAt: () => 6,
    });

    expect(typeof completionHandler).toBe("function");
    expect(typeof hoverHandler).toBe("function");

    await completionHandler?.({
      textDocument: { uri: "file:///test.ts" },
      position: { line: 0, character: 6 },
    });
    await hoverHandler?.({
      textDocument: { uri: "file:///test.ts" },
      position: { line: 0, character: 6 },
    });

    expect(mocks.textDocuments).toHaveBeenCalledTimes(1);
    expect(mocks.documents.listen).toHaveBeenCalledWith(mocks.connection);
    expect(mocks.documents.get).toHaveBeenCalledWith("file:///test.ts");
    expect(mocks.getCompletionItemsAtOffset).toHaveBeenCalledWith(
      "/** @min */",
      6,
      [extension],
      null
    );
    expect(mocks.getHoverAtOffset).toHaveBeenCalledWith("/** @min */", 6, [extension], null);
  });

  it("uses config.extensions when config is provided", async () => {
    const configExtension = defineExtension({
      extensionId: "x-config/ext",
      constraintTags: [
        defineConstraintTag({
          tagName: "configTag",
          constraintName: "ConfigTag",
          parseValue: (raw) => raw.trim(),
        }),
      ],
    });

    const { createServer } = await import("../src/server.js");
    createServer({ config: { extensions: [configExtension] } });

    const completionHandler = mocks.connection.onCompletion.mock.calls[0]?.[0] as
      | ((_params: unknown) => unknown)
      | undefined;

    mocks.documents.get.mockReturnValue({
      getText: () => "/** @configTag */",
      offsetAt: () => 4,
    });

    await completionHandler?.({
      textDocument: { uri: "file:///test.ts" },
      position: { line: 0, character: 4 },
    });

    expect(mocks.getCompletionItemsAtOffset).toHaveBeenCalledWith(
      "/** @configTag */",
      4,
      [configExtension],
      null
    );
  });

  it("config.extensions takes precedence over extensions option", async () => {
    const extensionsOption = defineExtension({
      extensionId: "x-direct/ext",
      constraintTags: [],
    });
    const configExtension = defineExtension({
      extensionId: "x-config/ext",
      constraintTags: [],
    });

    const { createServer } = await import("../src/server.js");
    createServer({
      extensions: [extensionsOption],
      config: { extensions: [configExtension] },
    });

    const completionHandler = mocks.connection.onCompletion.mock.calls[0]?.[0] as
      | ((_params: unknown) => unknown)
      | undefined;

    mocks.documents.get.mockReturnValue({
      getText: () => "/** @tag */",
      offsetAt: () => 4,
    });

    await completionHandler?.({
      textDocument: { uri: "file:///test.ts" },
      position: { line: 0, character: 4 },
    });

    // config.extensions should be used, not the direct extensions option
    expect(mocks.getCompletionItemsAtOffset).toHaveBeenCalledWith(
      "/** @tag */",
      4,
      [configExtension],
      null
    );
    expect(mocks.getCompletionItemsAtOffset).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [extensionsOption],
      expect.anything()
    );
  });

  it("falls back to rootUri when workspaceFolders are absent", async () => {
    const { createServer } = await import("../src/server.js");
    createServer();

    const initializeHandler = mocks.connection.onInitialize.mock.calls[0]?.[0] as
      | ((params: {
          rootUri?: string | null;
          rootPath?: string | null;
          workspaceFolders?: readonly { uri: string }[] | null;
        }) => { capabilities: { completionProvider: { triggerCharacters: readonly string[] } } })
      | undefined;
    const completionHandler = mocks.connection.onCompletion.mock.calls[0]?.[0] as
      | ((params: {
          textDocument: { uri: string };
          position: { line: number; character: number };
        }) => Promise<unknown>)
      | undefined;

    expect(typeof initializeHandler).toBe("function");
    expect(typeof completionHandler).toBe("function");

    const initializeResult = initializeHandler?.({
      rootUri: "file:///workspace/project",
      workspaceFolders: null,
    });

    mocks.documents.get.mockReturnValue({
      getText: () => "/** @minimum 0 */",
      offsetAt: () => 7,
    });

    await completionHandler?.({
      textDocument: { uri: "file:///workspace/project/example.ts" },
      position: { line: 0, character: 7 },
    });

    expect(initializeResult?.capabilities.completionProvider.triggerCharacters).toEqual(["@", ":"]);
    expect(mocks.getPluginCompletionContextForDocument).toHaveBeenCalledWith(
      ["/workspace/project"],
      "/workspace/project/example.ts",
      "/** @minimum 0 */",
      7,
      undefined
    );
  });

  it("publishes no diagnostics by default", async () => {
    const { createServer } = await import("../src/server.js");
    createServer();

    expect(mocks.documents.onDidOpen).toHaveBeenCalledTimes(1);
    const openHandler = mocks.documents.onDidOpen.mock.calls[0]?.[0] as
      | ((event: { document: { uri: string; getText(): string } }) => void)
      | undefined;

    openHandler?.({
      document: {
        uri: "file:///workspace/project/example.ts",
        getText: () => "/** @minimum 0 */",
      },
    });

    expect(mocks.getPluginDiagnosticsForDocument).not.toHaveBeenCalled();
    expect(mocks.connection.sendDiagnostics).not.toHaveBeenCalled();
  });

  it("publishes plugin diagnostics through the exported diagnostics helpers when enabled", async () => {
    const lspDiagnostics = [
      {
        message: 'Tag "@discriminator" target field "kind" must be required.',
      },
    ];
    const canonicalDiagnostics = [
      {
        code: "OPTIONAL_TARGET_FIELD",
        category: "target-resolution",
        message: 'Tag "@discriminator" target field "kind" must be required.',
        range: { start: 4, end: 12 },
        severity: "error",
        relatedLocations: [
          {
            filePath: "/workspace/project/example.ts",
            range: { start: 24, end: 37 },
            message: "Target field declaration",
          },
        ],
        data: {
          tagName: "discriminator",
        },
      },
    ] as const;
    mocks.getPluginDiagnosticsForDocument.mockResolvedValue(canonicalDiagnostics as never);
    mocks.toLspDiagnostics.mockReturnValue(lspDiagnostics as never);

    const { createServer } = await import("../src/server.js");
    createServer({
      diagnosticsMode: "plugin",
      diagnosticSource: "downstream-brand",
      pluginQueryTimeoutMs: 750,
    });

    const openHandler = mocks.documents.onDidOpen.mock.calls[0]?.[0] as
      | ((event: { document: { uri: string; getText(): string } }) => void)
      | undefined;

    const document = {
      uri: "file:///workspace/project/example.ts",
      getText: () => "/** @discriminator :kind T */ interface TaggedValue<T> { kind?: string; }",
    };
    mocks.documents.get.mockReturnValue(document);
    openHandler?.({ document });
    await Promise.resolve();

    expect(mocks.getPluginDiagnosticsForDocument).toHaveBeenCalledWith(
      [],
      "/workspace/project/example.ts",
      "/** @discriminator :kind T */ interface TaggedValue<T> { kind?: string; }",
      750
    );
    expect(mocks.toLspDiagnostics).toHaveBeenCalledWith(document, canonicalDiagnostics, {
      source: "downstream-brand",
    });
    expect(mocks.connection.sendDiagnostics).toHaveBeenCalledWith({
      uri: "file:///workspace/project/example.ts",
      diagnostics: lspDiagnostics,
    });
  });

  it("refreshes diagnostics on content changes and clears them on close", async () => {
    vi.useFakeTimers();
    try {
      mocks.getPluginDiagnosticsForDocument.mockResolvedValue([] as never);
      mocks.toLspDiagnostics.mockReturnValue([] as never);

      const { createServer } = await import("../src/server.js");
      createServer({
        diagnosticsMode: "plugin",
        diagnosticsDebounceMs: 100,
      });

      const changeHandler = mocks.documents.onDidChangeContent.mock.calls[0]?.[0] as
        | ((event: { document: { uri: string; version: number; getText(): string } }) => void)
        | undefined;
      const closeHandler = mocks.documents.onDidClose.mock.calls[0]?.[0] as
        | ((event: { document: { uri: string } }) => void)
        | undefined;

      const document = {
        uri: "file:///workspace/project/example.ts",
        version: 1,
        getText: () => "/** @minimum 0 */",
      };
      mocks.documents.get.mockReturnValue(document);

      changeHandler?.({ document });
      // Debounced: the plugin is not queried until the debounce window elapses.
      expect(mocks.getPluginDiagnosticsForDocument).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(100);
      closeHandler?.({ document });

      expect(mocks.getPluginDiagnosticsForDocument).toHaveBeenCalledWith(
        [],
        "/workspace/project/example.ts",
        "/** @minimum 0 */",
        undefined
      );
      expect(mocks.connection.sendDiagnostics).toHaveBeenLastCalledWith({
        uri: "file:///workspace/project/example.ts",
        diagnostics: [],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("debounces onDidChangeContent so a burst of edits triggers a single plugin query", async () => {
    vi.useFakeTimers();
    try {
      mocks.getPluginDiagnosticsForDocument.mockResolvedValue([] as never);
      mocks.toLspDiagnostics.mockReturnValue([] as never);

      const { createServer } = await import("../src/server.js");
      createServer({
        diagnosticsMode: "plugin",
        diagnosticsDebounceMs: 100,
      });

      const changeHandler = mocks.documents.onDidChangeContent.mock.calls[0]?.[0] as
        | ((event: { document: { uri: string; version: number; getText(): string } }) => void)
        | undefined;

      const uri = "file:///workspace/project/example.ts";
      mocks.documents.get.mockReturnValue({ uri, version: 3, getText: () => "v3" });
      // Three rapid edits within the debounce window.
      changeHandler?.({ document: { uri, version: 1, getText: () => "v1" } });
      await vi.advanceTimersByTimeAsync(40);
      changeHandler?.({ document: { uri, version: 2, getText: () => "v2" } });
      await vi.advanceTimersByTimeAsync(40);
      changeHandler?.({ document: { uri, version: 3, getText: () => "v3" } });
      await vi.advanceTimersByTimeAsync(100);

      // Exactly one query fires, and it reflects the latest edit's text.
      expect(mocks.getPluginDiagnosticsForDocument).toHaveBeenCalledTimes(1);
      expect(mocks.getPluginDiagnosticsForDocument).toHaveBeenCalledWith(
        [],
        "/workspace/project/example.ts",
        "v3",
        undefined
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let an older query resolving last with null clobber the newer non-empty publish", async () => {
    vi.useFakeTimers();
    try {
      const deferredV1 = createDeferred<readonly unknown[] | null>();
      const deferredV2 = createDeferred<readonly unknown[] | null>();
      mocks.getPluginDiagnosticsForDocument
        .mockReturnValueOnce(deferredV1.promise as never)
        .mockReturnValueOnce(deferredV2.promise as never);
      mocks.toLspDiagnostics.mockImplementation(((
        _document: unknown,
        canonical: readonly unknown[]
      ) => (canonical.length > 0 ? [{ message: "violation" }] : [])) as never);

      const { createServer } = await import("../src/server.js");
      createServer({
        diagnosticsMode: "plugin",
        diagnosticsDebounceMs: 100,
      });

      const changeHandler = mocks.documents.onDidChangeContent.mock.calls[0]?.[0] as
        | ((event: { document: { uri: string; version: number; getText(): string } }) => void)
        | undefined;

      const uri = "file:///workspace/project/example.ts";
      mocks.documents.get.mockReturnValue({ uri, version: 2, getText: () => "v2" });
      // Edit E1 (introduces a violation), then E2. Both publishes start and hang
      // on their respective plugin queries.
      changeHandler?.({ document: { uri, version: 1, getText: () => "v1" } });
      await vi.advanceTimersByTimeAsync(100);
      changeHandler?.({ document: { uri, version: 2, getText: () => "v2" } });
      await vi.advanceTimersByTimeAsync(100);

      // The newer query (v2) resolves first with a real violation and publishes.
      deferredV2.resolve([{ code: "VIOLATION" }]);
      await flushMicrotasks();
      expect(mocks.connection.sendDiagnostics).toHaveBeenCalledTimes(1);
      expect(mocks.connection.sendDiagnostics).toHaveBeenLastCalledWith({
        uri,
        diagnostics: [{ message: "violation" }],
      });

      // The older query (v1) resolves last with null — it must NOT clobber the
      // fresh v2 diagnostics with an empty set.
      deferredV1.resolve(null);
      await flushMicrotasks();

      expect(mocks.connection.sendDiagnostics).toHaveBeenCalledTimes(1);
      expect(mocks.connection.sendDiagnostics).toHaveBeenLastCalledWith({
        uri,
        diagnostics: [{ message: "violation" }],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops an older non-null result via the per-URI monotonic version guard", async () => {
    vi.useFakeTimers();
    try {
      const deferredV1 = createDeferred<readonly unknown[] | null>();
      const deferredV2 = createDeferred<readonly unknown[] | null>();
      mocks.getPluginDiagnosticsForDocument
        .mockReturnValueOnce(deferredV1.promise as never)
        .mockReturnValueOnce(deferredV2.promise as never);
      mocks.toLspDiagnostics.mockImplementation(((
        _document: unknown,
        canonical: readonly unknown[]
      ) => (canonical.length > 0 ? [{ message: "violation" }] : [])) as never);

      const { createServer } = await import("../src/server.js");
      createServer({
        diagnosticsMode: "plugin",
        diagnosticsDebounceMs: 100,
      });

      const changeHandler = mocks.documents.onDidChangeContent.mock.calls[0]?.[0] as
        | ((event: { document: { uri: string; version: number; getText(): string } }) => void)
        | undefined;

      const uri = "file:///workspace/project/example.ts";
      mocks.documents.get.mockReturnValue({ uri, version: 2, getText: () => "v2" });
      changeHandler?.({ document: { uri, version: 1, getText: () => "v1" } });
      await vi.advanceTimersByTimeAsync(100);
      changeHandler?.({ document: { uri, version: 2, getText: () => "v2" } });
      await vi.advanceTimersByTimeAsync(100);

      // v2 resolves first with a violation and publishes.
      deferredV2.resolve([{ code: "VIOLATION" }]);
      await flushMicrotasks();

      // v1 resolves last with a *non-null* empty set (a fresh-but-older result).
      // The monotonic guard must drop it rather than publish an empty payload.
      deferredV1.resolve([]);
      await flushMicrotasks();

      expect(mocks.connection.sendDiagnostics).toHaveBeenCalledTimes(1);
      expect(mocks.connection.sendDiagnostics).toHaveBeenLastCalledWith({
        uri,
        diagnostics: [{ message: "violation" }],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-publishes diagnostics for an open document when the plugin transitions stale to fresh", async () => {
    vi.useFakeTimers();
    try {
      // First query: plugin snapshot stale/unavailable (null). Second query
      // (via the freshness poll): fresh with a real diagnostic.
      mocks.getPluginDiagnosticsForDocument
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce([{ code: "READY" }] as never);
      mocks.toLspDiagnostics.mockReturnValue([{ message: "ready" }] as never);

      const uri = "file:///workspace/project/example.ts";
      const document = { uri, version: 1, getText: () => "v1" };
      mocks.documents.get.mockReturnValue(document);

      const { createServer } = await import("../src/server.js");
      createServer({
        diagnosticsMode: "plugin",
        diagnosticsFreshnessPollMs: 200,
      });

      const openHandler = mocks.documents.onDidOpen.mock.calls[0]?.[0] as
        | ((event: { document: { uri: string; version: number; getText(): string } }) => void)
        | undefined;

      openHandler?.({ document });
      await flushMicrotasks();

      // Stale first pass: nothing published, no empty clobber.
      expect(mocks.getPluginDiagnosticsForDocument).toHaveBeenCalledTimes(1);
      expect(mocks.connection.sendDiagnostics).not.toHaveBeenCalled();

      // Freshness poll fires; the plugin is now ready and diagnostics publish
      // without any intervening edit.
      await vi.advanceTimersByTimeAsync(200);
      await flushMicrotasks();

      expect(mocks.getPluginDiagnosticsForDocument).toHaveBeenCalledTimes(2);
      expect(mocks.connection.sendDiagnostics).toHaveBeenCalledTimes(1);
      expect(mocks.connection.sendDiagnostics).toHaveBeenLastCalledWith({
        uri,
        diagnostics: [{ message: "ready" }],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the default freshness-poll interval when given a NaN or negative value", async () => {
    vi.useFakeTimers();
    try {
      // A stale (null) first pass, then a fresh result on the poll. With an
      // invalid (negative) poll interval, a naive setTimeout would fire at ~0ms
      // and spin; the clamp forces the 500ms default instead.
      mocks.getPluginDiagnosticsForDocument
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce([{ code: "READY" }] as never);
      mocks.toLspDiagnostics.mockReturnValue([{ message: "ready" }] as never);

      const uri = "file:///workspace/project/example.ts";
      const document = { uri, version: 1, getText: () => "v1" };
      mocks.documents.get.mockReturnValue(document);

      const { createServer } = await import("../src/server.js");
      createServer({
        diagnosticsMode: "plugin",
        diagnosticsDebounceMs: Number.NaN,
        diagnosticsFreshnessPollMs: -1000,
      });

      const openHandler = mocks.documents.onDidOpen.mock.calls[0]?.[0] as
        | ((event: { document: { uri: string; version: number; getText(): string } }) => void)
        | undefined;

      openHandler?.({ document });
      await flushMicrotasks();

      expect(mocks.getPluginDiagnosticsForDocument).toHaveBeenCalledTimes(1);

      // Advancing short of the clamped 500ms default must NOT trigger the poll.
      await vi.advanceTimersByTimeAsync(200);
      await flushMicrotasks();
      expect(mocks.getPluginDiagnosticsForDocument).toHaveBeenCalledTimes(1);

      // Crossing 500ms triggers the re-poll and the fresh publish.
      await vi.advanceTimersByTimeAsync(300);
      await flushMicrotasks();
      expect(mocks.getPluginDiagnosticsForDocument).toHaveBeenCalledTimes(2);
      expect(mocks.connection.sendDiagnostics).toHaveBeenLastCalledWith({
        uri,
        diagnostics: [{ message: "ready" }],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops an in-flight query result for a document closed mid-query", async () => {
    vi.useFakeTimers();
    try {
      const deferred = createDeferred<readonly unknown[] | null>();
      mocks.getPluginDiagnosticsForDocument.mockReturnValueOnce(deferred.promise as never);
      mocks.toLspDiagnostics.mockReturnValue([{ message: "late" }] as never);

      const uri = "file:///workspace/project/example.ts";
      const document = { uri, version: 1, getText: () => "v1" };
      mocks.documents.get.mockReturnValue(document);

      const { createServer } = await import("../src/server.js");
      createServer({
        diagnosticsMode: "plugin",
        diagnosticsDebounceMs: 100,
      });

      const changeHandler = mocks.documents.onDidChangeContent.mock.calls[0]?.[0] as
        | ((event: { document: { uri: string; version: number; getText(): string } }) => void)
        | undefined;
      const closeHandler = mocks.documents.onDidClose.mock.calls[0]?.[0] as
        | ((event: { document: { uri: string } }) => void)
        | undefined;

      changeHandler?.({ document });
      // The debounced publish starts and hangs on the in-flight query.
      await vi.advanceTimersByTimeAsync(100);
      expect(mocks.getPluginDiagnosticsForDocument).toHaveBeenCalledTimes(1);

      // Close the document while the query is in flight. The close clears
      // diagnostics; the document is no longer open.
      closeHandler?.({ document });
      mocks.documents.get.mockReturnValue(undefined);

      // Only the close handler's empty clear so far.
      expect(mocks.connection.sendDiagnostics).toHaveBeenCalledTimes(1);
      expect(mocks.connection.sendDiagnostics).toHaveBeenLastCalledWith({ uri, diagnostics: [] });

      // The in-flight query settles with a real (non-empty) result — it must be
      // dropped rather than resurrecting diagnostics for the closed document.
      deferred.resolve([{ code: "LATE" }]);
      await flushMicrotasks();

      expect(mocks.connection.sendDiagnostics).toHaveBeenCalledTimes(1);
      expect(mocks.connection.sendDiagnostics).toHaveBeenLastCalledWith({ uri, diagnostics: [] });

      // The dropped result did not re-arm the stale poll: advancing well past any
      // poll interval triggers no further plugin queries.
      await vi.advanceTimersByTimeAsync(1000);
      await flushMicrotasks();
      expect(mocks.getPluginDiagnosticsForDocument).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
