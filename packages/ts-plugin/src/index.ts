import type * as tsServer from "typescript/lib/tsserverlibrary.js";
export {
  FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
  FORMSPEC_ANALYSIS_SCHEMA_VERSION,
  type CommentSourceSpan,
  type CommentSpan,
  type FormSpecAnalysisCommentSnapshot,
  type FormSpecAnalysisDiagnostic,
  type FormSpecAnalysisDiagnosticCategory,
  type FormSpecAnalysisDiagnosticDataValue,
  type FormSpecAnalysisDiagnosticLocation,
  type FormSpecAnalysisManifest,
  type FormSpecAnalysisFileSnapshot,
  type FormSpecAnalysisTagSnapshot,
  type FormSpecIpcEndpoint,
  type FormSpecPlacement,
  type FormSpecSemanticQuery,
  type FormSpecSemanticResponse,
  type FormSpecSerializedCommentTargetSpecifier,
  type FormSpecSerializedCompletionContext,
  type FormSpecSerializedHoverInfo,
  type FormSpecSerializedTagDefinition,
  type FormSpecSerializedTagSemanticContext,
  type FormSpecSerializedTagSignature,
  type FormSpecTargetKind,
} from "@formspec/analysis/protocol";
import { createLanguageServiceProxy, FormSpecPluginService } from "./service.js";
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

  const performanceLogThresholdMs = readNumberEnvFlag(PERF_LOG_THRESHOLD_ENV_VAR);
  const service = new FormSpecPluginService({
    workspaceRoot,
    typescriptVersion,
    getProgram: () => info.languageService.getProgram(),
    logger: info.project.projectService.logger,
    enablePerformanceLogging: readBooleanEnvFlag(PERF_LOG_ENV_VAR),
    ...(performanceLogThresholdMs === undefined ? {} : { performanceLogThresholdMs }),
  });

  const serviceEntry: ServiceEntry = {
    service,
    referenceCount: 1,
  };
  attachProjectCloseHandler(info, workspaceRoot, serviceEntry);

  service.start().catch((error: unknown) => {
    info.project.projectService.logger.info(
      `[FormSpec] Plugin service failed to start for ${workspaceRoot}: ${formatPluginError(error)}`
    );
    services.delete(workspaceRoot);
  });
  services.set(workspaceRoot, serviceEntry);
  return service;
}

function attachProjectCloseHandler(
  info: tsServer.server.PluginCreateInfo,
  workspaceRoot: string,
  serviceEntry: ServiceEntry
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
      void serviceEntry.service.stop().catch((error: unknown) => {
        info.project.projectService.logger.info(
          `[FormSpec] Failed to stop plugin service for ${workspaceRoot}: ${formatPluginError(error)}`
        );
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
