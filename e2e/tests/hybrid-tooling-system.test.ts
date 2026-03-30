import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { FORMSPEC_ANALYSIS_PROTOCOL_VERSION } from "../../packages/analysis/src/protocol.js";
import { getHoverAtOffset } from "../../packages/language-server/src/providers/hover.js";
import { getCompletionItemsAtOffset } from "../../packages/language-server/src/providers/completion.js";
import {
  getPluginDiagnosticsForDocument,
  toLspDiagnostics,
} from "../../packages/language-server/src/diagnostics.js";
import {
  getPluginCompletionContextForDocument,
  getPluginHoverForDocument,
} from "../../packages/language-server/src/plugin-client.js";
import { FormSpecPluginService } from "../../packages/ts-plugin/src/service.js";
import {
  getFormSpecWorkspaceRuntimePaths,
  type FormSpecWorkspaceRuntimePaths,
} from "../../packages/ts-plugin/src/workspace.js";
import { queryPluginSocket } from "../helpers/plugin-socket.js";

interface ProgramContext {
  readonly workspaceRoot: string;
  readonly filePath: string;
  readonly documentText: string;
  readonly program: ts.Program;
}

async function createProgramContext(sourceText: string): Promise<ProgramContext> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "formspec-hybrid-e2e-"));
  const filePath = path.join(workspaceRoot, "example.ts");
  await fs.writeFile(filePath, sourceText, "utf8");

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    strict: true,
  };

  return {
    workspaceRoot,
    filePath,
    documentText: sourceText,
    program: ts.createProgram([filePath], compilerOptions),
  };
}

describe("hybrid tooling system", () => {
  const workspaces: string[] = [];
  const services: FormSpecPluginService[] = [];

  afterEach(async () => {
    await Promise.all(services.map((service) => service.stop()));
    services.length = 0;

    await Promise.all(
      workspaces.map(async (workspaceRoot) => {
        await fs.rm(workspaceRoot, { recursive: true, force: true });
      })
    );
    workspaces.length = 0;
  });

  it("enriches target completions and hover through the plugin manifest and IPC channel", async () => {
    const source = `
      class Cart {
        /** @minimum :amount 0 */
        discount!: {
          amount: number;
          label: string;
        };
      }
    `;
    const context = await createProgramContext(source);
    workspaces.push(context.workspaceRoot);

    const service = new FormSpecPluginService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
    });
    services.push(service);
    await service.start();

    const targetOffset = context.documentText.indexOf("amount") + 2;

    const syntaxOnlyItems = getCompletionItemsAtOffset(context.documentText, targetOffset);
    expect(syntaxOnlyItems).toEqual([]);

    const semanticContext = await getPluginCompletionContextForDocument(
      [context.workspaceRoot],
      context.filePath,
      context.documentText,
      targetOffset
    );
    expect(semanticContext?.kind).toBe("target");
    if (semanticContext?.kind !== "target") {
      throw new Error("Expected plugin completion context for a target position");
    }

    expect(semanticContext.semantic.targetCompletions).toContain("amount");
    expect(semanticContext.semantic.targetCompletions).not.toContain("label");

    const completionItems = getCompletionItemsAtOffset(
      context.documentText,
      targetOffset,
      undefined,
      semanticContext
    );
    expect(completionItems.map((item) => item.label)).toEqual(["amount"]);

    const semanticHover = await getPluginHoverForDocument(
      [context.workspaceRoot],
      context.filePath,
      context.documentText,
      targetOffset
    );
    expect(semanticHover?.kind).toBe("target");
    expect(semanticHover?.markdown).toContain("**Target for @minimum**");
    expect(semanticHover?.markdown).toContain("Current target: `:amount`");

    const hover = getHoverAtOffset(context.documentText, targetOffset, undefined, semanticHover);
    expect(hover?.contents).toMatchObject({
      kind: "markdown",
    });
    expect(
      typeof hover?.contents === "object" && "value" in hover.contents ? hover.contents.value : ""
    ).toContain("Compatible path targets");

    const staleContext = await getPluginCompletionContextForDocument(
      [context.workspaceRoot],
      context.filePath,
      context.documentText.replace("0", "10"),
      targetOffset
    );
    expect(staleContext).toBeNull();
  });

  it("serves diagnostics over IPC for invalid path-targeted constraints", async () => {
    const source = `
      class Cart {
        /** @minimum :label 0 */
        discount!: {
          amount: number;
          label: string;
        };
      }
    `;
    const context = await createProgramContext(source);
    workspaces.push(context.workspaceRoot);

    const service = new FormSpecPluginService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
    });
    services.push(service);
    await service.start();

    const runtimePaths: FormSpecWorkspaceRuntimePaths = getFormSpecWorkspaceRuntimePaths(
      context.workspaceRoot
    );
    const response = await queryPluginSocket(runtimePaths.endpoint.address, {
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "diagnostics",
      filePath: context.filePath,
    });

    expect(response.kind).toBe("diagnostics");
    if (response.kind !== "diagnostics") {
      throw new Error(`Expected diagnostics response, got ${response.kind}`);
    }

    expect(response.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TYPE_MISMATCH",
          severity: "error",
        }),
      ])
    );

    const diagnostics = await getPluginDiagnosticsForDocument(
      [context.workspaceRoot],
      context.filePath,
      context.documentText
    );
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TYPE_MISMATCH",
          category: "type-compatibility",
        }),
      ])
    );

    const document = {
      uri: `file://${context.filePath}`,
      positionAt(offset: number) {
        const priorText = context.documentText.slice(0, offset);
        const lines = priorText.split("\n");
        return {
          line: lines.length - 1,
          character: lines.at(-1)?.length ?? 0,
        };
      },
    };
    const lspDiagnostics = toLspDiagnostics(document, diagnostics ?? [], {
      source: "formspec-reference",
    });
    expect(lspDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TYPE_MISMATCH",
          source: "formspec-reference",
        }),
      ])
    );
  });
});
