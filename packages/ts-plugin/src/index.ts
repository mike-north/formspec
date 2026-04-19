/**
 * TypeScript language service plugin entrypoint for FormSpec.
 *
 * This package exposes the reference tsserver plugin and the reusable semantic
 * service used by downstream TypeScript hosts.
 *
 * @packageDocumentation
 */
import type * as tsServer from "typescript/lib/tsserverlibrary.js";
export {
  FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
  FORMSPEC_ANALYSIS_SCHEMA_VERSION,
  type CommentSourceSpan,
  type CommentSpan,
  type FormSpecAnalysisCommentSnapshot,
  type FormSpecAnalysisDeclarationSummary,
  type FormSpecAnalysisDiagnostic,
  type FormSpecAnalysisDiagnosticCategory,
  type FormSpecAnalysisDiagnosticDataValue,
  type FormSpecAnalysisDiagnosticLocation,
  type FormSpecAnalysisFileSnapshot,
  type FormSpecAnalysisManifest,
  type FormSpecAnalysisTagSnapshot,
  type FormSpecIpcEndpoint,
  type FormSpecPlacement,
  type FormSpecSemanticQuery,
  type FormSpecSemanticResponse,
  type FormSpecSerializedDeclarationFact,
  type FormSpecSerializedExplicitMetadataSource,
  type FormSpecSerializedJsonValue,
  type FormSpecSerializedMetadataEntry,
  type FormSpecSerializedResolvedMetadata,
  type FormSpecSerializedResolvedScalarMetadata,
  type FormSpecTargetKind,
  type FormSpecSerializedCommentTargetSpecifier,
  type FormSpecSerializedCompletionContext,
  type FormSpecSerializedHoverInfo,
  type FormSpecSerializedTagDefinition,
  type FormSpecSerializedTagSemanticContext,
  type FormSpecSerializedTagSignature,
} from "@formspec/analysis";
import { createLanguageServiceProxy, FormSpecPluginService } from "./service.js";
import { fromTsLogger } from "./logger.js";
export {
  createLanguageServiceProxy,
  FormSpecPluginService,
  type FormSpecPluginServiceOptions,
  type LoggerLike,
} from "./service.js";
export {
  FormSpecSemanticService,
  type FormSpecSemanticCompletionResult,
  type FormSpecSemanticDiagnosticsResult,
  type FormSpecSemanticHoverResult,
  type FormSpecSemanticServiceOptions,
  type FormSpecSemanticServiceStats,
} from "./semantic-service.js";

interface ServiceEntry {
  readonly service: FormSpecPluginService;
  referenceCount: number;
}

const services = new Map<string, ServiceEntry>();
const PERF_LOG_ENV_VAR = "FORMSPEC_PLUGIN_PROFILE";
const PERF_LOG_THRESHOLD_ENV_VAR = "FORMSPEC_PLUGIN_PROFILE_THRESHOLD_MS";

function formatPluginError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function readBooleanEnvFlag(name: string): boolean {
  const rawValue = process.env[name];
  return rawValue === "1" || rawValue === "true";
}

function readNumberEnvFlag(name: string): number | undefined {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue.trim() === "") {
    return undefined;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const PLUGIN_NAMESPACE = "formspec:ts-plugin";

function getOrCreateService(
  info: tsServer.server.PluginCreateInfo,
  typescriptVersion: string
): FormSpecPluginService {
  const workspaceRoot = info.project.getCurrentDirectory();
  const existing = services.get(workspaceRoot);
  if (existing !== undefined) {
    existing.referenceCount += 1;
    attachProjectCloseHandler(info, workspaceRoot, existing);
    return existing.service;
  }

  const tsLogger = info.project.projectService.logger;
  // Build a rich FormSpec LoggerLike that prefixes every line with
  // [formspec:ts-plugin] and gates on DEBUG=formspec:ts-plugin (or DEBUG=formspec:*).
  const pluginLogger = fromTsLogger(tsLogger, { namespace: PLUGIN_NAMESPACE });

  const performanceLogThresholdMs = readNumberEnvFlag(PERF_LOG_THRESHOLD_ENV_VAR);
  const service = new FormSpecPluginService({
    workspaceRoot,
    typescriptVersion,
    getProgram: () => info.languageService.getProgram(),
    logger: tsLogger,
    enablePerformanceLogging: readBooleanEnvFlag(PERF_LOG_ENV_VAR),
    ...(performanceLogThresholdMs === undefined ? {} : { performanceLogThresholdMs }),
  });

  const serviceEntry: ServiceEntry = {
    service,
    referenceCount: 1,
  };
  attachProjectCloseHandler(info, workspaceRoot, serviceEntry, pluginLogger);

  pluginLogger.info(`Plugin activating for workspace: ${workspaceRoot} (TypeScript ${typescriptVersion})`);

  service
    .start()
    .then(() => {
      pluginLogger.info(`IPC socket open for ${workspaceRoot}`);
    })
    .catch((error: unknown) => {
      const msg = `Plugin service failed to start for ${workspaceRoot}: ${formatPluginError(error)}`;
      pluginLogger.error(msg);
      // Also write through the raw tsLogger so the error appears even when
      // DEBUG=formspec:ts-plugin is not set.
      tsLogger.info(`[FormSpec] ${msg}`);
      services.delete(workspaceRoot);
    });

  services.set(workspaceRoot, serviceEntry);
  return service;
}

function attachProjectCloseHandler(
  info: tsServer.server.PluginCreateInfo,
  workspaceRoot: string,
  serviceEntry: ServiceEntry,
  pluginLogger?: import("@formspec/core").LoggerLike
): void {
  const originalClose = info.project.close.bind(info.project);
  let closed = false;

  info.project.close = () => {
    if (closed) {
      originalClose();
      return;
    }

    closed = true;
    serviceEntry.referenceCount -= 1;
    if (serviceEntry.referenceCount <= 0) {
      services.delete(workspaceRoot);
      pluginLogger?.info(`IPC socket closing for ${workspaceRoot}`);
      void serviceEntry.service.stop().catch((error: unknown) => {
        const msg = `Failed to stop plugin service for ${workspaceRoot}: ${formatPluginError(error)}`;
        if (pluginLogger !== undefined) {
          pluginLogger.error(msg);
        } else {
          info.project.projectService.logger.info(`[FormSpec] ${msg}`);
        }
      });
    }
    originalClose();
  };
}

/**
 * Initializes the FormSpec TypeScript language service plugin.
 *
 * @public
 */
export function init(modules: {
  readonly typescript: typeof tsServer;
}): tsServer.server.PluginModule {
  const typescriptVersion = modules.typescript.version;
  return {
    create(info) {
      const service = getOrCreateService(info, typescriptVersion);
      return createLanguageServiceProxy(info.languageService, service.getSemanticService());
    },
  };
}
