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
  it("declares an entry-point inventory that matches every published package", () => {
    // Sanity: every publishable package's `.` export should be in the
    // inventory. Subpath exports are listed individually. Excluded entries
    // count as covered (they live in the inventory, just gated). This
    // guards against silently dropping a new package from the harness.
    const specifiers = new Set(PUBLIC_ENTRY_POINTS.map((e) => e.specifier));
    const expectedRootSpecifiers = [
      "@formspec/analysis",
      "@formspec/build",
      "@formspec/cli",
      "@formspec/config",
      "@formspec/core",
      "@formspec/dsl",
      "@formspec/eslint-plugin",
      "@formspec/language-server",
      "@formspec/runtime",
      "@formspec/ts-plugin",
      "@formspec/validator",
      "formspec",
    ];
    for (const expected of expectedRootSpecifiers) {
      expect(specifiers.has(expected), `missing entry-point for ${expected}`).toBe(true);
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
            `tsc --noEmit (typescript ${tsVersion}) failed with exit code ${result.exitCode}\n` +
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
        expect(result.stdout).toMatch(/error TS/);
      },
      300_000
    );
  });
});
