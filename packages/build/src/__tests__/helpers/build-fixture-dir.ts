/**
 * Shared helper for build-consumer test files that need a real tsconfig.json
 * on disk alongside generated TypeScript fixture files.
 *
 * Both `typed-parser-canaries.test.ts` and `parity-divergences.test.ts` use
 * this to set up a temp directory in `beforeAll` and clean up in `afterAll`.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface BuildFixtureDir {
  /** Absolute path to the temp directory. */
  readonly dirPath: string;
  /**
   * Writes a file at `relPath` (relative to `dirPath`) with the given content.
   * Parent directories are created automatically.
   */
  writeFile(relPath: string, content: string): void;
  /** Removes the temp directory and all its contents. */
  cleanup(): void;
}

/**
 * Creates a temporary directory populated with a `tsconfig.json` suitable for
 * build-consumer probe fixtures.
 *
 * Call this in `beforeAll` and call `cleanup()` in `afterAll`.
 *
 * ```ts
 * let fixture: BuildFixtureDir;
 * beforeAll(() => { fixture = createBuildFixtureDir("my-test-prefix"); });
 * afterAll(() => { fixture.cleanup(); });
 * ```
 */
export function createBuildFixtureDir(prefix = "formspec-build-fixture-"): BuildFixtureDir {
  const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  fs.writeFileSync(
    path.join(dirPath, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "nodenext",
          strict: true,
          skipLibCheck: true,
        },
      },
      null,
      2
    )
  );

  return {
    dirPath,
    writeFile(relPath: string, content: string): void {
      const fullPath = path.join(dirPath, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    },
    cleanup(): void {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true });
      }
    },
  };
}
