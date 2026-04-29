import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import * as ts from "typescript";

import {
  assertTypeScript6AliasResolution,
  discoverTypeScriptApiWorkspaceRoots,
  prepareTypeScript6Compatibility,
  runTsgoTypecheck,
  writeScopedTsgoRootConfig,
} from "./tsgo-ci.mts";

async function withFixture(
  files: Record<string, string>,
  testFn: (root: string) => void | Promise<void>
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "formspec-tsgo-ci-"));
  try {
    for (const [filePath, contents] of Object.entries(files)) {
      const absolutePath = path.join(root, filePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents, "utf8");
    }

    await testFn(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

function packageJson(packageJson: object): string {
  return `${JSON.stringify(packageJson, null, 2)}\n`;
}

function parseJsonRecord(contents: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(contents);
  assert.equal(typeof parsed, "object");
  assert.notEqual(parsed, null);
  assert.equal(Array.isArray(parsed), false);
  return parsed as Record<string, unknown>;
}

void describe("prepareTypeScript6Compatibility", () => {
  void it("adds tsc launchers and tsserver subpath bridges for the TS 6 alias package", async () => {
    await withFixture(
      {
        "node_modules/.bin/tsc6": "#!/usr/bin/env sh\n",
        "node_modules/typescript/package.json": packageJson({
          name: "@typescript/typescript6",
          version: "6.0.3",
        }),
        "node_modules/typescript/node_modules/typescript/package.json": packageJson({
          name: "typescript",
          version: "6.0.3",
        }),
        "node_modules/typescript/node_modules/typescript/lib/typescript.js": "",
        "node_modules/typescript/node_modules/typescript/lib/tsserver.js": "",
        "node_modules/typescript/node_modules/typescript/lib/tsserverlibrary.d.ts": "",
        "node_modules/typescript/node_modules/typescript/lib/tsserverlibrary.js": "",
      },
      async (root) => {
        await mkdir(path.join(root, "node_modules/.bin"), { recursive: true });
        await mkdir(path.join(root, "packages/build/node_modules/.bin"), { recursive: true });
        await mkdir(path.join(root, "e2e/node_modules/.bin"), { recursive: true });

        prepareTypeScript6Compatibility({
          repoRoot: root,
          packageRoots: ["packages/build"],
        });

        const rootLauncher = await readFile(path.join(root, "node_modules/.bin/tsc"), "utf8");
        const packageLauncher = await readFile(
          path.join(root, "packages/build/node_modules/.bin/tsc"),
          "utf8"
        );
        const e2eLauncher = await readFile(path.join(root, "e2e/node_modules/.bin/tsc"), "utf8");

        assert.match(rootLauncher, /node_modules\/\.bin\/tsc6/);
        assert.equal(packageLauncher, rootLauncher);
        assert.equal(e2eLauncher, rootLauncher);

        for (const fileName of ["tsserver.js", "tsserverlibrary.d.ts", "tsserverlibrary.js"]) {
          const stat = await lstat(path.join(root, "node_modules/typescript/lib", fileName));
          assert.equal(stat.isSymbolicLink(), true);
        }
      }
    );
  });
});

void describe("discoverTypeScriptApiWorkspaceRoots", () => {
  void it("discovers workspace packages that declare a direct TypeScript dependency", async () => {
    await withFixture(
      {
        "package.json": packageJson({ devDependencies: { typescript: "^6.0.0" } }),
        "packages/build/package.json": packageJson({
          name: "@formspec/build",
          peerDependencies: { typescript: ">=5.7.3 <7" },
        }),
        "packages/core/package.json": packageJson({ name: "@formspec/core" }),
        "examples/consumer/package.json": packageJson({
          name: "consumer",
          devDependencies: { typescript: "^6.0.0" },
        }),
        "e2e/package.json": packageJson({
          name: "@formspec/e2e",
          devDependencies: { typescript: ">=5.7.3 <7" },
        }),
      },
      (root) => {
        assert.deepEqual(discoverTypeScriptApiWorkspaceRoots({ repoRoot: root }), [
          ".",
          "packages/build",
          "examples/consumer",
          "e2e",
        ]);
      }
    );
  });
});

void describe("assertTypeScript6AliasResolution", () => {
  void it("accepts workspaces that resolve the TypeScript 6 alias package", async () => {
    await withFixture(
      {
        "package.json": packageJson({ private: true }),
        "packages/build/package.json": packageJson({ name: "@formspec/build" }),
        "node_modules/typescript/package.json": packageJson({
          name: "@typescript/typescript6",
          version: "6.0.3",
        }),
      },
      (root) => {
        assert.deepEqual(
          assertTypeScript6AliasResolution({
            repoRoot: root,
            workspaceRoots: [".", "packages/build"],
          }),
          [
            { workspaceRoot: ".", packageName: "@typescript/typescript6", version: "6.0.3" },
            {
              workspaceRoot: "packages/build",
              packageName: "@typescript/typescript6",
              version: "6.0.3",
            },
          ]
        );
      }
    );
  });

  void it("rejects workspaces that resolve the regular TypeScript package", async () => {
    await withFixture(
      {
        "package.json": packageJson({ private: true }),
        "node_modules/typescript/package.json": packageJson({
          name: "typescript",
          version: "6.0.3",
        }),
      },
      (root) => {
        assert.throws(
          () =>
            assertTypeScript6AliasResolution({
              repoRoot: root,
              workspaceRoots: ["."],
            }),
          /resolved typescript@6\.0\.3, expected @typescript\/typescript6/
        );
      }
    );
  });
});

void describe("writeScopedTsgoRootConfig", () => {
  void it("limits direct tsgo coverage to package src and test files", async () => {
    await withFixture(
      {
        "package.json": packageJson({ private: true }),
        "tsconfig.json": ["{", '  "compilerOptions": {', '    "strict": true', "  }", "}", ""].join(
          "\n"
        ),
      },
      async (root) => {
        writeScopedTsgoRootConfig({ repoRoot: root, typescript: ts });

        const parsed = parseJsonRecord(await readFile(path.join(root, "tsconfig.json"), "utf8"));
        assert.deepEqual(parsed["include"], ["packages/*/src/**/*", "packages/*/tests/**/*"]);
        assert.deepEqual(parsed["exclude"], ["packages/*/tests/**/*.test-d.ts"]);
        assert.deepEqual(parsed["compilerOptions"], { strict: true });
      }
    );
  });
});

void describe("e2e tsgo config", () => {
  void it("keeps broad e2e coverage scoped away from benchmarks", async () => {
    const parsed = parseJsonRecord(await readFile("e2e/tsconfig.tsgo.json", "utf8"));
    const compilerOptions = parsed["compilerOptions"];
    assert.equal(typeof compilerOptions, "object");
    assert.notEqual(compilerOptions, null);
    assert.equal(Array.isArray(compilerOptions), false);

    const options = compilerOptions as Record<string, unknown>;
    assert.equal(parsed["extends"], "../tsconfig.json");
    assert.equal(options["rootDir"], "..");
    assert.equal(options["noEmit"], true);
    assert.equal(options["noUncheckedIndexedAccess"], false);
    assert.equal(options["noPropertyAccessFromIndexSignature"], false);
    assert.equal(options["paths"], undefined);
    assert.deepEqual(parsed["include"], ["helpers/**/*.ts", "fixtures/**/*.ts", "tests/**/*.ts"]);
    assert.deepEqual(parsed["exclude"], [
      "benchmarks/**/*",
      "tests/hybrid-tooling-benchmark.test.ts",
    ]);
  });
});

void describe("runTsgoTypecheck", () => {
  void it("runs package and e2e tsgo checks after restoring the root tsconfig", async () => {
    const originalConfig = '{ "compilerOptions": { "strict": true } }\n';

    await withFixture(
      {
        "package.json": packageJson({ private: true }),
        "tsconfig.json": originalConfig,
      },
      async (root) => {
        const commandArgs: string[][] = [];
        const commandConfigs: unknown[] = [];
        const result = runTsgoTypecheck({
          repoRoot: root,
          typescript: ts,
          runCommand: (args) => {
            commandArgs.push([...args]);
            commandConfigs.push(JSON.parse(readFileSync(path.join(root, "tsconfig.json"), "utf8")));
            return { status: 0 };
          },
        });

        assert.deepEqual(commandArgs, [
          ["exec", "tsgo", "--noEmit", "--skipLibCheck"],
          ["exec", "tsgo", "--noEmit", "--skipLibCheck", "-p", "e2e/tsconfig.tsgo.json"],
        ]);
        assert.deepEqual(commandConfigs, [
          {
            compilerOptions: { strict: true },
            include: ["packages/*/src/**/*", "packages/*/tests/**/*"],
            exclude: ["packages/*/tests/**/*.test-d.ts"],
          },
          { compilerOptions: { strict: true } },
        ]);
        assert.equal(result.status, 0);
        assert.equal(await readFile(path.join(root, "tsconfig.json"), "utf8"), originalConfig);
      }
    );
  });

  void it("restores the root tsconfig after a failing package tsgo command", async () => {
    const originalConfig = '{ "compilerOptions": { "strict": true } }\n';

    await withFixture(
      {
        "package.json": packageJson({ private: true }),
        "tsconfig.json": originalConfig,
      },
      async (root) => {
        const commandArgs: string[][] = [];

        assert.throws(
          () =>
            runTsgoTypecheck({
              repoRoot: root,
              typescript: ts,
              runCommand: (args) => {
                commandArgs.push([...args]);
                return { status: 1 };
              },
            }),
          /package tsgo typecheck failed with exit status 1/
        );

        assert.deepEqual(commandArgs, [["exec", "tsgo", "--noEmit", "--skipLibCheck"]]);
        assert.equal(await readFile(path.join(root, "tsconfig.json"), "utf8"), originalConfig);
      }
    );
  });

  void it("reports e2e tsgo failures distinctly after restoring the root tsconfig", async () => {
    const originalConfig = '{ "compilerOptions": { "strict": true } }\n';

    await withFixture(
      {
        "package.json": packageJson({ private: true }),
        "tsconfig.json": originalConfig,
      },
      async (root) => {
        const commandArgs: string[][] = [];
        let e2eCommandConfig: unknown;

        assert.throws(
          () =>
            runTsgoTypecheck({
              repoRoot: root,
              typescript: ts,
              runCommand: (args) => {
                commandArgs.push([...args]);
                if (args.includes("-p")) {
                  e2eCommandConfig = JSON.parse(
                    readFileSync(path.join(root, "tsconfig.json"), "utf8")
                  );
                  return { status: 1 };
                }
                return { status: 0 };
              },
            }),
          /e2e tsgo typecheck failed with exit status 1/
        );

        assert.deepEqual(commandArgs, [
          ["exec", "tsgo", "--noEmit", "--skipLibCheck"],
          ["exec", "tsgo", "--noEmit", "--skipLibCheck", "-p", "e2e/tsconfig.tsgo.json"],
        ]);
        assert.deepEqual(e2eCommandConfig, { compilerOptions: { strict: true } });
        assert.equal(await readFile(path.join(root, "tsconfig.json"), "utf8"), originalConfig);
      }
    );
  });
});
