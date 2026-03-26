import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineConstraintTag, defineExtension } from "@formspec/core";

const mocks = vi.hoisted(() => {
  const connection = {
    onInitialize: vi.fn(),
    onCompletion: vi.fn(),
    onHover: vi.fn(),
    onDefinition: vi.fn(),
  };

  return {
    connection,
    getCompletionItems: vi.fn(() => []),
    getHoverForTag: vi.fn(() => null),
    getDefinition: vi.fn(() => null),
  };
});

vi.mock("vscode-languageserver/node.js", () => ({
  createConnection: vi.fn(() => mocks.connection),
  ProposedFeatures: { all: {} },
  TextDocumentSyncKind: { Incremental: 2 },
}));

vi.mock("../providers/completion.js", () => ({
  getCompletionItems: mocks.getCompletionItems,
}));

vi.mock("../providers/hover.js", () => ({
  getHoverForTag: mocks.getHoverForTag,
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
    createServer({ extensions: [extension] });

    const completionRegistration = mocks.connection.onCompletion.mock.calls[0];
    const hoverRegistration = mocks.connection.onHover.mock.calls[0];
    const completionHandler =
      typeof completionRegistration?.[0] === "function"
        ? (completionRegistration[0] as () => unknown)
        : undefined;
    const hoverHandler =
      typeof hoverRegistration?.[0] === "function"
        ? (hoverRegistration[0] as (_params: unknown) => unknown)
        : undefined;

    expect(typeof completionHandler).toBe("function");
    expect(typeof hoverHandler).toBe("function");

    completionHandler?.();
    hoverHandler?.({});

    expect(mocks.getCompletionItems).toHaveBeenCalledWith([extension]);
    expect(mocks.getHoverForTag).toHaveBeenCalledWith("", [extension]);
  });
});
