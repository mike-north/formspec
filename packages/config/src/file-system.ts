/**
 * Abstraction used by `loadFormSpecConfig` for path resolution and file reads.
 *
 * @public
 */
export interface FileSystem {
  /** Returns whether a readable file exists at the provided path. */
  exists(path: string): Promise<boolean>;
  /** Reads UTF-8 text from a path. */
  readFile(path: string): Promise<string>;
  /** Resolves one or more path segments to an absolute path. */
  resolve(...segments: string[]): string;
  /** Returns the parent directory for the provided path. */
  dirname(path: string): string;
}

/**
 * Node.js-backed `FileSystem` implementation used as the default adapter.
 *
 * @internal
 */
export async function nodeFileSystem(): Promise<FileSystem> {
  const [{ readFile, stat }, pathModule] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);

  return {
    async exists(path) {
      try {
        return (await stat(path)).isFile();
      } catch {
        return false;
      }
    },
    readFile: (path) => readFile(path, "utf-8"),
    resolve: (...segments) => pathModule.resolve(...segments),
    dirname: (path) => pathModule.dirname(path),
  };
}
