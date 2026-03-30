import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
  isFormSpecAnalysisManifest,
  type FormSpecAnalysisManifest,
} from "../../packages/analysis/src/protocol.js";
import {
  getFormSpecWorkspaceRuntimePaths,
  type FormSpecWorkspaceRuntimePaths,
} from "../../packages/ts-plugin/src/workspace.js";
import { queryPluginSocket } from "../helpers/plugin-socket.js";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tsserverPath = require.resolve("typescript/lib/tsserver.js");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const FORM_SPEC_TSSERVER_TIMEOUT_MS = 10_000;
const FORM_SPEC_TSSERVER_REQUEST_TIMEOUT_MS = 5_000;
const FORM_SPEC_TSSERVER_CLOSE_TIMEOUT_MS = 2_000;

// Build the runtime artifacts at most once per test process.
let buildRuntimePromise: Promise<void> | undefined;

async function ensureTsServerPluginRuntimeBuilt(): Promise<void> {
  const analysisRuntime = path.join(repoRoot, "packages/analysis/dist/protocol.js");
  const pluginRuntime = path.join(repoRoot, "packages/ts-plugin/dist/index.cjs");
  const runtimesPresent = await Promise.all(
    [analysisRuntime, pluginRuntime].map(async (runtimePath) => {
      try {
        await fs.access(runtimePath);
        return true;
      } catch {
        return false;
      }
    })
  );
  if (runtimesPresent.every(Boolean)) {
    return;
  }

  buildRuntimePromise ??= (async () => {
    await execFileAsync(pnpmCommand, ["--filter", "@formspec/analysis", "run", "build"], {
      cwd: repoRoot,
    });
    await execFileAsync(pnpmCommand, ["--filter", "@formspec/ts-plugin", "run", "build"], {
      cwd: repoRoot,
    });
  })();

  await buildRuntimePromise;
}

async function waitForManifest(
  manifestPath: string,
  timeoutMs: number
): Promise<FormSpecAnalysisManifest> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const rawManifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown;
      if (isFormSpecAnalysisManifest(rawManifest)) {
        return rawManifest;
      }
    } catch {
      // The manifest may not exist yet or may still be mid-write.
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for FormSpec manifest at ${manifestPath}`);
}

class TsServerClient {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<
    number,
    {
      readonly resolve: (value: unknown) => void;
      readonly reject: (error: Error) => void;
    }
  >();
  private readonly stderrChunks: string[] = [];
  private readonly stdoutChunks: string[] = [];
  private buffer = "";
  private nextSequence = 0;

  public constructor() {
    this.process = spawn(process.execPath, [tsserverPath, "--disableAutomaticTypingAcquisition"], {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout.setEncoding("utf8");
    this.process.stdout.on("data", (chunk) => {
      this.stdoutChunks.push(String(chunk));
      this.buffer += String(chunk);
      this.drainMessages();
    });

    this.process.stderr.setEncoding("utf8");
    this.process.stderr.on("data", (chunk) => {
      this.stderrChunks.push(String(chunk));
    });

    this.process.once("exit", (code, signal) => {
      const error = new Error(
        `tsserver exited before the test finished (code=${String(code)}, signal=${String(signal)})\n` +
          `stderr:\n${this.stderrChunks.join("")}\nstdout:\n${this.stdoutChunks.join("")}`
      );
      for (const pendingRequest of this.pending.values()) {
        pendingRequest.reject(error);
      }
      this.pending.clear();
    });
  }

  public notify(command: string, arguments_: object): void {
    this.send({
      seq: ++this.nextSequence,
      type: "request",
      command,
      arguments: arguments_,
    });
  }

  public async request<TResponse>(command: string, arguments_: object): Promise<TResponse> {
    const seq = ++this.nextSequence;
    const responsePromise = new Promise<TResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`Timed out waiting for tsserver response to ${command}`));
      }, FORM_SPEC_TSSERVER_REQUEST_TIMEOUT_MS);
      this.pending.set(seq, {
        // Caller selects TResponse; this harness does not validate tsserver response bodies.
        resolve: (value: unknown) => {
          clearTimeout(timeout);
          resolve(value as TResponse);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });

    this.send({
      seq,
      type: "request",
      command,
      arguments: arguments_,
    });

    return responsePromise;
  }

  public async close(): Promise<void> {
    if (this.process.killed || this.process.exitCode !== null) {
      return;
    }

    await new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        this.process.kill("SIGKILL");
      }, FORM_SPEC_TSSERVER_CLOSE_TIMEOUT_MS);
      this.process.once("exit", () => {
        clearTimeout(killTimer);
        resolve();
      });
      this.process.kill();
    });
  }

  private send(payload: object): void {
    this.process.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private drainMessages(): void {
    for (;;) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) {
        return;
      }

      const header = this.buffer.slice(0, headerEnd);
      const contentLengthMatch = /^Content-Length: (\d+)$/m.exec(header);
      if (contentLengthMatch === null) {
        throw new Error(`Malformed tsserver message header:\n${header}`);
      }

      const contentLengthText = contentLengthMatch[1];
      if (contentLengthText === undefined) {
        throw new Error(`Malformed tsserver Content-Length header:\n${header}`);
      }
      const contentLength = Number.parseInt(contentLengthText, 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      if (this.buffer.length < messageEnd) {
        return;
      }

      const message = JSON.parse(this.buffer.slice(messageStart, messageEnd)) as {
        readonly type: string;
        readonly request_seq?: number;
        readonly success?: boolean;
        readonly message?: string;
        readonly body?: unknown;
      };
      this.buffer = this.buffer.slice(messageEnd);

      if (message.type !== "response") {
        continue;
      }

      const requestSequence = message.request_seq;
      if (requestSequence === undefined) {
        continue;
      }

      const pendingRequest = this.pending.get(requestSequence);
      if (pendingRequest === undefined) {
        continue;
      }
      this.pending.delete(requestSequence);

      if (message.success === false) {
        pendingRequest.reject(new Error(message.message ?? "tsserver request failed"));
        continue;
      }

      pendingRequest.resolve(message.body);
    }
  }
}

describe("tsserver FormSpec plugin smoke test", () => {
  const workspaceRoots: string[] = [];
  const servers: TsServerClient[] = [];

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
    servers.length = 0;

    await Promise.all(
      workspaceRoots.map(async (workspaceRoot) => {
        await fs.rm(workspaceRoot, { recursive: true, force: true });
      })
    );
    workspaceRoots.length = 0;
  });

  it("loads the plugin through tsserver and serves a health response over IPC", async () => {
    await ensureTsServerPluginRuntimeBuilt();

    // Keep the temp workspace under the repo so tsserver can resolve the plugin package
    // by walking up to the monorepo node_modules hierarchy.
    const workspaceRoot = await fs.mkdtemp(path.join(repoRoot, ".tmp-tsserver-plugin-"));
    workspaceRoots.push(workspaceRoot);

    const tsconfigPath = path.join(workspaceRoot, "tsconfig.json");
    const filePath = path.join(workspaceRoot, "example.ts");
    await fs.writeFile(
      tsconfigPath,
      JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            target: "ES2022",
            module: "ESNext",
            plugins: [{ name: "@formspec/ts-plugin" }],
          },
          include: ["example.ts"],
        },
        null,
        2
      ),
      "utf8"
    );
    await fs.writeFile(
      filePath,
      [
        "class Cart {",
        "  /** @minimum :amount 0 */",
        "  discount!: { amount: number; label: string };",
        "}",
      ].join("\n"),
      "utf8"
    );

    const server = new TsServerClient();
    servers.push(server);

    server.notify("open", {
      file: filePath,
      projectRootPath: workspaceRoot,
    });

    const projectInfo = await server.request<{
      readonly configFileName?: string;
    }>("projectInfo", {
      file: filePath,
      needFileNameList: false,
    });
    expect(projectInfo.configFileName).toBe(tsconfigPath);

    await server.request("semanticDiagnosticsSync", {
      file: filePath,
    });

    const runtimePaths: FormSpecWorkspaceRuntimePaths =
      getFormSpecWorkspaceRuntimePaths(workspaceRoot);
    const manifest = await waitForManifest(
      runtimePaths.manifestPath,
      FORM_SPEC_TSSERVER_TIMEOUT_MS
    );
    expect(manifest.workspaceRoot).toBe(workspaceRoot);
    expect(manifest.protocolVersion).toBe(FORMSPEC_ANALYSIS_PROTOCOL_VERSION);

    const response = await queryPluginSocket(runtimePaths.endpoint.address, {
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "health",
    });

    expect(response).toMatchObject({
      kind: "health",
      manifest: {
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        workspaceRoot,
      },
    });
  });
});
