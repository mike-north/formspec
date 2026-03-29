import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { FORMSPEC_ANALYSIS_PROTOCOL_VERSION } from "@formspec/analysis/protocol";
import { FormSpecPluginService } from "../service.js";

async function createProgramContext(sourceText: string) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "formspec-handle-query-"));
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
    program: ts.createProgram([filePath], compilerOptions),
  };
}

function expectErrorResponse(
  response: ReturnType<FormSpecPluginService["handleQuery"]>,
  fragment: string
): void {
  expect(response.kind).toBe("error");
  if (response.kind !== "error") {
    throw new Error("Expected an error response");
  }
  expect(response.error).toContain(fragment);
}

describe("FormSpecPluginService.handleQuery", () => {
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

  it("serves semantic completion and hover queries from the host program", async () => {
    const source = `
      class Foo {
        /** @minimum :amount 0 */
        value!: {
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

    const completion = service.handleQuery({
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "completion",
      filePath: context.filePath,
      offset: source.indexOf("amount") + 2,
    });
    expect(completion.kind).toBe("completion");
    if (completion.kind === "completion") {
      expect(completion.context.kind).toBe("target");
      if (completion.context.kind === "target") {
        expect(completion.context.semantic.targetCompletions).toContain("amount");
        expect(completion.context.semantic.targetCompletions).not.toContain("label");
      }
    }

    const hover = service.handleQuery({
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "hover",
      filePath: context.filePath,
      offset: source.indexOf("@minimum") + 3,
    });
    expect(hover.kind).toBe("hover");
    if (hover.kind === "hover") {
      expect(hover.hover?.markdown).toContain("@minimum");
    }
  });

  it("serves diagnostics and file snapshots for invalid tagged comments", async () => {
    const source = `
      class Foo {
        /** @minimum :label 0 */
        value!: {
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

    const diagnostics = service.handleQuery({
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "diagnostics",
      filePath: context.filePath,
    });
    expect(diagnostics.kind).toBe("diagnostics");
    if (diagnostics.kind === "diagnostics") {
      expect(diagnostics.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "TYPE_MISMATCH",
            severity: "error",
          }),
        ])
      );
    }

    const snapshot = service.handleQuery({
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "file-snapshot",
      filePath: context.filePath,
    });
    expect(snapshot.kind).toBe("file-snapshot");
    if (snapshot.kind === "file-snapshot") {
      expect(snapshot.snapshot).not.toBeNull();
      if (snapshot.snapshot === null) {
        throw new Error("Expected a file snapshot result");
      }
      expect(snapshot.snapshot.comments).toHaveLength(1);
      const firstComment = snapshot.snapshot.comments[0];
      if (firstComment === undefined) {
        throw new Error("Expected the first comment snapshot");
      }
      expect(firstComment.tags).toHaveLength(1);
      const firstTag = firstComment.tags[0];
      if (firstTag === undefined) {
        throw new Error("Expected the first tag snapshot");
      }
      expect(firstTag.semantic.tagName).toBe("minimum");
    }
  }, 10_000);

  it("returns error or missing-source results when the program cannot resolve the file", async () => {
    const serviceWithoutProgram = new FormSpecPluginService({
      workspaceRoot: "/workspace/formspec",
      typescriptVersion: ts.version,
      getProgram: () => undefined,
    });

    expectErrorResponse(
      serviceWithoutProgram.handleQuery({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "completion",
        filePath: "/workspace/formspec/example.ts",
        offset: 0,
      }),
      "Unable to resolve TypeScript source file"
    );

    const context = await createProgramContext("class Foo {}");
    workspaces.push(context.workspaceRoot);
    const missingFilePath = path.join(context.workspaceRoot, "missing.ts");
    const service = new FormSpecPluginService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
    });
    services.push(service);

    expect(
      service.handleQuery({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "diagnostics",
        filePath: missingFilePath,
      })
    ).toMatchObject({
      kind: "diagnostics",
      diagnostics: [
        expect.objectContaining({
          code: "MISSING_SOURCE_FILE",
          severity: "warning",
        }),
      ],
    });
  });
});
