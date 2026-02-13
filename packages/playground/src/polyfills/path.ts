/**
 * Browser polyfill for Node.js 'path' module.
 * Provides minimal implementation of path utilities needed by @typescript-eslint/parser.
 */

export function dirname(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "." : path.slice(0, lastSlash);
}

export function basename(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? path : path.slice(lastSlash + 1);
}

export function extname(path: string): string {
  const lastDot = path.lastIndexOf(".");
  const lastSlash = path.lastIndexOf("/");
  return lastDot === -1 || lastDot < lastSlash ? "" : path.slice(lastDot);
}

export function join(...parts: string[]): string {
  return parts
    .filter((p) => p)
    .join("/")
    .replace(/\/+/g, "/");
}

export function resolve(...parts: string[]): string {
  return parts
    .filter((p) => p)
    .join("/")
    .replace(/\/+/g, "/");
}

export const sep = "/";
export const delimiter = ":";

const path = {
  dirname,
  basename,
  extname,
  join,
  resolve,
  sep,
  delimiter,
};

export default path;
