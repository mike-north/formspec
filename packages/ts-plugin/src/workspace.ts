import os from "node:os";
import path from "node:path";
import {
  getFormSpecManifestPath,
  getFormSpecWorkspaceId,
  getFormSpecWorkspaceRuntimeDirectory,
  type FormSpecAnalysisManifest,
  type FormSpecIpcEndpoint,
} from "@formspec/analysis";

export interface FormSpecWorkspaceRuntimePaths {
  readonly workspaceRoot: string;
  readonly workspaceId: string;
  readonly runtimeDirectory: string;
  readonly manifestPath: string;
  readonly endpoint: FormSpecIpcEndpoint;
}

export function getFormSpecWorkspaceRuntimePaths(
  workspaceRoot: string,
  platform = process.platform
): FormSpecWorkspaceRuntimePaths {
  const workspaceId = getFormSpecWorkspaceId(workspaceRoot);
  const runtimeDirectory = getFormSpecWorkspaceRuntimeDirectory(workspaceRoot);
  const endpoint: FormSpecIpcEndpoint =
    platform === "win32"
      ? {
          kind: "windows-pipe",
          address: `\\\\.\\pipe\\formspec-${workspaceId}`,
        }
      : {
          kind: "unix-socket",
          address: path.join(os.tmpdir(), `formspec-${workspaceId}.sock`),
        };

  return {
    workspaceRoot,
    workspaceId,
    runtimeDirectory,
    manifestPath: getFormSpecManifestPath(workspaceRoot),
    endpoint,
  };
}

export function createFormSpecAnalysisManifest(
  workspaceRoot: string,
  typescriptVersion: string,
  generation: number,
  extensionFingerprint = "builtin"
): FormSpecAnalysisManifest {
  const paths = getFormSpecWorkspaceRuntimePaths(workspaceRoot);
  return {
    protocolVersion: 1,
    analysisSchemaVersion: 1,
    workspaceRoot,
    workspaceId: paths.workspaceId,
    endpoint: paths.endpoint,
    typescriptVersion,
    extensionFingerprint,
    generation,
    updatedAt: new Date().toISOString(),
  };
}
