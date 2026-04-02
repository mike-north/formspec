import fs from "node:fs/promises";
import net from "node:net";
import * as ts from "typescript";
import {
  FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
} from "@formspec/analysis/protocol";
import {
  isFormSpecSemanticQuery,
  type FormSpecAnalysisManifest,
  type FormSpecPerformanceEvent,
  type FormSpecSemanticQuery,
  type FormSpecSemanticResponse,
} from "@formspec/analysis/internal";
import {
  createFormSpecAnalysisManifest,
  getFormSpecWorkspaceRuntimePaths,
  type FormSpecWorkspaceRuntimePaths,
} from "./workspace.js";
import {
  FormSpecSemanticService,
  type FormSpecSemanticServiceOptions,
  type LoggerLike,
} from "./semantic-service.js";
import {
  FORM_SPEC_PLUGIN_DEFAULT_PERFORMANCE_LOG_THRESHOLD_MS,
  FORM_SPEC_PLUGIN_MAX_SOCKET_PAYLOAD_BYTES,
  FORM_SPEC_PLUGIN_SOCKET_IDLE_TIMEOUT_MS,
} from "./constants.js";
import { formatPerformanceEvent } from "./perf-utils.js";

/**
 * Public configuration for the reference plugin wrapper that exposes
 * `FormSpecSemanticService` over the local manifest + IPC transport.
 *
 * Supports the same semantic-service options, including
 * `enablePerformanceLogging`, `performanceLogThresholdMs`, and
 * `snapshotDebounceMs`. The packaged tsserver plugin wires these from
 * `FORMSPEC_PLUGIN_PROFILE=1` and `FORMSPEC_PLUGIN_PROFILE_THRESHOLD_MS`.
 *
 * @public
 */
export type FormSpecPluginServiceOptions = FormSpecSemanticServiceOptions;

/**
 * Reference manifest/socket wrapper around `FormSpecSemanticService`.
 *
 * Downstream TypeScript hosts that already control their own plugin/runtime
 * lifecycle can use `FormSpecSemanticService` directly and skip this wrapper.
 *
 * @public
 */
export class FormSpecPluginService {
  private readonly manifest: FormSpecAnalysisManifest;
  private readonly runtimePaths: FormSpecWorkspaceRuntimePaths;
  private readonly semanticService: FormSpecSemanticService;
  private server: net.Server | null = null;

  public constructor(private readonly options: FormSpecPluginServiceOptions) {
    this.semanticService = new FormSpecSemanticService(options);
    this.runtimePaths = getFormSpecWorkspaceRuntimePaths(options.workspaceRoot);
    this.manifest = createFormSpecAnalysisManifest(
      options.workspaceRoot,
      options.typescriptVersion,
      Date.now()
    );
  }

  /**
   * Returns the manifest written by the plugin service for workspace discovery.
   *
   * @internal
   */
  public getManifest(): FormSpecAnalysisManifest {
    return this.manifest;
  }

  /**
   * Returns the underlying semantic service used by this reference wrapper.
   *
   * @public
   */
  public getSemanticService(): FormSpecSemanticService {
    return this.semanticService;
  }

  /**
   * Starts the IPC transport and writes the current workspace manifest.
   *
   * Calling this more than once is a no-op.
   *
   * @public
   */
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
      socket.setTimeout(FORM_SPEC_PLUGIN_SOCKET_IDLE_TIMEOUT_MS, () => {
        this.options.logger?.info(
          `[FormSpec] Closing idle semantic query socket for ${this.runtimePaths.workspaceRoot}`
        );
        socket.destroy();
      });
      socket.on("data", (chunk) => {
        buffer += String(chunk);
        if (buffer.length > FORM_SPEC_PLUGIN_MAX_SOCKET_PAYLOAD_BYTES) {
          socket.end(
            `${JSON.stringify({
              protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
              kind: "error",
              error: `FormSpec semantic query exceeded ${String(FORM_SPEC_PLUGIN_MAX_SOCKET_PAYLOAD_BYTES)} bytes`,
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

  /**
   * Stops the IPC transport, clears semantic state, and removes runtime artifacts.
   *
   * @public
   */
  public async stop(): Promise<void> {
    this.semanticService.dispose();

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

  /**
   * Schedules a background refresh for the cached semantic snapshot of a file.
   *
   * @public
   */
  public scheduleSnapshotRefresh(filePath: string): void {
    this.semanticService.scheduleSnapshotRefresh(filePath);
  }

  /**
   * Handles a semantic query issued against the plugin transport.
   *
   * @internal
   */
  public handleQuery(query: FormSpecSemanticQuery): FormSpecSemanticResponse {
    if (this.options.enablePerformanceLogging === true) {
      const startedAt = performance.now();
      const response = this.executeQuery(query);
      this.logQueryDuration(query, performance.now() - startedAt);
      return response;
    }

    return this.executeQuery(query);
  }

  private executeQuery(query: FormSpecSemanticQuery): FormSpecSemanticResponse {
    switch (query.kind) {
      case "health":
        return {
          protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
          kind: "health",
          manifest: this.manifest,
        };
      case "completion": {
        const result = this.semanticService.getCompletionContext(query.filePath, query.offset);
        if (result === null) {
          return {
            protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
            kind: "error",
            error: `Unable to resolve TypeScript source file for ${query.filePath}`,
          };
        }

        return {
          ...result,
          kind: "completion",
        };
      }
      case "hover": {
        const result = this.semanticService.getHover(query.filePath, query.offset);
        if (result === null) {
          return {
            protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
            kind: "error",
            error: `Unable to resolve TypeScript source file for ${query.filePath}`,
          };
        }

        return {
          ...result,
          kind: "hover",
        };
      }
      case "diagnostics": {
        const result = this.semanticService.getDiagnostics(query.filePath);
        return {
          ...result,
          kind: "diagnostics",
        };
      }
      case "file-snapshot":
        return {
          protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
          kind: "file-snapshot",
          snapshot: this.semanticService.getFileSnapshot(query.filePath),
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

  private logQueryDuration(query: FormSpecSemanticQuery, durationMs: number): void {
    const logger = this.options.logger;
    if (logger === undefined) {
      return;
    }

    const thresholdMs =
      this.options.performanceLogThresholdMs ??
      FORM_SPEC_PLUGIN_DEFAULT_PERFORMANCE_LOG_THRESHOLD_MS;
    if (durationMs < thresholdMs) {
      return;
    }

    const event: FormSpecPerformanceEvent = {
      name: "plugin.handleQuery",
      durationMs,
      detail: {
        kind: query.kind,
        ...(query.kind === "health" ? {} : { filePath: query.filePath }),
      },
    };
    logger.info(`[FormSpec][perf] ${formatPerformanceEvent(event)}`);
  }
}

/**
 * Reference proxy wrapper that keeps FormSpec semantic snapshots fresh while
 * delegating actual TypeScript editor features to the original service.
 *
 * @public
 */
export function createLanguageServiceProxy(
  languageService: ts.LanguageService,
  semanticService: FormSpecSemanticService
): ts.LanguageService {
  const wrapWithSnapshotRefresh = <Args extends readonly unknown[], Result>(
    fn: (fileName: string, ...args: Args) => Result
  ) => {
    return (fileName: string, ...args: Args): Result => {
      semanticService.scheduleSnapshotRefresh(fileName);
      return fn(fileName, ...args);
    };
  };

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

export type { LoggerLike };
