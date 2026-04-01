import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import packageJson from "../../package.json" with { type: "json" };
import plugin, { configs, meta, rules } from "../index.js";

describe("@formspec/eslint-plugin exports", () => {
  it("exposes the expected default export shape", () => {
    expect(plugin.meta).toBe(meta);
    expect(plugin.rules).toBe(rules);
    expect(plugin.configs).toBe(configs);
  });

  it("exposes rule maps and flat configs used by consumers and doc generation", () => {
    expect(meta).toMatchObject({
      name: "@formspec/eslint-plugin",
      version: packageJson.version,
    });

    expect(Object.keys(rules)).toEqual(
      expect.arrayContaining([
        "tag-recognition/no-unknown-tags",
        "constraint-validation/no-description-tag",
        "constraints-allowed-field-types",
      ])
    );

    expect(configs.recommended).toBeInstanceOf(Array);
    expect(configs.strict).toBeInstanceOf(Array);
    expect(configs.recommended[0]?.plugins?.["formspec"]).toMatchObject({
      meta,
      rules,
    });
    expect(configs.strict[0]?.plugins?.["formspec"]).toMatchObject({
      meta,
      rules,
    });
  });

  describe("ESLint 9 flat config integration", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "formspec-eslint-test-"));
      writeFileSync(join(tmpDir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }));
      writeFileSync(join(tmpDir, "test.ts"), "export const x = 1;\n");
    });

    afterAll(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("resolves and loads every rule against a real project", async () => {
      const allRulesEnabled = Object.fromEntries(
        Object.keys(rules).map((name) => [`formspec/${name}`, "warn"]),
      );

      const eslint = new ESLint({
        cwd: tmpDir,
        overrideConfigFile: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        overrideConfig: {
          files: ["**/*.ts"],
          languageOptions: {
            parser: tsParser,
            parserOptions: { projectService: true, tsconfigRootDir: tmpDir },
          },
          plugins: { formspec: { meta, rules } },
          rules: allRulesEnabled,
        } as any,
      });

      const [result] = await eslint.lintFiles(["test.ts"]);
      expect(result.messages).toEqual([]);
    });
  });
});
