import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
  computeFormSpecTextHash,
  getFormSpecManifestPath,
  isFormSpecAnalysisManifest,
  isFormSpecSemanticResponse,
  type FormSpecAnalysisManifest,
  type FormSpecSerializedCompletionContext,
  type FormSpecSerializedHoverInfo,
  type FormSpecSemanticQuery,
  type FormSpecSemanticResponse,
} from "@formspec/analysis";

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
  const workspaceRoot = getMatchingWorkspaceRoot(workspaceRoots, filePath);
  if (workspaceRoot === null) {
    return null;
  }

  const manifest = await readManifest(workspaceRoot);
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
