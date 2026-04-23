import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeFormSpecTextHash,
  FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
  FORMSPEC_ANALYSIS_SCHEMA_VERSION,
  type FormSpecAnalysisManifest,
  type FormSpecSemanticResponse,
} from "@formspec/analysis";
import {
  getPluginCompletionContextForDocument,
  getPluginDiagnosticsForDocument,
  getPluginHoverForDocument,
} from "../src/plugin-client.js";

async function createWorkspaceRoot(workspaces: string[]): Promise<string> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "formspec-lsp-client-"));
  workspaces.push(workspaceRoot);
  await fs.mkdir(path.join(workspaceRoot, ".cache", "formspec", "tooling"), { recursive: true });
  return workspaceRoot;
}

async function writeManifest(
  workspaceRoot: string,
  manifest: FormSpecAnalysisManifest
): Promise<void> {
  await fs.writeFile(
    path.join(workspaceRoot, ".cache", "formspec", "tooling", "manifest.json"),
    `${JSON.stringify(manifest)}\n`
  );
}

function createManifest(
  workspaceRoot: string,
  address: string,
  overrides: Partial<FormSpecAnalysisManifest> = {}
): FormSpecAnalysisManifest {
  return {
    protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
    analysisSchemaVersion: FORMSPEC_ANALYSIS_SCHEMA_VERSION,
    workspaceRoot,
    workspaceId: "test",
    endpoint: {
      kind: "unix-socket",
      address,
    },
    typescriptVersion: "5.9.3",
    extensionFingerprint: "builtin",
    generation: 1,
    updatedAt: "2025-01-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("plugin-client", () => {
  const workspaces: string[] = [];
  const servers: net.Server[] = [];
  const sockets: net.Socket[] = [];

  afterEach(async () => {
    sockets.forEach((socket) => {
      socket.destroy();
    });
    sockets.length = 0;

    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error === undefined) {
                resolve();
                return;
              }
              reject(error);
            });
          })
      )
    );
    servers.length = 0;

    await Promise.all(
      workspaces.map(async (workspaceRoot) => {
        await fs.rm(workspaceRoot, { recursive: true, force: true });
      })
    );
    workspaces.length = 0;
  });

  it("uses the plugin manifest and only trusts responses whose source hash matches", async () => {
    const workspaceRoot = await createWorkspaceRoot(workspaces);
    const socketPath = path.join(os.tmpdir(), `formspec-plugin-client-${String(Date.now())}.sock`);
    const documentText = "/** @minimum :amount 0 */";

    const server = net.createServer((socket) => {
      sockets.push(socket);
      socket.setEncoding("utf8");
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += String(chunk);
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) {
          return;
        }

        const payload = JSON.parse(buffer.slice(0, newlineIndex)) as { kind: string };
        let response: FormSpecSemanticResponse;
        if (payload.kind === "completion") {
          response = {
            protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
            kind: "completion",
            sourceHash: computeFormSpecTextHash(documentText),
            context: {
              kind: "target",
              semantic: {
                tagName: "minimum",
                tagDefinition: null,
                placement: "class-field",
                contextualSignatures: [],
                supportedTargets: ["none", "path"],
                targetCompletions: ["amount"],
                compatiblePathTargets: ["amount"],
                valueLabels: ["<number>"],
                argumentCompletions: [],
                contextualTagHoverMarkdown: null,
                signatures: [],
                tagHoverMarkdown: null,
                targetHoverMarkdown: null,
                argumentHoverMarkdown: null,
              },
            },
          };
        } else if (payload.kind === "hover") {
          response = {
            protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
            kind: "hover",
            sourceHash: computeFormSpecTextHash(documentText),
            hover: {
              kind: "target",
              markdown: "Target for @minimum",
            },
          };
        } else {
          response = {
            protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
            kind: "diagnostics",
            sourceHash: computeFormSpecTextHash(documentText),
            diagnostics: [
              {
                code: "TYPE_MISMATCH",
                category: "type-compatibility",
                message: "Expected a number-compatible target",
                range: { start: 4, end: 12 },
                severity: "error",
                relatedLocations: [],
                data: {
                  tagName: "minimum",
                },
              },
            ],
          };
        }
        socket.end(`${JSON.stringify(response)}\n`);
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    await writeManifest(workspaceRoot, createManifest(workspaceRoot, socketPath));

    const completion = await getPluginCompletionContextForDocument(
      [`${workspaceRoot}${path.sep}`],
      path.join(workspaceRoot, "example.ts"),
      documentText,
      documentText.indexOf("amount") + 2
    );
    expect(completion?.kind).toBe("target");
    if (completion?.kind === "target") {
      expect(completion.semantic.targetCompletions).toEqual(["amount"]);
    }

    const hover = await getPluginHoverForDocument(
      [workspaceRoot],
      path.join(workspaceRoot, "example.ts"),
      documentText,
      documentText.indexOf("@minimum") + 2
    );
    expect(hover?.markdown).toContain("Target for @minimum");

    const staleCompletion = await getPluginCompletionContextForDocument(
      [workspaceRoot],
      path.join(workspaceRoot, "example.ts"),
      "/** @minimum :amount 10 */",
      documentText.indexOf("amount") + 2
    );
    expect(staleCompletion).toBeNull();

    const diagnostics = await getPluginDiagnosticsForDocument(
      [workspaceRoot],
      path.join(workspaceRoot, "example.ts"),
      documentText
    );
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TYPE_MISMATCH",
          category: "type-compatibility",
        }),
      ])
    );
  });

  it("returns null when no manifest exists for the workspace yet", async () => {
    const workspaceRoot = await createWorkspaceRoot(workspaces);
    await fs.rm(path.join(workspaceRoot, ".cache", "formspec", "tooling", "manifest.json"), {
      force: true,
    });

    const completion = await getPluginCompletionContextForDocument(
      [workspaceRoot],
      path.join(workspaceRoot, "example.ts"),
      "/** @minimum 0 */",
      7
    );

    expect(completion).toBeNull();
  });

  it("returns null when the manifest payload fails protocol validation", async () => {
    const workspaceRoot = await createWorkspaceRoot(workspaces);
    await writeManifest(
      workspaceRoot,
      createManifest(workspaceRoot, path.join(os.tmpdir(), "unused.sock"), {
        protocolVersion: (FORMSPEC_ANALYSIS_PROTOCOL_VERSION +
          1) as typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      })
    );

    const hover = await getPluginHoverForDocument(
      [workspaceRoot],
      path.join(workspaceRoot, "example.ts"),
      "/** @minimum 0 */",
      7
    );

    expect(hover).toBeNull();
  });

  it("returns null when the plugin socket is unavailable", async () => {
    const workspaceRoot = await createWorkspaceRoot(workspaces);
    const socketPath = path.join(os.tmpdir(), `formspec-plugin-missing-${String(Date.now())}.sock`);
    await writeManifest(workspaceRoot, createManifest(workspaceRoot, socketPath));

    const completion = await getPluginCompletionContextForDocument(
      [workspaceRoot],
      path.join(workspaceRoot, "example.ts"),
      "/** @minimum 0 */",
      7,
      50
    );

    expect(completion).toBeNull();
  });

  it("returns null when the plugin responds with an error payload", async () => {
    const workspaceRoot = await createWorkspaceRoot(workspaces);
    const socketPath = path.join(os.tmpdir(), `formspec-plugin-error-${String(Date.now())}.sock`);

    const server = net.createServer((socket) => {
      sockets.push(socket);
      socket.end(
        `${JSON.stringify({
          protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
          kind: "error",
          error: "plugin unavailable",
        } satisfies FormSpecSemanticResponse)}\n`
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    await writeManifest(workspaceRoot, createManifest(workspaceRoot, socketPath));

    const completion = await getPluginCompletionContextForDocument(
      [workspaceRoot],
      path.join(workspaceRoot, "example.ts"),
      "/** @minimum 0 */",
      7
    );

    expect(completion).toBeNull();
  });

  it("returns null for stale plugin diagnostics just like completion and hover", async () => {
    const workspaceRoot = await createWorkspaceRoot(workspaces);
    const socketPath = path.join(
      os.tmpdir(),
      `formspec-plugin-diagnostics-${String(Date.now())}.sock`
    );

    const server = net.createServer((socket) => {
      sockets.push(socket);
      socket.end(
        `${JSON.stringify({
          protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
          kind: "diagnostics",
          sourceHash: computeFormSpecTextHash("/** @minimum 0 */"),
          diagnostics: [],
        } satisfies FormSpecSemanticResponse)}\n`
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    await writeManifest(workspaceRoot, createManifest(workspaceRoot, socketPath));

    const diagnostics = await getPluginDiagnosticsForDocument(
      [workspaceRoot],
      path.join(workspaceRoot, "example.ts"),
      "/** @minimum 1 */"
    );

    expect(diagnostics).toBeNull();
  });
});
