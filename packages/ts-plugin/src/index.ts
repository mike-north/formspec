import type * as tsServer from "typescript/lib/tsserverlibrary.js";
import { createLanguageServiceProxy, FormSpecPluginService } from "./service.js";

const services = new Map<string, FormSpecPluginService>();

function formatPluginError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function getOrCreateService(
  info: tsServer.server.PluginCreateInfo,
  typescriptVersion: string
): FormSpecPluginService {
  const projectName = info.project.getProjectName();
  const existing = services.get(projectName);
  if (existing !== undefined) {
    return existing;
  }

  const service = new FormSpecPluginService({
    workspaceRoot: info.project.getCurrentDirectory(),
    typescriptVersion,
    getProgram: () => info.languageService.getProgram(),
    logger: info.project.projectService.logger,
  });

  const originalClose = info.project.close.bind(info.project);
  let closed = false;
  info.project.close = () => {
    if (closed) {
      return originalClose();
    }

    closed = true;
    services.delete(projectName);
    void service.stop().catch((error: unknown) => {
      info.project.projectService.logger.info(
        `[FormSpec] Failed to stop plugin service for ${projectName}: ${formatPluginError(error)}`
      );
    });
    return originalClose();
  };

  service.start().catch((error: unknown) => {
    info.project.projectService.logger.info(
      `[FormSpec] Plugin service failed to start: ${formatPluginError(error)}`
    );
    services.delete(projectName);
  });
  services.set(projectName, service);
  return service;
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
