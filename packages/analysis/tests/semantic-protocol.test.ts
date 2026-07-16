import { describe, expect, it } from "vitest";
import {
  FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
  FORMSPEC_ANALYSIS_SCHEMA_VERSION,
  buildFormSpecAnalysisFileSnapshot,
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
} from "../src/internal.js";
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

  it("accepts declaration hover payloads and declaration summaries in file snapshots", () => {
    expect(
      isFormSpecSemanticResponse({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "hover",
        sourceHash: "deadbeef",
        hover: {
          kind: "declaration",
          markdown: "**FormSpec Declaration Summary**",
        },
      })
    ).toBe(true);

    expect(
      isFormSpecSemanticResponse({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "file-snapshot",
        snapshot: {
          filePath: "/workspace/formspec/example.ts",
          sourceHash: "deadbeef",
          generatedAt: "2026-04-08T00:00:00.000Z",
          comments: [
            {
              commentSpan: { start: 0, end: 20 },
              declarationSpan: { start: 21, end: 40 },
              placement: "class-field",
              subjectType: "string",
              hostType: "Example",
              declarationSummary: {
                summaryText: "Example field",
                resolvedMetadata: {
                  displayName: {
                    value: "Example Field",
                    source: "explicit",
                  },
                },
                metadataEntries: [],
                facts: [
                  {
                    kind: "description",
                    value: "Example field",
                  },
                ],
                hoverMarkdown: "**FormSpec Declaration Summary**",
              },
              tags: [],
            },
          ],
          diagnostics: [],
        },
      })
    ).toBe(true);
  });

  it("rejects non-finite JSON payloads in declaration summary facts", () => {
    const source = `
      class Checkout {
        /**
         * Internal name
         * @defaultValue "demo"
         */
        name!: string;
      }
    `;
    const { checker, sourceFile } = createProgram(source);
    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

    expect(
      isFormSpecSemanticResponse({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "file-snapshot",
        snapshot,
      })
    ).toBe(true);

    const invalidSnapshot = {
      ...snapshot,
      comments: snapshot.comments.map((comment) => ({
        ...comment,
        declarationSummary: {
          ...comment.declarationSummary,
          facts: comment.declarationSummary.facts.map((fact) =>
            fact.kind === "default-value" ? { ...fact, value: Number.POSITIVE_INFINITY } : fact
          ),
        },
      })),
    };

    expect(
      isFormSpecSemanticResponse({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "file-snapshot",
        snapshot: invalidSnapshot,
      })
    ).toBe(false);
  });

  it("survives a JSON round-trip when a file contains @minimum Infinity (issue #513)", () => {
    // Regression for #513: before the fix, `@minimum Infinity` produced a
    // numeric-constraints fact carrying `minimum: Infinity`. JSON.stringify turns
    // Infinity into `null`, so isFiniteNumber(null) failed after the transport
    // round-trip and the language server discarded the ENTIRE file snapshot —
    // the user silently lost all FormSpec hover/completion/diagnostics for the file.
    //
    // After the fix, the non-finite value is a parse error: it yields NO constraint
    // fact (just an INVALID_NUMERIC_VALUE diagnostic), so the snapshot round-trips
    // cleanly and the file's other facts are retained.
    const source = `
      class Order {
        /** @minimum Infinity */
        badBound!: number;

        /** @maximum 100 */
        goodBound!: number;
      }
    `;
    const { checker, sourceFile } = createProgram(source);
    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

    const response: FormSpecSemanticResponse = {
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "file-snapshot",
      snapshot,
    };

    // Simulate the LSP transport: serialize to JSON and parse back.
    const roundTripped: unknown = JSON.parse(JSON.stringify(response));

    // The core regression assertion: the round-tripped snapshot is still a valid
    // semantic response (pre-fix this was `false` and the file snapshot was dropped).
    // Assert against the post-transport object so the test actually exercises the
    // round-trip — asserting against the pre-transport `snapshot` would be tautological.
    expect(isFormSpecSemanticResponse(roundTripped)).toBe(true);
    if (
      !isFormSpecSemanticResponse(roundTripped) ||
      roundTripped.kind !== "file-snapshot" ||
      roundTripped.snapshot === null
    ) {
      throw new Error("expected a non-null file-snapshot semantic response after round-trip");
    }
    const roundTrippedSnapshot = roundTripped.snapshot;

    // Every post-transport assertion targets the round-tripped snapshot, not the
    // in-memory one, so it can detect transport-induced data loss.
    // The invalid tag is reported rather than silently emitted.
    expect(roundTrippedSnapshot.diagnostics.some((d) => d.code === "INVALID_NUMERIC_VALUE")).toBe(
      true
    );

    // The file's other facts are not lost: the valid `@maximum 100` bound survives.
    const facts = roundTrippedSnapshot.comments.flatMap(
      (comment) => comment.declarationSummary.facts
    );
    const numericFact = facts.find((fact) => fact.kind === "numeric-constraints");
    expect(numericFact).toMatchObject({ maximum: 100 });

    // And no surviving numeric fact carries the non-finite bound.
    expect(
      facts.some((fact) => fact.kind === "numeric-constraints" && fact.minimum !== undefined)
    ).toBe(false);

    // Sanity-check that these assertions are meaningful: had the transport dropped
    // the `@maximum 100` fact (or corrupted it to a non-finite value the way the
    // pre-fix `@minimum Infinity` fact was), the guard would reject the response.
    const corrupted = {
      ...roundTripped,
      snapshot: {
        ...roundTrippedSnapshot,
        comments: roundTrippedSnapshot.comments.map((comment) => ({
          ...comment,
          declarationSummary: {
            ...comment.declarationSummary,
            facts: comment.declarationSummary.facts.map((fact) =>
              fact.kind === "numeric-constraints"
                ? { ...fact, maximum: Number.POSITIVE_INFINITY }
                : fact
            ),
          },
        })),
      },
    };
    expect(isFormSpecSemanticResponse(JSON.parse(JSON.stringify(corrupted)))).toBe(false);
  });

  it("rejects non-finite allowed-members declaration facts", () => {
    expect(
      isFormSpecSemanticResponse({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "file-snapshot",
        snapshot: {
          filePath: "/workspace/formspec/example.ts",
          sourceHash: "deadbeef",
          generatedAt: "2026-04-08T00:00:00.000Z",
          comments: [
            {
              commentSpan: { start: 0, end: 28 },
              declarationSpan: { start: 29, end: 45 },
              placement: "class-field",
              subjectType: "number",
              hostType: "Example",
              declarationSummary: {
                summaryText: "Allowed members",
                resolvedMetadata: null,
                metadataEntries: [],
                facts: [
                  {
                    kind: "allowed-members",
                    targetPath: null,
                    members: [1, Number.POSITIVE_INFINITY],
                  },
                ],
                hoverMarkdown: "**FormSpec Declaration Summary**",
              },
              tags: [],
            },
          ],
          diagnostics: [],
        },
      })
    ).toBe(false);
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
