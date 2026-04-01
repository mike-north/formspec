import path from "node:path";
import { computeFormSpecTextHash } from "./semantic-protocol.js";

/**
 * Stable workspace-scoped identifier derived from the absolute workspace root.
 *
 * @internal
 */
export function getFormSpecWorkspaceId(workspaceRoot: string): string {
  return computeFormSpecTextHash(workspaceRoot);
}

/**
 * Directory used for machine-generated FormSpec tooling state inside a
 * workspace.
 *
 * @internal
 */
export function getFormSpecWorkspaceRuntimeDirectory(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".cache", "formspec", "tooling");
}

/**
 * Path to the manifest that advertises the local FormSpec semantic service for
 * a workspace.
 *
 * @internal
 */
export function getFormSpecManifestPath(workspaceRoot: string): string {
  return path.join(getFormSpecWorkspaceRuntimeDirectory(workspaceRoot), "manifest.json");
}
