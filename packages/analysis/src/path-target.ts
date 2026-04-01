import type { PathTarget } from "@formspec/core/internals";

export interface ParsedPathTarget {
  readonly path: PathTarget;
  readonly remainingText: string;
}

/**
 * Extract a `:foo.bar` path target prefix from raw tag text.
 */
export function extractPathTarget(text: string): ParsedPathTarget | null {
  const trimmed = text.trimStart();
  const match = /^:([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)(?:\s+([\s\S]*))?$/u.exec(trimmed);
  if (!match?.[1]) {
    return null;
  }

  return {
    path: { segments: match[1].split(".") },
    remainingText: match[2] ?? "",
  };
}

export function formatPathTarget(path: PathTarget | readonly string[]): string {
  if ("segments" in path) {
    return path.segments.join(".");
  }
  return path.join(".");
}
