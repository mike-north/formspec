import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import * as ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FORMSPEC_ANALYSIS_PROTOCOL_VERSION } from "@formspec/analysis/protocol";
import { createLanguageServiceProxy, FormSpecPluginService } from "../service.js";
import { getFormSpecWorkspaceRuntimePaths } from "../workspace.js";
import {
  createProgramContext,
  expectErrorResponse,
  FORM_SPEC_PLUGIN_TEST_SOCKET_TIMEOUT_MS,
} from "./helpers.js";

async function querySocket(address: string, payload: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(address);
    let buffer = "";

    socket.setEncoding("utf8");
    socket.setTimeout(FORM_SPEC_PLUGIN_TEST_SOCKET_TIMEOUT_MS, () => {
      socket.destroy(new Error(`Timed out waiting for FormSpec plugin response from ${address}`));
    });
    socket.on("connect", () => {
      socket.write(`${JSON.stringify(payload)}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += String(chunk);
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }

      socket.end();
      resolve(JSON.parse(buffer.slice(0, newlineIndex)));
    });
    socket.on("error", reject);
  });
}

function createLanguageService(sourceText: string) {
  const fileName = "/virtual/formspec.ts";
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    strict: true,
  };

  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => "/virtual",
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    getScriptFileNames: () => [fileName],
    getScriptSnapshot: (requestedFileName: string) =>
      requestedFileName === fileName ? ts.ScriptSnapshot.fromString(sourceText) : undefined,
    getScriptVersion: () => "0",
    readFile: (requestedFileName: string) => ts.sys.readFile(requestedFileName),
    readDirectory: (
      rootDir: string,
      extensions?: readonly string[],
      excludes?: readonly string[],
      includes?: readonly string[],
      depth?: number
    ) => ts.sys.readDirectory(rootDir, extensions, excludes, includes, depth),
    fileExists: (requestedFileName: string) => ts.sys.fileExists(requestedFileName),
  };

  return {
    fileName,
    service: ts.createLanguageService(host),
  };
}

describe("FormSpecPluginService", () => {
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

  it("writes a manifest and responds over IPC", async () => {
    const source = `
      class Foo {
        /** @minimum 0 */
        value!: number;
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

    const runtimePaths = getFormSpecWorkspaceRuntimePaths(context.workspaceRoot);
    const manifestText = await fs.readFile(runtimePaths.manifestPath, "utf8");
    expect(manifestText).toContain('"protocolVersion": 1');

    const response = await querySocket(runtimePaths.endpoint.address, {
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "health",
    });
    expect(response).toMatchObject({
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "health",
      manifest: {
        workspaceRoot: context.workspaceRoot,
      },
    });
  });

  it("removes the manifest when the service stops", async () => {
    const context = await createProgramContext("class Foo {}");
    workspaces.push(context.workspaceRoot);
    const service = new FormSpecPluginService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
    });

    await service.start();

    const runtimePaths = getFormSpecWorkspaceRuntimePaths(context.workspaceRoot);
    await fs.access(runtimePaths.manifestPath);
    await service.stop();

    await expect(fs.access(runtimePaths.manifestPath)).rejects.toBeDefined();
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

  it("logs performance hotspots when profiling is enabled", async () => {
    const source = `
      class Foo {
        /** @minimum :title 0 */
        value!: {
          amount: number;
          title: string;
        };
      }
    `;
    const context = await createProgramContext(source);
    workspaces.push(context.workspaceRoot);
    const logger = {
      info: vi.fn(),
    };
    const service = new FormSpecPluginService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
      logger,
      enablePerformanceLogging: true,
      performanceLogThresholdMs: 0,
    });
    services.push(service);

    service.handleQuery({
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "diagnostics",
      filePath: context.filePath,
    });

    const loggedOutput = logger.info.mock.calls.map(([message]) => String(message)).join("\n");
    expect(loggedOutput).toContain("[FormSpec][perf]");
    expect(loggedOutput).toMatch(/\d+\.\d+ms plugin\.handleQuery/);
    expect(loggedOutput).toContain("plugin.getFileSnapshot");
    expect(loggedOutput).toContain("analysis.buildFileSnapshot");
    expect(loggedOutput).toContain("analysis.syntheticCheckBatch.createProgram");
    expect(loggedOutput).toContain("analysis.syntheticCheckBatch.getPreEmitDiagnostics");
  });

  it("does not log performance hotspots below the configured threshold", () => {
    const logger = {
      info: vi.fn(),
    };
    const service = new FormSpecPluginService({
      workspaceRoot: "/workspace/formspec",
      typescriptVersion: ts.version,
      getProgram: () => undefined,
      logger,
      enablePerformanceLogging: true,
      performanceLogThresholdMs: Number.POSITIVE_INFINITY,
    });

    service.handleQuery({
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "health",
    });

    expect(logger.info).not.toHaveBeenCalled();
  });

  it("returns error responses for completion and hover when no program is available", () => {
    const service = new FormSpecPluginService({
      workspaceRoot: "/workspace/formspec",
      typescriptVersion: ts.version,
      getProgram: () => undefined,
    });

    const completion = service.handleQuery({
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "completion",
      filePath: "/workspace/formspec/example.ts",
      offset: 0,
    });
    expectErrorResponse(completion, "Unable to resolve TypeScript source file");

    const hover = service.handleQuery({
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "hover",
      filePath: "/workspace/formspec/example.ts",
      offset: 0,
    });
    expectErrorResponse(hover, "Unable to resolve TypeScript source file");
  });

  it("returns missing-source snapshots when the file is not in the current program", async () => {
    const context = await createProgramContext("class Foo {}");
    workspaces.push(context.workspaceRoot);
    const missingFilePath = path.join(context.workspaceRoot, "missing.ts");
    const service = new FormSpecPluginService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
    });
    services.push(service);

    const diagnostics = service.handleQuery({
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "diagnostics",
      filePath: missingFilePath,
    });
    expect(diagnostics).toMatchObject({
      kind: "diagnostics",
      diagnostics: [
        expect.objectContaining({
          code: "MISSING_SOURCE_FILE",
          severity: "warning",
        }),
      ],
    });

    const snapshot = service.handleQuery({
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "file-snapshot",
      filePath: missingFilePath,
    });
    expect(snapshot.kind).toBe("file-snapshot");
    if (snapshot.kind === "file-snapshot") {
      expect(snapshot.snapshot?.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "MISSING_SOURCE_FILE",
          }),
        ])
      );
    }
  });
});

describe("createLanguageServiceProxy", () => {
  it("refreshes snapshots for the wrapped semantic entry points and delegates other methods", () => {
    const scheduleSnapshotRefresh = vi.fn();
    const getSemanticDiagnostics = vi.fn(() => ["diag"]);
    const getCompletionsAtPosition = vi.fn(() => ({ entries: [] }));
    const getQuickInfoAtPosition = vi.fn(() => ({
      kind: "text",
      kindModifiers: "",
      textSpan: { start: 0, length: 1 },
      displayParts: [],
      documentation: [],
    }));
    const dispose = vi.fn(() => "disposed");

    const proxy = createLanguageServiceProxy(
      {
        getSemanticDiagnostics,
        getCompletionsAtPosition,
        getQuickInfoAtPosition,
        dispose,
      } as unknown as ts.LanguageService,
      {
        scheduleSnapshotRefresh,
      } as unknown as FormSpecPluginService
    );

    expect(proxy.getSemanticDiagnostics("example.ts")).toEqual(["diag"]);
    expect(proxy.getCompletionsAtPosition("example.ts", 4, undefined)).toEqual({ entries: [] });
    expect(proxy.getQuickInfoAtPosition("example.ts", 4)).toMatchObject({ kind: "text" });
    const proxyWithTypedDispose = proxy as typeof proxy & { dispose(): string };
    proxyWithTypedDispose.dispose();
    expect(dispose).toHaveReturnedWith("disposed");

    expect(scheduleSnapshotRefresh).toHaveBeenNthCalledWith(1, "example.ts");
    expect(scheduleSnapshotRefresh).toHaveBeenNthCalledWith(2, "example.ts");
    expect(scheduleSnapshotRefresh).toHaveBeenNthCalledWith(3, "example.ts");
    expect(scheduleSnapshotRefresh).toHaveBeenCalledTimes(3);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("works against a real TypeScript language service", () => {
    const scheduleSnapshotRefresh = vi.fn();
    const { fileName, service } = createLanguageService("const value = 1;\nvalue;\n");
    const proxy = createLanguageServiceProxy(service, {
      scheduleSnapshotRefresh,
    } as unknown as FormSpecPluginService);

    expect(proxy.getSemanticDiagnostics(fileName)).toEqual([]);
    expect(proxy.getQuickInfoAtPosition(fileName, 19)).not.toBeNull();
    expect(scheduleSnapshotRefresh).toHaveBeenCalledWith(fileName);
  });
});
