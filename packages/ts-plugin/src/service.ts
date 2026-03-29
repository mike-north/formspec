import fs from "node:fs/promises";
import net from "node:net";
import * as ts from "typescript";
import {
  buildFormSpecAnalysisFileSnapshot,
  computeFormSpecTextHash,
  findDeclarationForCommentOffset,
  getSubjectType,
  getCommentHoverInfoAtOffset,
  getSemanticCommentCompletionContextAtOffset,
  isFormSpecSemanticQuery,
  resolveDeclarationPlacement,
  serializeCompletionContext,
  serializeHoverInfo,
  type BuildFormSpecAnalysisFileSnapshotOptions,
  type FormSpecAnalysisFileSnapshot,
  type FormSpecAnalysisManifest,
  type FormSpecSemanticQuery,
  type FormSpecSemanticResponse,
} from "@formspec/analysis";
import { createFormSpecAnalysisManifest, getFormSpecWorkspaceRuntimePaths } from "./workspace.js";

interface LoggerLike {
  info(message: string): void;
}

export interface FormSpecPluginServiceOptions {
  readonly workspaceRoot: string;
  readonly typescriptVersion: string;
  readonly getProgram: () => ts.Program | undefined;
  readonly logger?: LoggerLike;
  readonly snapshotDebounceMs?: number;
}

interface CachedFileSnapshot {
  readonly sourceHash: string;
  readonly snapshot: FormSpecAnalysisFileSnapshot;
}

export class FormSpecPluginService {
  private readonly manifest: FormSpecAnalysisManifest;
  private readonly runtimePaths;
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
      socket.on("data", (chunk) => {
        buffer += String(chunk);
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) {
          return;
        }

        const payload = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
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

    if (this.server === null) {
      return;
    }

    const server = this.server;
    this.server = null;
    if (!server.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) {
          resolve();
          return;
        }
        reject(error);
      });
    });

    if (this.runtimePaths.endpoint.kind === "unix-socket") {
      await fs.rm(this.runtimePaths.endpoint.address, { force: true });
    }
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
          kind: "health",
          manifest: this.manifest,
        };
      case "completion": {
        const environment = this.getSourceEnvironment(query.filePath);
        if (environment === null) {
          return {
            kind: "error",
            error: `Unable to resolve TypeScript source file for ${query.filePath}`,
          };
        }

        const declaration = findDeclarationForCommentOffset(environment.sourceFile, query.offset);
        const placement =
          declaration === null ? null : resolveDeclarationPlacement(declaration);
        const subjectType =
          declaration === null ? undefined : getSubjectType(declaration, environment.checker);
        const context = getSemanticCommentCompletionContextAtOffset(
          environment.sourceFile.text,
          query.offset,
          {
            checker: environment.checker,
            ...(placement === null ? {} : { placement }),
            ...(subjectType === undefined ? {} : { subjectType }),
          }
        );

        return {
          kind: "completion",
          sourceHash: computeFormSpecTextHash(environment.sourceFile.text),
          context: serializeCompletionContext(context),
        };
      }
      case "hover": {
        const environment = this.getSourceEnvironment(query.filePath);
        if (environment === null) {
          return {
            kind: "error",
            error: `Unable to resolve TypeScript source file for ${query.filePath}`,
          };
        }

        const declaration = findDeclarationForCommentOffset(environment.sourceFile, query.offset);
        const placement =
          declaration === null ? null : resolveDeclarationPlacement(declaration);
        const subjectType =
          declaration === null ? undefined : getSubjectType(declaration, environment.checker);
        const hover = getCommentHoverInfoAtOffset(environment.sourceFile.text, query.offset, {
          checker: environment.checker,
          ...(placement === null ? {} : { placement }),
          ...(subjectType === undefined ? {} : { subjectType }),
        });

        return {
          kind: "hover",
          sourceHash: computeFormSpecTextHash(environment.sourceFile.text),
          hover: serializeHoverInfo(hover),
        };
      }
      case "diagnostics": {
        const snapshot = this.getFileSnapshot(query.filePath);
        return {
          kind: "diagnostics",
          sourceHash: snapshot.sourceHash,
          diagnostics: snapshot.diagnostics,
        };
      }
      case "file-snapshot":
        return {
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

  private getSourceEnvironment(filePath: string): {
    readonly sourceFile: ts.SourceFile;
    readonly checker: ts.TypeChecker;
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
    };
  }

  private getFileSnapshot(filePath: string): FormSpecAnalysisFileSnapshot {
    const environment = this.getSourceEnvironment(filePath);
    if (environment === null) {
      return {
        filePath,
        sourceHash: "",
        generatedAt: new Date().toISOString(),
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

    const sourceHash = computeFormSpecTextHash(environment.sourceFile.text);
    const cached = this.snapshotCache.get(filePath);
    if (cached !== undefined && cached.sourceHash === sourceHash) {
      return cached.snapshot;
    }

    const snapshot = buildFormSpecAnalysisFileSnapshot(environment.sourceFile, {
      checker: environment.checker,
    } satisfies BuildFormSpecAnalysisFileSnapshotOptions);
    this.snapshotCache.set(filePath, {
      sourceHash,
      snapshot,
    });
    return snapshot;
  }
}

export function createLanguageServiceProxy(
  languageService: ts.LanguageService,
  semanticService: FormSpecPluginService
): ts.LanguageService {
  const proxy = Object.create(null) as Record<string, unknown>;

  for (const key of Object.keys(languageService) as (keyof ts.LanguageService)[]) {
    const original = languageService[key];
    if (typeof original !== "function") {
      continue;
    }

    proxy[key as string] = (...args: unknown[]) =>
      (original as (...innerArgs: unknown[]) => unknown).apply(languageService, args);
  }

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
  proxy["getSemanticDiagnostics"] = wrapWithSnapshotRefresh((fileName) =>
    languageService.getSemanticDiagnostics(fileName)
  );

  proxy["getCompletionsAtPosition"] = wrapWithSnapshotRefresh(
    (
      fileName: string,
      position: number,
      options: ts.GetCompletionsAtPositionOptions | undefined
    ) => languageService.getCompletionsAtPosition(fileName, position, options)
  );

  proxy["getQuickInfoAtPosition"] = wrapWithSnapshotRefresh((fileName, position: number) =>
    languageService.getQuickInfoAtPosition(fileName, position)
  );

  return proxy as unknown as ts.LanguageService;
}
