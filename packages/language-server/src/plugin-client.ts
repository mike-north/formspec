import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
  computeFormSpecTextHash,
  isFormSpecAnalysisManifest,
  isFormSpecSemanticResponse,
  type FormSpecAnalysisDiagnostic,
  type FormSpecAnalysisManifest,
  type FormSpecSerializedCompletionContext,
  type FormSpecSerializedHoverInfo,
  type FormSpecSemanticQuery,
  type FormSpecSemanticResponse,
} from "@formspec/analysis";
import { getFormSpecManifestPath } from "@formspec/analysis/internal";

const DEFAULT_PLUGIN_QUERY_TIMEOUT_MS = 2_000;

function getManifestPath(workspaceRoot: string): string {
  return getFormSpecManifestPath(workspaceRoot);
}

function normalizeWorkspaceRoot(root: string): string {
  const resolved = path.resolve(root);
  const parsed = path.parse(resolved);
  let normalized = resolved;

  while (normalized.length > parsed.root.length && normalized.endsWith(path.sep)) {
    normalized = normalized.slice(0, -path.sep.length);
  }

  return normalized;
}

function getMatchingWorkspaceRoot(
  workspaceRoots: readonly string[],
  filePath: string
): string | null {
  const normalizedFilePath = path.resolve(filePath);
  const normalizedRoots = [...workspaceRoots]
    .map(normalizeWorkspaceRoot)
    .sort((left, right) => right.length - left.length);
  return (
    normalizedRoots.find(
      (workspaceRoot) =>
        normalizedFilePath === workspaceRoot ||
        normalizedFilePath.startsWith(`${workspaceRoot}${path.sep}`)
    ) ?? null
  );
}

/**
 * Enumerates candidate manifest directories for `filePath`, walking from the
 * file's containing directory upward to (and including) `workspaceRoot`.
 *
 * The tsserver plugin writes its manifest under `info.project.getCurrentDirectory()`
 * — the enclosing tsconfig project directory — which, in a monorepo opened at
 * the repo root, is nested below the editor's workspace root (e.g. the plugin
 * writes under `<root>/packages/foo` while the LSP only knows `<root>`). Probing
 * every directory between the file and the workspace root reconciles the two:
 * whichever directory the plugin chose as its project root is discovered.
 *
 * The walk is bounded above by `workspaceRoot` so discovery never reads a
 * manifest belonging to an unrelated project outside the editor's workspace.
 */
function collectManifestSearchDirectories(filePath: string, workspaceRoot: string): string[] {
  const normalizedRoot = normalizeWorkspaceRoot(workspaceRoot);
  const directories: string[] = [];
  let current = path.dirname(path.resolve(filePath));

  // `workspaceRoot` is guaranteed to be an ancestor of (or equal to) the file by
  // the caller, so the walk terminates at `normalizedRoot`. The parent-equality
  // and prefix guards are defense-in-depth against a malformed pairing.
  while (current === normalizedRoot || current.startsWith(`${normalizedRoot}${path.sep}`)) {
    directories.push(current);
    if (current === normalizedRoot) {
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  if (!directories.includes(normalizedRoot)) {
    directories.push(normalizedRoot);
  }

  return directories;
}

/**
 * Locates the FormSpec analysis manifest for `filePath` by matching it to an
 * editor workspace root, then probing each directory from the file upward to
 * that root. Returns the first valid manifest, or `null` when none is found.
 */
async function discoverManifestForFile(
  workspaceRoots: readonly string[],
  filePath: string
): Promise<FormSpecAnalysisManifest | null> {
  const workspaceRoot = getMatchingWorkspaceRoot(workspaceRoots, filePath);
  if (workspaceRoot === null) {
    return null;
  }

  for (const candidateDirectory of collectManifestSearchDirectories(filePath, workspaceRoot)) {
    const manifest = await readManifest(candidateDirectory);
    if (manifest !== null) {
      return manifest;
    }
  }

  return null;
}

async function readManifest(workspaceRoot: string): Promise<FormSpecAnalysisManifest | null> {
  try {
    const manifestText = await fs.readFile(getManifestPath(workspaceRoot), "utf8");
    const manifest = JSON.parse(manifestText) as unknown;
    if (!isFormSpecAnalysisManifest(manifest)) {
      return null;
    }

    return manifest;
  } catch {
    return null;
  }
}

async function sendSemanticQuery(
  manifest: FormSpecAnalysisManifest,
  query: FormSpecSemanticQuery,
  timeoutMs = DEFAULT_PLUGIN_QUERY_TIMEOUT_MS
): Promise<FormSpecSemanticResponse | null> {
  return new Promise((resolve) => {
    const socket = net.createConnection(manifest.endpoint.address);
    let buffer = "";
    let settled = false;

    const finish = (response: FormSpecSemanticResponse | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.removeAllListeners("data");
      socket.destroy();
      resolve(response);
    };

    socket.setTimeout(timeoutMs, () => {
      finish(null);
    });

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(`${JSON.stringify(query)}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += String(chunk);
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }

      const payload = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      try {
        const response = JSON.parse(payload) as unknown;
        finish(isFormSpecSemanticResponse(response) ? response : null);
      } catch {
        finish(null);
      }
    });
    socket.on("error", () => {
      finish(null);
    });
    socket.on("close", () => {
      finish(null);
    });
  });
}

/**
 * Converts a `file://` URI to an absolute filesystem path.
 *
 * Returns `null` when `uri` is not a valid file URI.
 *
 * @public
 */
export function fileUriToPathOrNull(uri: string): string | null {
  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
}

async function sendFileQuery(
  workspaceRoots: readonly string[],
  filePath: string,
  query: FormSpecSemanticQuery,
  timeoutMs = DEFAULT_PLUGIN_QUERY_TIMEOUT_MS
): Promise<FormSpecSemanticResponse | null> {
  const manifest = await discoverManifestForFile(workspaceRoots, filePath);
  if (manifest === null) {
    return null;
  }

  return sendSemanticQuery(manifest, query, timeoutMs);
}

export async function getPluginCompletionContextForDocument(
  workspaceRoots: readonly string[],
  filePath: string,
  documentText: string,
  offset: number,
  timeoutMs = DEFAULT_PLUGIN_QUERY_TIMEOUT_MS
): Promise<FormSpecSerializedCompletionContext | null> {
  const response = await sendFileQuery(
    workspaceRoots,
    filePath,
    {
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "completion",
      filePath,
      offset,
    },
    timeoutMs
  );
  if (response?.kind !== "completion") {
    return null;
  }

  return response.sourceHash === computeFormSpecTextHash(documentText) ? response.context : null;
}

export async function getPluginHoverForDocument(
  workspaceRoots: readonly string[],
  filePath: string,
  documentText: string,
  offset: number,
  timeoutMs = DEFAULT_PLUGIN_QUERY_TIMEOUT_MS
): Promise<FormSpecSerializedHoverInfo | null> {
  const response = await sendFileQuery(
    workspaceRoots,
    filePath,
    {
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "hover",
      filePath,
      offset,
    },
    timeoutMs
  );
  if (response?.kind !== "hover") {
    return null;
  }

  return response.sourceHash === computeFormSpecTextHash(documentText) ? response.hover : null;
}

/**
 * Retrieves canonical FormSpec diagnostics for the current document revision
 * from the plugin transport. Returns `null` when the transport is missing,
 * stale, or invalid.
 *
 * @public
 */
export async function getPluginDiagnosticsForDocument(
  workspaceRoots: readonly string[],
  filePath: string,
  documentText: string,
  timeoutMs = DEFAULT_PLUGIN_QUERY_TIMEOUT_MS
): Promise<readonly FormSpecAnalysisDiagnostic[] | null> {
  const response = await sendFileQuery(
    workspaceRoots,
    filePath,
    {
      protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
      kind: "diagnostics",
      filePath,
    },
    timeoutMs
  );
  if (response?.kind !== "diagnostics") {
    return null;
  }

  return response.sourceHash === computeFormSpecTextHash(documentText)
    ? response.diagnostics
    : null;
}
