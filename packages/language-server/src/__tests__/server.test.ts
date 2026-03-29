import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineConstraintTag, defineExtension } from "@formspec/core";

const mocks = vi.hoisted(() => {
  const connection = {
    onInitialize: vi.fn(),
    onCompletion: vi.fn(),
    onHover: vi.fn(),
    onDefinition: vi.fn(),
  };
  const documents = {
    listen: vi.fn(),
    get: vi.fn(),
  };
  const textDocuments = vi.fn(() => documents);

  return {
    connection,
    documents,
    textDocuments,
    getCompletionItemsAtOffset: vi.fn(() => []),
    getHoverAtOffset: vi.fn(() => null),
    getDefinition: vi.fn(() => null),
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

describe("createServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
