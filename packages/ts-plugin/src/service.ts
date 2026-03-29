import fs from "node:fs/promises";
import net from "node:net";
import * as ts from "typescript";
import {
  FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
  computeFormSpecTextHash,
  isFormSpecSemanticQuery,
  type FormSpecAnalysisManifest,
  type FormSpecSemanticQuery,
  type FormSpecSemanticResponse,
} from "@formspec/analysis/protocol";
import {
  buildFormSpecAnalysisFileSnapshot,
  findDeclarationForCommentOffset,
  getCommentHoverInfoAtOffset,
  getSemanticCommentCompletionContextAtOffset,
  getSubjectType,
  resolveDeclarationPlacement,
  serializeCompletionContext,
  serializeHoverInfo,
  type BuildFormSpecAnalysisFileSnapshotOptions,
  type FormSpecAnalysisFileSnapshot,
} from "@formspec/analysis/internal";
import {
  createFormSpecAnalysisManifest,
  getFormSpecWorkspaceRuntimePaths,
  type FormSpecWorkspaceRuntimePaths,
} from "./workspace.js";

interface LoggerLike {
  info(message: string): void;
}

export interface FormSpecPluginServiceOptions {
  readonly workspaceRoot: string;
  readonly typescriptVersion: string;
  readonly getProgram: () => ts.Program | undefined;
  readonly logger?: LoggerLike;
  readonly snapshotDebounceMs?: number;
  readonly now?: () => Date;
}

interface CachedFileSnapshot {
  readonly sourceHash: string;
  readonly snapshot: FormSpecAnalysisFileSnapshot;
}

interface SourceEnvironment {
  readonly sourceFile: ts.SourceFile;
  readonly checker: ts.TypeChecker;
  readonly sourceHash: string;
}

interface CommentQueryContext extends SourceEnvironment {
  readonly declaration: ts.Node | null;
  readonly placement: ReturnType<typeof resolveDeclarationPlacement>;
  readonly subjectType: ts.Type | undefined;
}

const MAX_SOCKET_PAYLOAD_BYTES = 256 * 1024;
const SOCKET_IDLE_TIMEOUT_MS = 30_000;

export class FormSpecPluginService {
  private readonly manifest: FormSpecAnalysisManifest;
  private readonly runtimePaths: FormSpecWorkspaceRuntimePaths;
  private readonly snapshotCache = new Map<string, CachedFileSnapshot>();
  private readonly refreshTimers = new Map<string, NodeJS.Timeout>();
  private server: net.Server | null = null;

  public constructor(private readonly options: FormSpecPluginServiceOptions) {
    this.runtimePaths = getFormSpecWorkspaceRuntimePaths(options.workspaceRoot);
    this.manifest = createFormSpecAnalysisManifest(
      options.workspaceRoot,
      options.typescriptVersion,
      Date.now()
    );
  }

  public getManifest(): FormSpecAnalysisManifest {
    return this.manifest;
  }

  public async start(): Promise<void> {
    if (this.server !== null) {
      return;
    }

    await fs.mkdir(this.runtimePaths.runtimeDirectory, { recursive: true });
    if (this.runtimePaths.endpoint.kind === "unix-socket") {
      await fs.rm(this.runtimePaths.endpoint.address, { force: true });
    }

    this.server = net.createServer((socket) => {
      let buffer = "";
      socket.setEncoding("utf8");
      socket.setTimeout(SOCKET_IDLE_TIMEOUT_MS, () => {
        this.options.logger?.info(
          `[FormSpec] Closing idle semantic query socket for ${this.runtimePaths.workspaceRoot}`
        );
        socket.destroy();
      });
      socket.on("data", (chunk) => {
        buffer += String(chunk);
        if (buffer.length > MAX_SOCKET_PAYLOAD_BYTES) {
          socket.end(
            `${JSON.stringify({
              protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
              kind: "error",
              error: `FormSpec semantic query exceeded ${String(MAX_SOCKET_PAYLOAD_BYTES)} bytes`,
            } satisfies FormSpecSemanticResponse)}\n`
          );
          return;
        }
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) {
          return;
        }

        const payload = buffer.slice(0, newlineIndex);
        const remaining = buffer.slice(newlineIndex + 1);
        if (remaining.trim().length > 0) {
          this.options.logger?.info(
            `[FormSpec] Ignoring extra semantic query payload data for ${this.runtimePaths.workspaceRoot}`
          );
        }
        buffer = remaining;
        // The FormSpec IPC transport is intentionally one-request-per-connection.
        this.respondToSocket(socket, payload);
      });
    });

    await new Promise<void>((resolve, reject) => {
      const handleError = (error: Error) => {
        reject(error);
      };
      this.server?.once("error", handleError);
      this.server?.listen(this.runtimePaths.endpoint.address, () => {
        this.server?.off("error", handleError);
        resolve();
      });
    });

    await this.writeManifest();
  }

  public async stop(): Promise<void> {
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();
    this.snapshotCache.clear();

    const server = this.server;
    this.server = null;
    if (server?.listening === true) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
            return;
          }
          reject(error);
        });
      });
    }

    await this.cleanupRuntimeArtifacts();
  }

  public scheduleSnapshotRefresh(filePath: string): void {
    const existing = this.refreshTimers.get(filePath);
    if (existing !== undefined) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      try {
        this.getFileSnapshot(filePath);
      } catch (error: unknown) {
        this.options.logger?.info(
          `[FormSpec] Failed to refresh semantic snapshot for ${filePath}: ${String(error)}`
        );
      }
      this.refreshTimers.delete(filePath);
    }, this.options.snapshotDebounceMs ?? 250);

    this.refreshTimers.set(filePath, timer);
  }

  public handleQuery(query: FormSpecSemanticQuery): FormSpecSemanticResponse {
    switch (query.kind) {
      case "health":
        return {
          protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
          kind: "health",
          manifest: this.manifest,
        };
      case "completion":
        return this.withCommentQueryContext(query.filePath, query.offset, (context) => ({
          protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
          kind: "completion",
          sourceHash: context.sourceHash,
          context: serializeCompletionContext(
            getSemanticCommentCompletionContextAtOffset(context.sourceFile.text, query.offset, {
              checker: context.checker,
              ...(context.placement === null ? {} : { placement: context.placement }),
              ...(context.subjectType === undefined ? {} : { subjectType: context.subjectType }),
            })
          ),
        }));
      case "hover":
        return this.withCommentQueryContext(query.filePath, query.offset, (context) => ({
          protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
          kind: "hover",
          sourceHash: context.sourceHash,
          hover: serializeHoverInfo(
            getCommentHoverInfoAtOffset(context.sourceFile.text, query.offset, {
              checker: context.checker,
              ...(context.placement === null ? {} : { placement: context.placement }),
              ...(context.subjectType === undefined ? {} : { subjectType: context.subjectType }),
            })
          ),
        }));
      case "diagnostics": {
        const snapshot = this.getFileSnapshot(query.filePath);
        return {
          protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
          kind: "diagnostics",
          sourceHash: snapshot.sourceHash,
          diagnostics: snapshot.diagnostics,
        };
      }
      case "file-snapshot":
        return {
          protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
          kind: "file-snapshot",
          snapshot: this.getFileSnapshot(query.filePath),
        };
      default: {
        throw new Error(`Unhandled semantic query: ${JSON.stringify(query)}`);
      }
    }
  }

  private respondToSocket(socket: net.Socket, payload: string): void {
    try {
      const query = JSON.parse(payload) as unknown;
      if (!isFormSpecSemanticQuery(query)) {
        throw new Error("Invalid FormSpec semantic query payload");
      }
      const response = this.handleQuery(query);
      socket.end(`${JSON.stringify(response)}\n`);
    } catch (error) {
      socket.end(
        `${JSON.stringify({
          protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
          kind: "error",
          error: error instanceof Error ? error.message : String(error),
        } satisfies FormSpecSemanticResponse)}\n`
      );
    }
  }

  private async writeManifest(): Promise<void> {
    const tempManifestPath = `${this.runtimePaths.manifestPath}.tmp`;
    await fs.writeFile(tempManifestPath, `${JSON.stringify(this.manifest, null, 2)}\n`, "utf8");
    await fs.rename(tempManifestPath, this.runtimePaths.manifestPath);
  }

  private async cleanupRuntimeArtifacts(): Promise<void> {
    await fs.rm(this.runtimePaths.manifestPath, { force: true });
    if (this.runtimePaths.endpoint.kind === "unix-socket") {
      await fs.rm(this.runtimePaths.endpoint.address, { force: true });
    }
  }

  private getSourceEnvironment(filePath: string): {
    readonly sourceFile: ts.SourceFile;
    readonly checker: ts.TypeChecker;
    readonly sourceHash: string;
  } | null {
    const program = this.options.getProgram();
    if (program === undefined) {
      return null;
    }

    const sourceFile = program.getSourceFile(filePath);
    if (sourceFile === undefined) {
      return null;
    }

    return {
      sourceFile,
      checker: program.getTypeChecker(),
      sourceHash: computeFormSpecTextHash(sourceFile.text),
    };
  }

  private withCommentQueryContext(
    filePath: string,
    offset: number,
    handler: (context: CommentQueryContext) => FormSpecSemanticResponse
  ): FormSpecSemanticResponse {
    const environment = this.getSourceEnvironment(filePath);
    if (environment === null) {
      return {
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        kind: "error",
        error: `Unable to resolve TypeScript source file for ${filePath}`,
      };
    }

    const declaration = findDeclarationForCommentOffset(environment.sourceFile, offset);
    const placement = declaration === null ? null : resolveDeclarationPlacement(declaration);
    const subjectType =
      declaration === null ? undefined : getSubjectType(declaration, environment.checker);

    return handler({
      ...environment,
      declaration,
      placement,
      subjectType,
    });
  }

  private getFileSnapshot(filePath: string): FormSpecAnalysisFileSnapshot {
    const environment = this.getSourceEnvironment(filePath);
    if (environment === null) {
      return {
        filePath,
        sourceHash: "",
        generatedAt: this.getNow().toISOString(),
        comments: [],
        diagnostics: [
          {
            code: "MISSING_SOURCE_FILE",
            message: `Unable to resolve TypeScript source file for ${filePath}`,
            range: { start: 0, end: 0 },
            severity: "warning",
          },
        ],
      };
    }

    const cached = this.snapshotCache.get(filePath);
    if (cached?.sourceHash === environment.sourceHash) {
      return cached.snapshot;
    }

    const snapshot = buildFormSpecAnalysisFileSnapshot(environment.sourceFile, {
      checker: environment.checker,
    } satisfies BuildFormSpecAnalysisFileSnapshotOptions);
    this.snapshotCache.set(filePath, {
      sourceHash: environment.sourceHash,
      snapshot,
    });
    return snapshot;
  }

  private getNow(): Date {
    return this.options.now?.() ?? new Date();
  }
}

export function createLanguageServiceProxy(
  languageService: ts.LanguageService,
  semanticService: FormSpecPluginService
): ts.LanguageService {
  const wrapWithSnapshotRefresh = <Args extends readonly unknown[], Result>(
    fn: (fileName: string, ...args: Args) => Result
  ) => {
    return (fileName: string, ...args: Args): Result => {
      semanticService.scheduleSnapshotRefresh(fileName);
      return fn(fileName, ...args);
    };
  };

  // The plugin keeps semantic snapshots fresh for the lightweight LSP. The
  // underlying tsserver results still come from the original language service.
  const getSemanticDiagnostics = wrapWithSnapshotRefresh((fileName) =>
    languageService.getSemanticDiagnostics(fileName)
  );

  const getCompletionsAtPosition = wrapWithSnapshotRefresh(
    (fileName: string, position: number, options: ts.GetCompletionsAtPositionOptions | undefined) =>
      languageService.getCompletionsAtPosition(fileName, position, options)
  );

  const getQuickInfoAtPosition = wrapWithSnapshotRefresh((fileName, position: number) =>
    languageService.getQuickInfoAtPosition(fileName, position)
  );

  return new Proxy(languageService, {
    get(target, property, receiver) {
      switch (property) {
        case "getSemanticDiagnostics":
          return getSemanticDiagnostics;
        case "getCompletionsAtPosition":
          return getCompletionsAtPosition;
        case "getQuickInfoAtPosition":
          return getQuickInfoAtPosition;
        default:
          return Reflect.get(target, property, receiver) as unknown;
      }
    },
  });
}
