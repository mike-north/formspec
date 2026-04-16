import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineConstraintTag, defineExtension } from "@formspec/core/internals";

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
  const textDocuments = vi.fn(() => documents);

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

vi.mock("../providers/completion.js", () => ({
  getCompletionItemsAtOffset: mocks.getCompletionItemsAtOffset,
}));

vi.mock("../providers/hover.js", () => ({
  getHoverAtOffset: mocks.getHoverAtOffset,
}));

vi.mock("../providers/definition.js", () => ({
  getDefinition: mocks.getDefinition,
}));

vi.mock("../diagnostics.js", () => ({
  getPluginDiagnosticsForDocument: mocks.getPluginDiagnosticsForDocument,
  toLspDiagnostics: mocks.toLspDiagnostics,
}));

vi.mock("../plugin-client.js", () => ({
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

    const { createServer } = await import("../server.js");
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

    const { createServer } = await import("../server.js");
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

    const { createServer } = await import("../server.js");
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
    const { createServer } = await import("../server.js");
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
    const { createServer } = await import("../server.js");
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

    const { createServer } = await import("../server.js");
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
    mocks.getPluginDiagnosticsForDocument.mockResolvedValue([] as never);
    mocks.toLspDiagnostics.mockReturnValue([] as never);

    const { createServer } = await import("../server.js");
    createServer({
      diagnosticsMode: "plugin",
    });

    const changeHandler = mocks.documents.onDidChangeContent.mock.calls[0]?.[0] as
      | ((event: { document: { uri: string; getText(): string } }) => void)
      | undefined;
    const closeHandler = mocks.documents.onDidClose.mock.calls[0]?.[0] as
      | ((event: { document: { uri: string } }) => void)
      | undefined;

    const document = {
      uri: "file:///workspace/project/example.ts",
      getText: () => "/** @minimum 0 */",
    };

    changeHandler?.({ document });
    await Promise.resolve();
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
  });
});
