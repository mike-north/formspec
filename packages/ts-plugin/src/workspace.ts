import os from "node:os";
import path from "node:path";
import {
  FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
  FORMSPEC_ANALYSIS_SCHEMA_VERSION,
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
  platform = process.platform,
  userScope = getFormSpecUserScope()
): FormSpecWorkspaceRuntimePaths {
  const workspaceId = getFormSpecWorkspaceId(workspaceRoot);
  const runtimeDirectory = getFormSpecWorkspaceRuntimeDirectory(workspaceRoot);
  const endpoint: FormSpecIpcEndpoint =
    platform === "win32"
      ? {
          kind: "windows-pipe",
          address: `\\\\.\\pipe\\formspec-${userScope}-${workspaceId}`,
        }
      : {
          kind: "unix-socket",
          address: path.join(os.tmpdir(), `formspec-${userScope}-${workspaceId}.sock`),
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
    protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
    analysisSchemaVersion: FORMSPEC_ANALYSIS_SCHEMA_VERSION,
    workspaceRoot,
    workspaceId: paths.workspaceId,
    endpoint: paths.endpoint,
    typescriptVersion,
    extensionFingerprint,
    generation,
    updatedAt: new Date().toISOString(),
  };
}

function getFormSpecUserScope(): string {
  const username = os.userInfo().username.trim();
  return username.length > 0 ? username : "formspec";
}
