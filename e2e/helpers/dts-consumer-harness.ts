/**
 * Test harness for verifying that consumers on supported TypeScript
 * versions can parse the `.d.ts` rollups we publish.
 *
 * # Why this exists
 *
 * The TS-version CI matrix in `.github/workflows/ci.yml` exercises
 * **producer-side** compatibility: each row pins one `typescript` version
 * via `pnpm.overrides` and runs the workspace's own build, typecheck,
 * test, and lint at that version. Producer and consumer always match.
 *
 * Real consumers don't see that combination. They install our published
 * `@formspec/*` tarballs whose `dist/<package>.d.ts` rollup was emitted by
 * **the workspace's pinned TypeScript** (currently 6.x), and then they
 * type-check those rollups with **their own `tsc`** (e.g. 5.7).
 *
 * This harness reproduces that asymmetric path in a temp directory:
 *
 * 1. Pack each public `@formspec/*` (and `formspec`) package via
 *    `pnpm pack`, using the workspace's pinned TypeScript.
 * 2. Scaffold a synthetic consumer project that installs every tarball
 *    via `file:` deps, plus realistic peer-dep companions (`@types/node`,
 *    `eslint`).
 * 3. Generate an `index.ts` that imports every public entry point and
 *    forces the type checker to walk each module's full export surface
 *    (`keyof typeof X`). This is what catches `.d.ts` syntax that the
 *    consumer's `tsc` cannot parse.
 * 4. Run `tsc --noEmit` with the configured target TypeScript version.
 *
 * # What this catches
 *
 * - `.d.ts` syntax newer than the consumer's `tsc` can parse (e.g. new
 *   `infer` constraints, the `accessor` keyword, or any future emit
 *   feature added in a TS major).
 * - Missing/wrong types entries in `package.json#exports` that surface
 *   only when `module: NodeNext` resolves the package from outside the
 *   workspace.
 * - Transitive type imports that leak into our rollup but require globals
 *   (`URL`, NodeJS namespace, etc.) that consumers might not have.
 *
 * # What this does NOT catch
 *
 * - Runtime behaviour. This is a type-only check; we do not execute
 *   anything from the published tarballs.
 * - API design issues. The harness asserts "your `tsc` can parse our
 *   `.d.ts`," not "the API is well-designed."
 *
 * # Cost
 *
 * Packing all packages is ~5s. `npm install` of the consumer is ~10–30s
 * (one-time). `tsc --noEmit` per version is ~5–20s. End-to-end across
 * four versions is roughly 1–3 minutes — comparable to other e2e suites.
 */

import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * One public entry point exposed by an `@formspec/*` (or `formspec`)
 * package. The harness imports each of these and exercises every export.
 */
export interface PublicEntryPoint {
  /** Module specifier as a consumer would write it. */
  specifier: string;
  /** Identifier-safe name used in the generated `index.ts`. */
  importName: string;
  /** Optional reason if the entry is currently excluded. */
  excludedReason?: string;
}

/**
 * Inventory of every public entry point we want a consumer to be able to
 * import. Keep this list synced with each package's `package.json#exports`.
 *
 * Excluded entries stay in the list — with `excludedReason` populated — so
 * the absence is intentional and traceable, rather than silently dropped.
 */
export const PUBLIC_ENTRY_POINTS: readonly PublicEntryPoint[] = [
  { specifier: "@formspec/analysis", importName: "analysis" },
  { specifier: "@formspec/analysis/protocol", importName: "analysisProtocol" },
  { specifier: "@formspec/analysis/internal", importName: "analysisInternal" },
  { specifier: "@formspec/build", importName: "build" },
  { specifier: "@formspec/build/browser", importName: "buildBrowser" },
  { specifier: "@formspec/build/internals", importName: "buildInternals" },
  { specifier: "@formspec/cli", importName: "cli" },
  { specifier: "@formspec/config", importName: "config" },
  { specifier: "@formspec/config/browser", importName: "configBrowser" },
  { specifier: "@formspec/core", importName: "core" },
  { specifier: "@formspec/core/internals", importName: "coreInternals" },
  { specifier: "@formspec/dsl", importName: "dsl" },
  { specifier: "@formspec/eslint-plugin", importName: "eslintPlugin" },
  {
    specifier: "@formspec/eslint-plugin/base",
    importName: "eslintPluginBase",
    excludedReason:
      "tracked as a separate publish bug — `dist/base.d.ts` rollup is not emitted; see issue #454",
  },
  { specifier: "@formspec/language-server", importName: "languageServer" },
  { specifier: "@formspec/runtime", importName: "runtime" },
  { specifier: "@formspec/ts-plugin", importName: "tsPlugin" },
  { specifier: "@formspec/validator", importName: "validator" },
  { specifier: "formspec", importName: "formspec" },
];

/** Workspace package directories whose tarballs the consumer installs. */
const PUBLISHABLE_PACKAGE_DIRS: readonly string[] = [
  "packages/analysis",
  "packages/build",
  "packages/cli",
  "packages/config",
  "packages/core",
  "packages/dsl",
  "packages/eslint-plugin",
  "packages/formspec",
  "packages/language-server",
  "packages/runtime",
  "packages/ts-plugin",
  "packages/validator",
];

interface PackedTarball {
  packageName: string;
  tarballPath: string;
}

export interface ConsumerHarnessOptions {
  /** Repo root — used to locate the workspace packages and invoke `pnpm pack`. */
  repoRoot: string;
  /** Tarball staging dir — created if absent. Reused across TS versions. */
  tarballDir: string;
  /** Consumer scaffold dir — created if absent. */
  consumerDir: string;
  /** TypeScript version to install in the consumer. */
  typescriptVersion: string;
  /**
   * Optional override for the `index.ts` body. The default body imports
   * every non-excluded entry from {@link PUBLIC_ENTRY_POINTS} and forces
   * the type checker to walk each module's exports.
   *
   * Tests can pass a custom body to verify negative cases — e.g. that the
   * harness fails when a 6.x-only construct lands in a fixture.
   */
  indexTsOverride?: string;
}

/** Runs `pnpm pack` once per package; idempotent on the tarball dir. */
export function packAllPackages(repoRoot: string, tarballDir: string): PackedTarball[] {
  fs.mkdirSync(tarballDir, { recursive: true });
  const packed: PackedTarball[] = [];
  for (const relDir of PUBLISHABLE_PACKAGE_DIRS) {
    const absDir = path.join(repoRoot, relDir);
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(absDir, "package.json"), "utf8")
    ) as { name: string; version: string };
    execFileSync("pnpm", ["pack", "--pack-destination", tarballDir], {
      cwd: absDir,
      stdio: ["ignore", "ignore", "inherit"],
    });
    // Tarball naming follows pnpm's convention:
    //   `@formspec/foo` v1.2.3 → `formspec-foo-1.2.3.tgz`
    //   `formspec` v1.2.3 → `formspec-1.2.3.tgz`
    const flatName = pkgJson.name.startsWith("@")
      ? pkgJson.name.slice(1).replace("/", "-")
      : pkgJson.name;
    const tarballPath = path.join(tarballDir, `${flatName}-${pkgJson.version}.tgz`);
    if (!fs.existsSync(tarballPath)) {
      throw new Error(
        `Expected tarball at ${tarballPath} after \`pnpm pack\` of ${pkgJson.name}, ` +
          `but it does not exist. Tarball naming may have drifted.`
      );
    }
    packed.push({ packageName: pkgJson.name, tarballPath });
  }
  return packed;
}

function buildPackageJson(tarballs: PackedTarball[], tsVersion: string): string {
  const dependencies: Record<string, string> = {};
  for (const t of tarballs) {
    dependencies[t.packageName] = `file:${t.tarballPath}`;
  }
  // Peer deps and host-side companions a real consumer would have. `eslint`
  // is a peer of `@formspec/eslint-plugin`; `@types/node` ensures NodeJS
  // globals resolve in transitive `vscode-jsonrpc` types pulled in by
  // `@formspec/language-server`.
  dependencies["@types/node"] = "^22.13.0";
  dependencies["eslint"] = "^9.39.2";
  dependencies["typescript"] = tsVersion;
  return (
    JSON.stringify(
      {
        name: "formspec-dts-consumer-test",
        version: "0.0.0",
        type: "module",
        private: true,
        dependencies,
      },
      null,
      2
    ) + "\n"
  );
}

function buildTsconfig(): string {
  // Realistic consumer defaults: strict, NodeNext resolution, ES2022. DOM
  // is included because several FormSpec packages reach `URL` (a global
  // available in browser, Workers, and Node — but only via DOM/types/node
  // libs in TS). `skipLibCheck: true` matches the overwhelming consumer
  // default and prevents transitive `node_modules` types from masking our
  // own `.d.ts` parseability — those would surface as parse errors even
  // with `skipLibCheck`, while consumer-side type-check failures from
  // unrelated third-party dep regressions would not.
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          types: ["node"],
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ["index.ts"],
      },
      null,
      2
    ) + "\n"
  );
}

function buildIndexTs(): string {
  const active = PUBLIC_ENTRY_POINTS.filter((e) => !e.excludedReason);
  const excluded = PUBLIC_ENTRY_POINTS.filter((e) => e.excludedReason);
  const importLines = active
    .map((e) => `import type * as ${e.importName} from "${e.specifier}";`)
    .join("\n");
  const exclusionLines = excluded
    .map((e) => `// excluded: ${e.specifier} — ${e.excludedReason ?? "unknown"}`)
    .join("\n");
  // `keyof typeof X` forces the type checker to enumerate each namespace's
  // export surface, which in turn forces full parsing of the corresponding
  // `.d.ts`. A bare `import type * as X` alone is too weak — TS may resolve
  // the module without deeply parsing it.
  const surfaceUnion = active.map((e) => `  | keyof typeof ${e.importName}`).join("\n");
  return `// Generated by e2e/helpers/dts-consumer-harness.ts. Edits will be lost.
${exclusionLines}
${importLines}

type _PublicSurface =
${surfaceUnion};

declare const _check: _PublicSurface;
void _check;
`;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Scaffolds the consumer dir for a given TypeScript version, runs
 * `npm install`, then `tsc --noEmit`. Throws on the install step (a
 * setup failure shouldn't be reported as a `.d.ts` parse error). Returns
 * the `tsc` result; tests assert `exitCode === 0`.
 */
export function runConsumerCheck(opts: ConsumerHarnessOptions): RunResult {
  const tarballs = packAllPackages(opts.repoRoot, opts.tarballDir);

  fs.mkdirSync(opts.consumerDir, { recursive: true });
  fs.writeFileSync(
    path.join(opts.consumerDir, "package.json"),
    buildPackageJson(tarballs, opts.typescriptVersion)
  );
  fs.writeFileSync(path.join(opts.consumerDir, "tsconfig.json"), buildTsconfig());
  fs.writeFileSync(
    path.join(opts.consumerDir, "index.ts"),
    opts.indexTsOverride ?? buildIndexTs()
  );

  // Force a clean install so the requested `typescript@<version>` is what
  // resolves. `npm install` is intentional here (not pnpm): a real consumer
  // is most likely on npm/yarn, and this test exercises the published
  // tarball path, not workspace symlinks.
  fs.rmSync(path.join(opts.consumerDir, "node_modules"), {
    recursive: true,
    force: true,
  });
  fs.rmSync(path.join(opts.consumerDir, "package-lock.json"), { force: true });
  execFileSync("npm", ["install", "--silent"], {
    cwd: opts.consumerDir,
    stdio: ["ignore", "ignore", "inherit"],
  });

  // Capture stdout/stderr separately. `tsc --noEmit` writes diagnostics to
  // stdout when it's a TTY-less subprocess; we still pipe stderr in case a
  // future TS version changes that.
  const tscBin = path.join(opts.consumerDir, "node_modules", ".bin", "tsc");
  const result = spawnSyncCapturing(tscBin, ["--noEmit"], opts.consumerDir);
  return result;
}

function spawnSyncCapturing(bin: string, args: string[], cwd: string): RunResult {
  // We avoid `execFileSync` here because it throws on non-zero exit, and we
  // want to assert on the exit code in tests rather than try/catch.
  const r = spawnSync(bin, args, { cwd, encoding: "utf8" });
  return {
    exitCode: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

/** Convenience: a temp dir under the OS temp root, prefixed for findability. */
export function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
