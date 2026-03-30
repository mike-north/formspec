import { describe, expect, it, vi } from "vitest";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { DiagnosticSeverity } from "vscode-languageserver/node.js";
import { toLspDiagnostics } from "../diagnostics.js";

describe("toLspDiagnostics", () => {
  it("preserves ranges, severity, code, related info, and diagnostic data", () => {
    const document = {
      uri: "file:///workspace/example.ts",
      positionAt: vi.fn((offset: number) => ({ line: 0, character: offset })),
    } as unknown as TextDocument;

    const [diagnostic] = toLspDiagnostics(
      document,
      [
        {
          code: "TYPE_MISMATCH",
          category: "type-compatibility",
          message: "Expected a numeric target",
          range: { start: 4, end: 12 },
          severity: "error",
          relatedLocations: [
            {
              filePath: "/workspace/example.ts",
              range: { start: 20, end: 28 },
              message: "Constraint target",
            },
          ],
          data: {
            tagName: "minimum",
            targetKind: "path",
          },
        },
      ],
      {
        source: "white-label",
      }
    );

    expect(diagnostic).toMatchObject({
      severity: DiagnosticSeverity.Error,
      source: "white-label",
      code: "TYPE_MISMATCH",
      message: "Expected a numeric target",
      data: {
        category: "type-compatibility",
        tagName: "minimum",
        targetKind: "path",
      },
    });
    expect(diagnostic?.range).toEqual({
      start: { line: 0, character: 4 },
      end: { line: 0, character: 12 },
    });
    expect(diagnostic?.relatedInformation?.[0]?.message).toBe("Constraint target");
    expect(diagnostic?.relatedInformation?.[0]?.location.uri).toBe("file:///workspace/example.ts");
  });

  it("returns an empty array for empty diagnostic input", () => {
    const document = {
      uri: "file:///workspace/example.ts",
      positionAt: vi.fn((offset: number) => ({ line: 0, character: offset })),
    } as unknown as TextDocument;

    expect(toLspDiagnostics(document, [])).toEqual([]);
  });

  it("maps warning and info severities and omits relatedInformation when absent", () => {
    const document = {
      uri: "file:///workspace/example.ts",
      positionAt: vi.fn((offset: number) => ({ line: 0, character: offset })),
    } as unknown as TextDocument;

    const diagnostics = toLspDiagnostics(document, [
      {
        code: "UNKNOWN_PATH_TARGET",
        category: "target-resolution",
        message: "bad target",
        range: { start: 0, end: 1 },
        severity: "warning",
        relatedLocations: [],
        data: {},
      },
      {
        code: "MISSING_SOURCE_FILE",
        category: "infrastructure",
        message: "missing source",
        range: { start: 2, end: 3 },
        severity: "info",
        relatedLocations: [],
        data: {},
      },
    ]);

    expect(diagnostics[0]?.severity).toBe(DiagnosticSeverity.Warning);
    expect(diagnostics[0]?.relatedInformation).toBeUndefined();
    expect(diagnostics[1]?.severity).toBe(DiagnosticSeverity.Information);
  });

  it("drops cross-file related locations and falls back on the default related message", () => {
    const document = {
      uri: "file:///workspace/example.ts",
      positionAt: vi.fn((offset: number) => ({ line: 0, character: offset })),
    } as unknown as TextDocument;

    const [diagnostic] = toLspDiagnostics(document, [
      {
        code: "TYPE_MISMATCH",
        category: "type-compatibility",
        message: "bad target",
        range: { start: 0, end: 1 },
        severity: "error",
        relatedLocations: [
          {
            filePath: "/workspace/example.ts",
            range: { start: 4, end: 5 },
          },
          {
            filePath: "/workspace/other.ts",
            range: { start: 8, end: 9 },
            message: "other file",
          },
        ],
        data: {},
      },
    ]);

    expect(diagnostic?.relatedInformation).toHaveLength(1);
    expect(diagnostic?.relatedInformation?.[0]?.message).toBe("Related FormSpec location");
  });
  it("keeps the canonical diagnostic category when data also contains a category key", () => {
    const document = {
      uri: "file:///workspace/example.ts",
      positionAt: vi.fn((offset: number) => ({ line: 0, character: offset })),
    } as unknown as TextDocument;

    const [diagnostic] = toLspDiagnostics(document, [
      {
        code: "TYPE_MISMATCH",
        category: "type-compatibility",
        message: "bad target",
        range: { start: 0, end: 1 },
        severity: "error",
        relatedLocations: [],
        data: {
          category: "user-overridden",
          tagName: "minimum",
        },
      },
    ]);

    expect(diagnostic?.data).toEqual({
      category: "type-compatibility",
      tagName: "minimum",
    });
  });
});
