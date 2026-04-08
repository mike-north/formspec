import { describe, expect, it } from "vitest";
import {
  FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
  FORMSPEC_ANALYSIS_SCHEMA_VERSION,
  computeFormSpecTextHash,
  getCommentHoverInfoAtOffset,
  getSemanticCommentCompletionContextAtOffset,
  isFormSpecAnalysisManifest,
  isFormSpecSemanticQuery,
  isFormSpecSemanticResponse,
  serializeCompletionContext,
  serializeHoverInfo,
  type FormSpecAnalysisManifest,
  type FormSpecSerializedCompletionContext,
  type FormSpecSemanticResponse,
} from "../internal.js";
import { createProgram } from "./helpers.js";
import * as ts from "typescript";

describe("semantic protocol", () => {
  it("computes a deterministic text hash", () => {
    expect(computeFormSpecTextHash("/** @minimum 0 */")).toBe(
      computeFormSpecTextHash("/** @minimum 0 */")
    );
    expect(computeFormSpecTextHash("/** @minimum 0 */")).not.toBe(
      computeFormSpecTextHash("/** @minimum 1 */")
    );
  });

  it("accepts only manifests matching the current protocol version", () => {
    const manifest: FormSpecAnalysisManifest = {
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      analysisSchemaVersion: FORMSPEC_ANALYSIS_SCHEMA_VERSION,
      workspaceRoot: "/workspace/formspec",
      workspaceId: "workspace-id",
      endpoint: {
        kind: "unix-socket",
        address: "/tmp/formspec.sock",
      },
      typescriptVersion: "5.9.3",
      extensionFingerprint: "builtin",
      generation: 1,
      updatedAt: "2025-01-01T00:00:00.000Z",
    };

    expect(isFormSpecAnalysisManifest(manifest)).toBe(true);
    expect(
      isFormSpecAnalysisManifest({
        ...manifest,
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION + 1,
      })
    ).toBe(false);
  });

  it("accepts only recognized semantic query shapes", () => {
    expect(
      isFormSpecSemanticQuery({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "completion",
        filePath: "/workspace/formspec/example.ts",
        offset: 42,
      })
    ).toBe(true);

    expect(
      isFormSpecSemanticQuery({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "completion",
        filePath: "/workspace/formspec/example.ts",
      })
    ).toBe(false);

    expect(
      isFormSpecSemanticQuery({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "diagnostics",
      })
    ).toBe(false);

    expect(
      isFormSpecSemanticQuery({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "file-snapshot",
      })
    ).toBe(false);

    expect(
      isFormSpecSemanticQuery({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "bogus",
      })
    ).toBe(false);
  });

  it("accepts serialized completion responses and rejects malformed payloads", () => {
    const response: FormSpecSemanticResponse = {
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "completion",
      sourceHash: computeFormSpecTextHash("/** @minimum :amount 0 */"),
      context: {
        kind: "target",
        semantic: {
          tagName: "minimum",
          tagDefinition: null,
          placement: "class-field",
          contextualSignatures: [
            {
              label: "@minimum <number>",
              placements: ["class-field"],
            },
          ],
          supportedTargets: ["none", "path"],
          targetCompletions: ["amount"],
          compatiblePathTargets: ["amount"],
          valueLabels: ["<number>"],
          argumentCompletions: [],
          contextualTagHoverMarkdown: "**@minimum**",
          signatures: [
            {
              label: "@minimum :path <number>",
              placements: ["class-field"],
            },
          ],
          tagHoverMarkdown: null,
          targetHoverMarkdown: null,
          argumentHoverMarkdown: null,
        },
      },
    };

    expect(isFormSpecSemanticResponse(response)).toBe(true);
    const targetContext = response.context as Extract<
      FormSpecSerializedCompletionContext,
      { readonly kind: "target" }
    >;

    expect(
      isFormSpecSemanticResponse({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "completion",
        sourceHash: response.sourceHash,
        context: {
          kind: "target",
        },
      })
    ).toBe(false);

    expect(
      isFormSpecSemanticResponse({
        ...response,
        context: {
          kind: "target",
          semantic: {
            ...targetContext.semantic,
            placement: "banana",
          },
        },
      })
    ).toBe(false);

    expect(
      isFormSpecSemanticResponse({
        ...response,
        context: {
          kind: "target",
          semantic: {
            ...targetContext.semantic,
            supportedTargets: ["none", "banana"],
          },
        },
      })
    ).toBe(false);
  });

  it("rejects array payloads at the top-level object boundary", () => {
    expect(isFormSpecAnalysisManifest([])).toBe(false);
    expect(isFormSpecSemanticQuery([])).toBe(false);
    expect(isFormSpecSemanticResponse([])).toBe(false);
  });

  it("serializes completion contexts across tag-name and target variants", () => {
    const tagNameContext = serializeCompletionContext(
      getSemanticCommentCompletionContextAtOffset("/** @min */", 8)
    );
    const targetDocument = "/** @minimum : */";
    const targetContext = serializeCompletionContext(
      getSemanticCommentCompletionContextAtOffset(targetDocument, targetDocument.indexOf(":") + 1)
    );

    expect(tagNameContext.kind).toBe("tag-name");
    expect(targetContext.kind).toBe("target");
  });

  it("serializes argument contexts with local type-parameter completions", () => {
    const source = `
      /**
       * @discriminator :kind T
       */
      interface TaggedValue<T> {
        kind: string;
      }
    `;
    const { checker, sourceFile } = createProgram(source);
    const interfaceDeclaration = sourceFile.statements.find(ts.isInterfaceDeclaration);
    if (interfaceDeclaration === undefined) {
      throw new Error("Expected interface declaration");
    }
    const argumentOffset = source.indexOf("@discriminator :kind ") + "@discriminator :kind ".length;
    const context = serializeCompletionContext(
      getSemanticCommentCompletionContextAtOffset(source, argumentOffset, {
        placement: "interface",
        checker,
        subjectType: checker.getTypeAtLocation(interfaceDeclaration),
        declaration: interfaceDeclaration,
      })
    );

    expect(context.kind).toBe("argument");
    if (context.kind === "argument") {
      expect(context.semantic.argumentCompletions).toEqual(["T"]);
      expect(context.semantic.contextualSignatures).toEqual([
        {
          label: "@discriminator [:path] <typeParam>",
          placements: ["class", "interface", "type-alias"],
        },
      ]);
    }
  });

  it("serializes hover info and preserves null when nothing is hoverable", () => {
    expect(serializeHoverInfo(null)).toBeNull();

    const hover = getCommentHoverInfoAtOffset("/** @minimum 0 */", 7);
    expect(serializeHoverInfo(hover)).toEqual(
      expect.objectContaining({
        kind: "tag-name",
      })
    );
  });

  it("accepts diagnostics with structured white-label data and related locations", () => {
    expect(
      isFormSpecSemanticResponse({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "diagnostics",
        sourceHash: computeFormSpecTextHash("/** @minimum :amount 0 */"),
        diagnostics: [
          {
            code: "TYPE_MISMATCH",
            category: "type-compatibility",
            message: "Expected a numeric target",
            range: { start: 4, end: 12 },
            severity: "error",
            relatedLocations: [
              {
                filePath: "/workspace/formspec/example.ts",
                range: { start: 20, end: 28 },
                message: "Constraint target",
              },
            ],
            data: {
              tagName: "minimum",
              targetKind: "path",
              pathSegments: ["discount", "amount"],
            },
          },
        ],
      })
    ).toBe(true);

    expect(
      isFormSpecSemanticResponse({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "diagnostics",
        sourceHash: computeFormSpecTextHash("/** @minimum :amount 0 */"),
        diagnostics: [
          {
            code: "TYPE_MISMATCH",
            category: "banana",
            message: "bad",
            range: { start: 0, end: 1 },
            severity: "error",
            relatedLocations: [],
            data: {},
          },
        ],
      })
    ).toBe(false);

    expect(
      isFormSpecSemanticResponse({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "diagnostics",
        sourceHash: computeFormSpecTextHash("/** @minimum :amount 0 */"),
        diagnostics: [
          {
            code: "TYPE_MISMATCH",
            category: "type-compatibility",
            message: "bad",
            range: { start: 0, end: 1 },
            severity: "error",
            relatedLocations: [],
            data: {
              nested: {},
            },
          },
        ],
      })
    ).toBe(false);

    expect(
      isFormSpecSemanticResponse({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "diagnostics",
        sourceHash: computeFormSpecTextHash("/** @minimum :amount 0 */"),
        diagnostics: [
          {
            code: "TYPE_MISMATCH",
            category: "type-compatibility",
            message: "bad",
            range: { start: 0, end: 1 },
            severity: "error",
            relatedLocations: [
              {
                range: { start: 2, end: 3 },
              },
            ],
            data: {},
          },
        ],
      })
    ).toBe(false);
  });
});
