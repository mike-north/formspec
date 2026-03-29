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
  type FormSpecSemanticResponse,
} from "../internal.js";

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
          supportedTargets: ["none", "path"],
          targetCompletions: ["amount"],
          compatiblePathTargets: ["amount"],
          valueLabels: ["<number>"],
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
    if (response.kind !== "completion" || response.context.kind !== "target") {
      throw new Error("Expected a target completion response fixture");
    }

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
            ...response.context.semantic,
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
            ...response.context.semantic,
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

  it("serializes hover info and preserves null when nothing is hoverable", () => {
    expect(serializeHoverInfo(null)).toBeNull();

    const hover = getCommentHoverInfoAtOffset("/** @minimum 0 */", 7);
    expect(serializeHoverInfo(hover)).toEqual(
      expect.objectContaining({
        kind: "tag-name",
      })
    );
  });
});
