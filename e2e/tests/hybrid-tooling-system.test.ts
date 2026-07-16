import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
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

  it("discovers a nested-package manifest when the editor workspace root is the monorepo root (issue #555)", async () => {
    // Simulate a monorepo opened at the repo root, containing a file in a
    // nested package that owns its own tsconfig project. In a real editor,
    // tsserver writes the plugin manifest under
    // `info.project.getCurrentDirectory()` — the nested project directory —
    // while the LSP only learns the repo root as a workspace folder. Discovery
    // must reconcile the two by walking from the file up to the workspace root.
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "formspec-hybrid-monorepo-"));
    workspaces.push(repoRoot);

    const packageDir = path.join(repoRoot, "packages", "foo");
    const sourceDir = path.join(packageDir, "src");
    await fs.mkdir(sourceDir, { recursive: true });

    const source = `
      class Cart {
        /** @minimum :amount 0 */
        discount!: {
          amount: number;
          label: string;
        };
      }
    `;
    const filePath = path.join(sourceDir, "example.ts");
    await fs.writeFile(filePath, source, "utf8");

    const program = ts.createProgram([filePath], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      strict: true,
    });

    // The plugin advertises under the nested project directory (packages/foo),
    // mirroring tsserver's per-package project root — not the repo root.
    const service = new FormSpecPluginService({
      workspaceRoot: packageDir,
      typescriptVersion: ts.version,
      getProgram: () => program,
    });
    services.push(service);
    await service.start();

    const targetOffset = source.indexOf("amount") + 2;

    // The editor only knows the repo root as a workspace folder. Discovery
    // must walk from the nested file up to the repo root to find the manifest.
    const semanticContext = await getPluginCompletionContextForDocument(
      [repoRoot],
      filePath,
      source,
      targetOffset
    );
    expect(semanticContext?.kind).toBe("target");
    if (semanticContext?.kind !== "target") {
      throw new Error(
        "Expected the LSP to discover the nested-package manifest for a target position"
      );
    }
    expect(semanticContext.semantic.targetCompletions).toContain("amount");
    expect(semanticContext.semantic.targetCompletions).not.toContain("label");

    const completionItems = getCompletionItemsAtOffset(
      source,
      targetOffset,
      undefined,
      semanticContext
    );
    expect(completionItems.map((item) => item.label)).toEqual(["amount"]);

    const semanticHover = await getPluginHoverForDocument(
      [repoRoot],
      filePath,
      source,
      targetOffset
    );
    expect(semanticHover?.kind).toBe("target");
    expect(semanticHover?.markdown).toContain("**Target for @minimum**");
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

    const document = TextDocument.create(
      pathToFileURL(context.filePath).href,
      "typescript",
      1,
      context.documentText
    );
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
