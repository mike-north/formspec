import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeFormSpecTextHash,
  type FormSpecAnalysisManifest,
  type FormSpecSemanticResponse,
} from "@formspec/analysis";
import {
  getPluginCompletionContextForDocument,
  getPluginHoverForDocument,
} from "../plugin-client.js";

describe("plugin-client", () => {
  const workspaces: string[] = [];
  const servers: net.Server[] = [];

  afterEach(async () => {
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
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "formspec-lsp-client-"));
    workspaces.push(workspaceRoot);
    const runtimeDirectory = path.join(workspaceRoot, ".cache", "formspec", "tooling");
    await fs.mkdir(runtimeDirectory, { recursive: true });
    const socketPath = path.join(os.tmpdir(), `formspec-plugin-client-${String(Date.now())}.sock`);
    const documentText = "/** @minimum :amount 0 */";

    const server = net.createServer((socket) => {
      socket.setEncoding("utf8");
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += String(chunk);
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) {
          return;
        }

        const payload = JSON.parse(buffer.slice(0, newlineIndex)) as { kind: string };
        const response: FormSpecSemanticResponse =
          payload.kind === "completion"
            ? {
                kind: "completion",
                sourceHash: computeFormSpecTextHash(documentText),
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
                    signatures: [],
                    tagHoverMarkdown: null,
                    targetHoverMarkdown: null,
                    argumentHoverMarkdown: null,
                  },
                },
              }
            : {
                kind: "hover",
                sourceHash: computeFormSpecTextHash(documentText),
                hover: {
                  kind: "target",
                  markdown: "Target for @minimum",
                },
              };
        socket.end(`${JSON.stringify(response)}\n`);
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    const manifest: FormSpecAnalysisManifest = {
      protocolVersion: 1,
      analysisSchemaVersion: 1,
      workspaceRoot,
      workspaceId: "test",
      endpoint: {
        kind: "unix-socket",
        address: socketPath,
      },
      typescriptVersion: "5.9.3",
      extensionFingerprint: "builtin",
      generation: 1,
      updatedAt: "2025-01-15T10:00:00.000Z",
    };
    await fs.writeFile(
      path.join(runtimeDirectory, "manifest.json"),
      `${JSON.stringify(manifest)}\n`
    );

    const completion = await getPluginCompletionContextForDocument(
      [workspaceRoot],
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
  });
});
