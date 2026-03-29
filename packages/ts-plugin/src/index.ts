import type * as tsServer from "typescript/lib/tsserverlibrary.js";
import { createLanguageServiceProxy, FormSpecPluginService } from "./service.js";

const services = new Map<string, FormSpecPluginService>();

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
  void service.start();
  services.set(projectName, service);
  return service;
}

/**
 * Initializes the FormSpec TypeScript language service plugin.
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
