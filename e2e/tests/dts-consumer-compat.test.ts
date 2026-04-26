/**
 * Verifies that consumers on each supported TypeScript version can parse
 * the `.d.ts` rollups we publish.
 *
 * See `e2e/helpers/dts-consumer-harness.ts` for the rationale and the
 * mechanics of how the consumer fixture is constructed and exercised.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_ENTRY_POINTS,
  PUBLISHABLE_PACKAGE_DIRS,
  makeTempDir,
  packAllPackages,
  runConsumerCheck,
} from "../helpers/dts-consumer-harness.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

/**
 * The TypeScript versions a published consumer might use. The floor must
 * match the `typescript` peer-dep range advertised by the published
 * packages (see each `packages/<name>/package.json#peerDependencies.typescript`),
 * and the ceiling is the latest stable in the supported `<7` range.
 *
 * If you change this list, also update the peer-dep range and the
 * "Supported TypeScript versions" section in CLAUDE.md.
 */
const TYPESCRIPT_VERSIONS_TO_TEST: readonly string[] = [
  "5.7.3",
  "5.8.3",
  "5.9.3",
  "6.0.3",
];

// Packing every workspace package and running `npm install` is expensive.
// Pack once at suite startup; each TS-version case scaffolds its own
// consumer dir but reuses the shared tarballs.
let sharedTarballDir: string;

beforeAll(() => {
  sharedTarballDir = makeTempDir("formspec-dts-consumer-tarballs-");
  packAllPackages(REPO_ROOT, sharedTarballDir);
}, 120_000);

afterAll(() => {
  if (sharedTarballDir) {
    fs.rmSync(sharedTarballDir, { recursive: true, force: true });
  }
});

describe(".d.ts consumer compatibility", () => {
  it("inventory covers every non-private workspace package", () => {
    // Derive the truth from disk so adding a new public package without
    // updating `PUBLISHABLE_PACKAGE_DIRS` or `PUBLIC_ENTRY_POINTS` fails
    // this test instead of silently leaving the new package un-covered.
    //
    // - Walk every dir under packages/, drop private packages.
    // - Assert each non-private package's directory appears in
    //   PUBLISHABLE_PACKAGE_DIRS (so its tarball gets packed).
    // - Assert each non-private package's `.` specifier appears in
    //   PUBLIC_ENTRY_POINTS (so the consumer fixture imports it).
    //   Subpath exports are not auto-validated here — they vary per
    //   package and live in PUBLIC_ENTRY_POINTS as explicit entries.
    const packagesDir = path.join(REPO_ROOT, "packages");
    const onDisk: { dir: string; name: string }[] = [];
    for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgJsonPath = path.join(packagesDir, entry.name, "package.json");
      if (!fs.existsSync(pkgJsonPath)) continue;
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as {
        name: string;
        private?: boolean;
      };
      if (pkg.private) continue;
      onDisk.push({ dir: `packages/${entry.name}`, name: pkg.name });
    }

    const inventorySpecifiers = new Set(PUBLIC_ENTRY_POINTS.map((e) => e.specifier));
    const inventoryDirs = new Set(PUBLISHABLE_PACKAGE_DIRS);

    for (const pkg of onDisk) {
      expect(
        inventoryDirs.has(pkg.dir),
        `PUBLISHABLE_PACKAGE_DIRS is missing ${pkg.dir}; the harness will not pack this package.`
      ).toBe(true);
      expect(
        inventorySpecifiers.has(pkg.name),
        `PUBLIC_ENTRY_POINTS is missing the root specifier "${pkg.name}"; the consumer fixture will not import it.`
      ).toBe(true);
    }
  });

  describe.each(TYPESCRIPT_VERSIONS_TO_TEST)("typescript %s", (tsVersion) => {
    let consumerDir: string;

    beforeAll(() => {
      consumerDir = makeTempDir(`formspec-dts-consumer-${tsVersion}-`);
    });

    afterAll(() => {
      if (consumerDir) {
        fs.rmSync(consumerDir, { recursive: true, force: true });
      }
    });

    it(
      "type-checks every public entry point",
      () => {
        const result = runConsumerCheck({
          repoRoot: REPO_ROOT,
          tarballDir: sharedTarballDir,
          consumerDir,
          typescriptVersion: tsVersion,
        });
        if (result.exitCode !== 0) {
          // Surface tsc's diagnostic output directly. Vitest will quote the
          // message, which keeps line/column information legible in CI logs.
          throw new Error(
            `tsc --noEmit (typescript ${tsVersion}) failed with exit code ${String(result.exitCode)}\n` +
              `STDOUT:\n${result.stdout}\n` +
              `STDERR:\n${result.stderr}`
          );
        }
        expect(result.stdout.trim()).toBe("");
      },
      // npm install + tsc on a fresh consumer dir is heavier than the
      // default vitest test timeout. Set generously; first run dominates.
      300_000
    );
  });

  describe("self-test (negative case)", () => {
    let consumerDir: string;

    beforeAll(() => {
      consumerDir = makeTempDir("formspec-dts-consumer-negative-");
    });

    afterAll(() => {
      if (consumerDir) {
        fs.rmSync(consumerDir, { recursive: true, force: true });
      }
    });

    it(
      "fails on a deliberate type error in the consumer fixture",
      () => {
        // Inject a clearly-wrong assignment into the consumer's index.ts
        // so we can verify the harness actually surfaces consumer
        // diagnostics rather than swallowing them. If this case ever
        // starts passing, the harness has stopped doing its job.
        const result = runConsumerCheck({
          repoRoot: REPO_ROOT,
          tarballDir: sharedTarballDir,
          consumerDir,
          typescriptVersion: "6.0.3",
          indexTsOverride: `
            // Imports a real entry point so the inventory still gets
            // exercised, then commits a plainly-wrong assignment so we
            // can verify the harness actually surfaces tsc diagnostics.
            import type * as core from "@formspec/core";
            type _Surface = keyof typeof core;
            declare const _check: _Surface;
            void _check;
            const _intentionalTypeError: number = "this should fail";
            void _intentionalTypeError;
          `,
        });
        expect(result.exitCode).not.toBe(0);
        // Check both streams: while `tsc --noEmit` emits diagnostics on
        // stdout today, future TypeScript releases (or environments that
        // detect TTY differently) could move them to stderr. Asserting on
        // the combined output keeps the harness self-test resilient.
        const combined = `${result.stdout}\n${result.stderr}`;
        expect(combined).toMatch(/error TS/);
      },
      300_000
    );
  });
});
