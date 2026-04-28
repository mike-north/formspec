import { describe, it, expect, afterEach } from "vitest";
import { mkdir, writeFile, rm, readFile as readNodeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname as nodeDirname, join, resolve as nodeResolve } from "node:path";
import {
  DEFAULT_CONSTRAINTS,
  DEFAULT_DSL_POLICY,
  defineConstraints,
  defineDSLPolicy,
  loadConfig,
  loadFormSpecConfig,
} from "../src/index.js";
import type { FileSystem } from "../src/index.js";

async function mkTempDir(): Promise<string> {
  const base = join(
    tmpdir(),
    `formspec-test-${String(Date.now())}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(base, { recursive: true });
  return base;
}

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkTempDir();
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

interface TrackingFileSystem {
  readonly fileSystem: FileSystem;
  readonly existsPaths: string[];
  readonly readFilePaths: string[];
  readonly resolveCalls: readonly string[][];
  readonly dirnamePaths: string[];
}

function createTrackingFileSystem(): TrackingFileSystem {
  const existsPaths: string[] = [];
  const readFilePaths: string[] = [];
  const resolveCalls: string[][] = [];
  const dirnamePaths: string[] = [];

  return {
    fileSystem: {
      async exists(path) {
        existsPaths.push(path);
        try {
          return (await stat(path)).isFile();
        } catch {
          return false;
        }
      },
      async readFile(path) {
        readFilePaths.push(path);
        return readNodeFile(path, "utf-8");
      },
      resolve(...segments) {
        resolveCalls.push(segments);
        return nodeResolve(...segments);
      },
      dirname(path) {
        dirnamePaths.push(path);
        return nodeDirname(path);
      },
    },
    existsPaths,
    readFilePaths,
    resolveCalls,
    dirnamePaths,
  };
}

/**
 * Writes a `formspec.config.ts` in a fresh temp dir and asserts that loading
 * it rejects with an error matching `messagePattern`. Used by regression
 * tests that cover malformed config shapes.
 */
async function expectConfigRejection(source: string, messagePattern: RegExp): Promise<void> {
  const dir = await createTempDir();
  const filePath = join(dir, "formspec.config.ts");
  await writeFile(filePath, source, "utf-8");
  await expect(loadFormSpecConfig({ configPath: filePath })).rejects.toThrow(messagePattern);
}

describe("loadFormSpecConfig", () => {
  describe("explicit configPath", () => {
    it("loads a formspec.config.ts file with a typed default export", async () => {
      const dir = await createTempDir();
      const filePath = join(dir, "formspec.config.ts");
      // Inline the identity function to avoid a module resolution dependency in the temp file
      await writeFile(
        filePath,
        `
function defineFormSpecConfig(cfg: object) { return cfg; }
export default defineFormSpecConfig({
  vendorPrefix: "x-test",
  enumSerialization: "oneOf",
  constraints: {
    fieldTypes: { dynamicEnum: "error" },
  },
});
`,
        "utf-8"
      );

      const result = await loadFormSpecConfig({ configPath: filePath });

      expect(result.found).toBe(true);
      if (!result.found) throw new Error("Expected found");
      expect(result.configPath).toBe(filePath);
      expect(result.config.vendorPrefix).toBe("x-test");
      expect(result.config.enumSerialization).toBe("oneOf");
      expect(result.config.constraints?.fieldTypes?.dynamicEnum).toBe("error");
    });

    it("loads a config file with a plain object default export", async () => {
      const dir = await createTempDir();
      const filePath = join(dir, "formspec.config.ts");
      await writeFile(
        filePath,
        `export default { constraints: { fieldTypes: { text: "error" } } };`,
        "utf-8"
      );

      const result = await loadFormSpecConfig({ configPath: filePath });

      expect(result.found).toBe(true);
      if (!result.found) throw new Error("Expected found");
      expect(result.config.constraints?.fieldTypes?.text).toBe("error");
    });

    it("accepts smart-size enum serialization", async () => {
      const dir = await createTempDir();
      const filePath = join(dir, "formspec.config.ts");
      await writeFile(filePath, `export default { enumSerialization: "smart-size" };`, "utf-8");

      const result = await loadFormSpecConfig({ configPath: filePath });

      expect(result.found).toBe(true);
      if (!result.found) throw new Error("Expected found");
      expect(result.config.enumSerialization).toBe("smart-size");
    });

    /**
     * Regression coverage for malformed `packages` override shapes. Each case
     * would have thrown a raw `TypeError` (e.g. from `Object.entries(null)`
     * or indexing a non-object) prior to the loader's explicit validation.
     *
     * @see https://github.com/mike-north/formspec/pull/356
     */
    it("rejects invalid package override enum serialization", async () => {
      await expectConfigRejection(
        `export default { packages: { "packages/*": { enumSerialization: "invalid" } } };`,
        /packages\["packages\/\*"\]\.enumSerialization/
      );
    });

    const invalidTopLevelPackages = [
      { label: "a string", source: `"smart-size"` },
      { label: "null", source: `null` },
      { label: "an array", source: `[]` },
      { label: "a number", source: `42` },
      { label: "a boolean", source: `true` },
    ] as const;

    for (const { label, source } of invalidTopLevelPackages) {
      it(`rejects packages field that is ${label}`, async () => {
        await expectConfigRejection(
          `export default { packages: ${source} };`,
          /"packages" must be an object mapping glob patterns to override objects/
        );
      });
    }

    const invalidOverrideEntries = [
      { label: "null", source: `null` },
      { label: "an array", source: `[]` },
      { label: "a number", source: `42` },
      { label: "a boolean", source: `true` },
      { label: "a string", source: `"oneOf"` },
    ] as const;

    for (const { label, source } of invalidOverrideEntries) {
      it(`rejects a package override entry that is ${label}`, async () => {
        await expectConfigRejection(
          `export default { packages: { "packages/*": ${source} } };`,
          /"packages\["packages\/\*"\]" must be an override object/
        );
      });
    }

    it("throws when configPath file does not exist", async () => {
      const dir = await createTempDir();
      const nonExistent = join(dir, "does-not-exist.ts");

      await expect(loadFormSpecConfig({ configPath: nonExistent })).rejects.toThrow(
        /Config file not found/
      );
    });

    it("uses the injected filesystem for explicit configPath resolution and existence checks", async () => {
      const dir = await createTempDir();
      const filePath = join(dir, "formspec.config.ts");
      await writeFile(filePath, `export default { vendorPrefix: "x-adapter" };`, "utf-8");
      const tracking = createTrackingFileSystem();

      const result = await loadFormSpecConfig({
        configPath: filePath,
        fileSystem: tracking.fileSystem,
      });

      expect(result.found).toBe(true);
      expect(tracking.resolveCalls).toContainEqual([filePath]);
      expect(tracking.existsPaths).toContain(filePath);
      expect(tracking.readFilePaths).not.toContain(filePath);
    });

    it("returns empty config for a file with empty default export", async () => {
      const dir = await createTempDir();
      const filePath = join(dir, "formspec.config.ts");
      await writeFile(filePath, `export default {};`, "utf-8");

      const result = await loadFormSpecConfig({ configPath: filePath });

      expect(result.found).toBe(true);
      if (!result.found) throw new Error("Expected found");
      expect(result.config).toEqual({});
    });

    it("throws when default export is an array", async () => {
      const dir = await createTempDir();
      const filePath = join(dir, "formspec.config.ts");
      await writeFile(filePath, `export default [];`, "utf-8");

      await expect(loadFormSpecConfig({ configPath: filePath })).rejects.toThrow(
        /default export must be a FormSpecConfig object/
      );
    });
  });

  describe("config file discovery via searchFrom", () => {
    it("finds formspec.config.ts in the searchFrom directory", async () => {
      const dir = await createTempDir();
      const filePath = join(dir, "formspec.config.ts");
      await writeFile(filePath, `export default { enumSerialization: "oneOf" };`, "utf-8");

      const result = await loadFormSpecConfig({ searchFrom: dir });

      expect(result.found).toBe(true);
      if (!result.found) throw new Error("Expected found");
      expect(result.configPath).toBe(filePath);
      expect(result.config.enumSerialization).toBe("oneOf");
    });

    it("discovers config file by walking up from a nested directory", async () => {
      const rootDir = await createTempDir();
      const nestedDir = join(rootDir, "packages", "my-pkg", "src");
      await mkdir(nestedDir, { recursive: true });

      const configPath = join(rootDir, "formspec.config.ts");
      await writeFile(configPath, `export default { vendorPrefix: "x-found" };`, "utf-8");

      const result = await loadFormSpecConfig({ searchFrom: nestedDir });

      expect(result.found).toBe(true);
      if (!result.found) throw new Error("Expected found");
      expect(result.configPath).toBe(configPath);
      expect(result.config.vendorPrefix).toBe("x-found");
    });

    it("prefers formspec.config.ts over .js variant in the same directory", async () => {
      const dir = await createTempDir();

      // Create both variants; .ts should win
      await writeFile(
        join(dir, "formspec.config.ts"),
        `export default { vendorPrefix: "x-ts" };`,
        "utf-8"
      );
      await writeFile(
        join(dir, "formspec.config.js"),
        `export default { vendorPrefix: "x-js" };`,
        "utf-8"
      );

      const result = await loadFormSpecConfig({ searchFrom: dir });

      expect(result.found).toBe(true);
      if (!result.found) throw new Error("Expected found");
      expect(result.config.vendorPrefix).toBe("x-ts");
    });

    it("stops at a workspace root boundary (package.json with workspaces)", async () => {
      const workspaceRoot = await createTempDir();
      // Write a workspace root package.json
      await writeFile(
        join(workspaceRoot, "package.json"),
        JSON.stringify({ name: "monorepo", workspaces: ["packages/*"] }),
        "utf-8"
      );

      // Create a package dir nested inside the workspace root
      const pkgDir = join(workspaceRoot, "packages", "my-pkg");
      await mkdir(pkgDir, { recursive: true });

      // No config file inside the package or at the workspace root
      const result = await loadFormSpecConfig({ searchFrom: pkgDir });

      // Should NOT find a config from a parent above workspace root
      expect(result.found).toBe(false);
    });

    it("returns found: false when no config file exists", async () => {
      const dir = await createTempDir();

      const result = await loadFormSpecConfig({ searchFrom: dir });

      expect(result.found).toBe(false);
    });

    it("uses the injected filesystem for discovery existence, path resolution, and parent traversal", async () => {
      const rootDir = await createTempDir();
      const nestedDir = join(rootDir, "packages", "my-pkg", "src");
      await mkdir(nestedDir, { recursive: true });
      const configPath = join(rootDir, "formspec.config.ts");
      await writeFile(configPath, `export default { vendorPrefix: "x-discovered" };`, "utf-8");
      const tracking = createTrackingFileSystem();

      const result = await loadFormSpecConfig({
        searchFrom: nestedDir,
        fileSystem: tracking.fileSystem,
      });

      expect(result.found).toBe(true);
      expect(tracking.resolveCalls).toContainEqual([nestedDir]);
      expect(tracking.resolveCalls).toContainEqual([rootDir, "formspec.config.ts"]);
      expect(tracking.existsPaths).toContain(configPath);
      expect(tracking.readFilePaths).not.toContain(configPath);
      expect(tracking.dirnamePaths).toContain(nestedDir);
    });

    it("checks workspace roots through the injected filesystem", async () => {
      const workspaceRoot = await createTempDir();
      await writeFile(
        join(workspaceRoot, "package.json"),
        JSON.stringify({ name: "monorepo", workspaces: ["packages/*"] }),
        "utf-8"
      );
      const pkgDir = join(workspaceRoot, "packages", "my-pkg");
      await mkdir(pkgDir, { recursive: true });
      const tracking = createTrackingFileSystem();

      const result = await loadFormSpecConfig({
        searchFrom: pkgDir,
        fileSystem: tracking.fileSystem,
      });

      expect(result.found).toBe(false);
      expect(tracking.readFilePaths).toContain(join(workspaceRoot, "package.json"));
    });

    it("resolves the default search directory through the injected filesystem", async () => {
      const tracking = createTrackingFileSystem();

      await loadFormSpecConfig({ fileSystem: tracking.fileSystem });

      expect(tracking.resolveCalls).toContainEqual(["."]);
    });

    it("checks candidate config paths through the injected filesystem when no config exists", async () => {
      const dir = await createTempDir();
      const tracking = createTrackingFileSystem();

      const result = await loadFormSpecConfig({ searchFrom: dir, fileSystem: tracking.fileSystem });

      expect(result.found).toBe(false);
      expect(tracking.existsPaths).toContain(join(dir, "formspec.config.ts"));
      expect(tracking.existsPaths).toContain(join(dir, "formspec.config.mts"));
      expect(tracking.existsPaths).toContain(join(dir, "formspec.config.js"));
      expect(tracking.existsPaths).toContain(join(dir, "formspec.config.mjs"));
    });

    it("defaults searchFrom when no options are provided", async () => {
      // Just verify the call doesn't throw and returns a result shape
      const result = await loadFormSpecConfig();

      expect(result).toHaveProperty("found");
    });
  });

  describe("config file name priority", () => {
    it("discovers formspec.config.mts when .ts is absent", async () => {
      const dir = await createTempDir();
      await writeFile(
        join(dir, "formspec.config.mts"),
        `export default { vendorPrefix: "x-mts" };`,
        "utf-8"
      );

      const result = await loadFormSpecConfig({ searchFrom: dir });

      expect(result.found).toBe(true);
      if (!result.found) throw new Error("Expected found");
      expect(result.config.vendorPrefix).toBe("x-mts");
    });

    it("discovers formspec.config.js when .ts and .mts are absent", async () => {
      const dir = await createTempDir();
      await writeFile(
        join(dir, "formspec.config.js"),
        `export default { vendorPrefix: "x-js" };`,
        "utf-8"
      );

      const result = await loadFormSpecConfig({ searchFrom: dir });

      expect(result.found).toBe(true);
      if (!result.found) throw new Error("Expected found");
      expect(result.config.vendorPrefix).toBe("x-js");
    });
  });
});

describe("loadConfig (deprecated wrapper)", () => {
  it("returns resolved constraints with defaults applied", async () => {
    const dir = await createTempDir();
    const filePath = join(dir, "formspec.config.ts");
    await writeFile(
      filePath,
      `export default { constraints: { fieldTypes: { dynamicEnum: "error" } } };`,
      "utf-8"
    );

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing deprecated API
    const result = await loadConfig({ configPath: filePath });

    expect(result.found).toBe(true);
    expect(result.configPath).toBe(filePath);
    // Constraints resolved with defaults
    expect(result.config.fieldTypes.dynamicEnum).toBe("error");
    expect(result.config.fieldTypes.text).toBe("off"); // default
  });

  it("returns defaults when no config file exists", async () => {
    const dir = await createTempDir();

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing deprecated API
    const result = await loadConfig({ searchFrom: dir });

    expect(result.found).toBe(false);
    expect(result.configPath).toBeNull();
    expect(result.config.fieldTypes.text).toBe("off");
  });

  it("delegates filesystem access to loadFormSpecConfig", async () => {
    const dir = await createTempDir();
    const filePath = join(dir, "formspec.config.ts");
    await writeFile(
      filePath,
      `export default { constraints: { fieldTypes: { dynamicEnum: "error" } } };`,
      "utf-8"
    );
    const tracking = createTrackingFileSystem();

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing deprecated API
    const result = await loadConfig({ configPath: filePath, fileSystem: tracking.fileSystem });

    expect(result.found).toBe(true);
    expect(result.config.fieldTypes.dynamicEnum).toBe("error");
    expect(tracking.resolveCalls).toContainEqual([filePath]);
    expect(tracking.existsPaths).toContain(filePath);
    expect(tracking.readFilePaths).not.toContain(filePath);
  });
});

/* eslint-disable @typescript-eslint/no-deprecated -- compatibility tests cover deprecated aliases */
describe("defineConstraints", () => {
  it("keeps canonical DSL-policy names aligned with deprecated aliases", () => {
    const policy = defineDSLPolicy({
      fieldTypes: {
        dynamicEnum: "error",
      },
    });

    const legacyPolicy = defineConstraints({
      fieldTypes: {
        dynamicEnum: "error",
      },
    });

    expect(policy).toEqual(legacyPolicy);
    expect(DEFAULT_DSL_POLICY).toBe(DEFAULT_CONSTRAINTS);
  });

  it("creates config from object literal", () => {
    const config = defineConstraints({
      fieldTypes: {
        dynamicEnum: "error",
        array: "warn",
      },
      layout: {
        group: "error",
        maxNestingDepth: 1,
      },
    });

    expect(config.fieldTypes.dynamicEnum).toBe("error");
    expect(config.fieldTypes.array).toBe("warn");
    expect(config.fieldTypes.text).toBe("off"); // default
    expect(config.layout.group).toBe("error");
    expect(config.layout.maxNestingDepth).toBe(1);
  });

  it("handles empty config", () => {
    const config = defineConstraints({});

    expect(config.fieldTypes.text).toBe("off");
    expect(config.layout.group).toBe("off");
    expect(config.uiSchema.layouts.VerticalLayout).toBe("off");
  });

  it("handles partial nested config", () => {
    const config = defineConstraints({
      uiSchema: {
        rules: {
          enabled: "error",
        },
      },
    });

    expect(config.uiSchema.rules.enabled).toBe("error");
    expect(config.uiSchema.rules.effects.SHOW).toBe("off"); // default
    expect(config.uiSchema.layouts.VerticalLayout).toBe("off"); // default
  });
});
/* eslint-enable @typescript-eslint/no-deprecated */
