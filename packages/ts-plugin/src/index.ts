import type * as tsServer from "typescript/lib/tsserverlibrary.js";
import { createLanguageServiceProxy, FormSpecPluginService } from "./service.js";

interface ServiceEntry {
  readonly service: FormSpecPluginService;
  referenceCount: number;
}

const services = new Map<string, ServiceEntry>();

function formatPluginError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
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

  const service = new FormSpecPluginService({
    workspaceRoot,
    typescriptVersion,
    getProgram: () => info.languageService.getProgram(),
    logger: info.project.projectService.logger,
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
      return createLanguageServiceProxy(info.languageService, service);
    },
  };
}
