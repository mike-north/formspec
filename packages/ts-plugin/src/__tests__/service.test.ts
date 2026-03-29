import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import * as ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { FORMSPEC_ANALYSIS_PROTOCOL_VERSION } from "@formspec/analysis";
import { FormSpecPluginService } from "../service.js";
import { getFormSpecWorkspaceRuntimePaths } from "../workspace.js";

async function createProgramContext(sourceText: string) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "formspec-ts-plugin-"));
  const filePath = path.join(workspaceRoot, "example.ts");
  await fs.writeFile(filePath, sourceText, "utf8");

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    strict: true,
  };
  const program = ts.createProgram([filePath], compilerOptions);

  return {
    workspaceRoot,
    filePath,
    program,
  };
}

async function querySocket(address: string, payload: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(address);
    let buffer = "";

    socket.setEncoding("utf8");
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
});
