import { describe, it, expect, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFormSpecConfig, loadConfig, defineConstraints } from "../index.js";

async function mkTempDir(): Promise<string> {
  const base = join(tmpdir(), `formspec-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
        "utf-8",
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
        "utf-8",
      );

      const result = await loadFormSpecConfig({ configPath: filePath });

      expect(result.found).toBe(true);
      if (!result.found) throw new Error("Expected found");
      expect(result.config.constraints?.fieldTypes?.text).toBe("error");
    });

    it("throws when configPath file does not exist", async () => {
      const dir = await createTempDir();
      const nonExistent = join(dir, "does-not-exist.ts");

      await expect(loadFormSpecConfig({ configPath: nonExistent })).rejects.toThrow(
        /Config file not found/,
      );
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
        /default export must be a FormSpecConfig object/,
      );
    });
  });

  describe("config file discovery via searchFrom", () => {
    it("finds formspec.config.ts in the searchFrom directory", async () => {
      const dir = await createTempDir();
      const filePath = join(dir, "formspec.config.ts");
      await writeFile(
        filePath,
        `export default { enumSerialization: "oneOf" };`,
        "utf-8",
      );

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
      await writeFile(
        configPath,
        `export default { vendorPrefix: "x-found" };`,
        "utf-8",
      );

      const result = await loadFormSpecConfig({ searchFrom: nestedDir });

      expect(result.found).toBe(true);
      if (!result.found) throw new Error("Expected found");
      expect(result.configPath).toBe(configPath);
      expect(result.config.vendorPrefix).toBe("x-found");
    });

    it("prefers formspec.config.ts over .js variant in the same directory", async () => {
      const dir = await createTempDir();

      // Create both variants; .ts should win
      await writeFile(join(dir, "formspec.config.ts"), `export default { vendorPrefix: "x-ts" };`, "utf-8");
      await writeFile(join(dir, "formspec.config.js"), `export default { vendorPrefix: "x-js" };`, "utf-8");

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
        "utf-8",
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

    it("defaults searchFrom to process.cwd() when no options are provided", async () => {
      // Just verify the call doesn't throw and returns a result shape
      const result = await loadFormSpecConfig();

      expect(result).toHaveProperty("found");
    });
  });

  describe("config file name priority", () => {
    it("discovers formspec.config.mts when .ts is absent", async () => {
      const dir = await createTempDir();
      await writeFile(join(dir, "formspec.config.mts"), `export default { vendorPrefix: "x-mts" };`, "utf-8");

      const result = await loadFormSpecConfig({ searchFrom: dir });

      expect(result.found).toBe(true);
      if (!result.found) throw new Error("Expected found");
      expect(result.config.vendorPrefix).toBe("x-mts");
    });

    it("discovers formspec.config.js when .ts and .mts are absent", async () => {
      const dir = await createTempDir();
      await writeFile(join(dir, "formspec.config.js"), `export default { vendorPrefix: "x-js" };`, "utf-8");

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
      "utf-8",
    );

    const result = await loadConfig({ configPath: filePath });

    expect(result.found).toBe(true);
    expect(result.configPath).toBe(filePath);
    // Constraints resolved with defaults
    expect(result.config.fieldTypes.dynamicEnum).toBe("error");
    expect(result.config.fieldTypes.text).toBe("off"); // default
  });

  it("returns defaults when no config file exists", async () => {
    const dir = await createTempDir();

    const result = await loadConfig({ searchFrom: dir });

    expect(result.found).toBe(false);
    expect(result.configPath).toBeNull();
    expect(result.config.fieldTypes.text).toBe("off");
  });
});

describe("defineConstraints", () => {
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
