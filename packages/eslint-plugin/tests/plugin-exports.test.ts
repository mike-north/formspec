import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { ESLint } from "eslint";
import type { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { ESLintUtils } from "@typescript-eslint/utils";
import type { TSESLint } from "@typescript-eslint/utils";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import packageJson from "../package.json" with { type: "json" };
import plugin, {
  analyzeMetadataForNode,
  analyzeMetadataForSourceFile,
  configs,
  meta,
  rules,
} from "../src/index.js";

function getConfigRuleIds(config: TSESLint.FlatConfig.ConfigArray): string[] {
  return config.flatMap((entry) => Object.keys(entry.rules ?? {}));
}

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
        "tag-recognition/no-markdown-formatting",
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

  it("uses the flat-config plugin namespace consistently", () => {
    const configuredRuleIds = [
      ...getConfigRuleIds(configs.recommended),
      ...getConfigRuleIds(configs.strict),
    ];

    expect(configs.recommended[0]?.plugins).toHaveProperty("formspec");
    expect(configs.strict[0]?.plugins).toHaveProperty("formspec");
    expect(configs.recommended[0]?.plugins).not.toHaveProperty("@formspec");
    expect(configs.strict[0]?.plugins).not.toHaveProperty("@formspec");

    for (const ruleId of configuredRuleIds) {
      expect(ruleId.startsWith("formspec/")).toBe(true);
      expect(ruleId.startsWith("@formspec/")).toBe(false);
      expect(ruleId.slice("formspec/".length)).toBeTruthy();
      expect(rules).toHaveProperty(ruleId.slice("formspec/".length));
    }
  });

  it("re-exports downstream metadata analysis helpers", () => {
    expect(typeof analyzeMetadataForNode).toBe("function");
    expect(typeof analyzeMetadataForSourceFile).toBe("function");
  });

  describe("ESLint 9 flat config integration", () => {
    let tmpDir: string | undefined;

    beforeAll(() => {
      tmpDir = mkdtempSync(join(os.tmpdir(), "formspec-eslint-test-"));
      writeFileSync(
        join(tmpDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { strict: true } })
      );
      writeFileSync(join(tmpDir, "test.ts"), "export const x = 1;\n");
    });

    afterAll(() => {
      if (tmpDir) {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("resolves and loads every rule against a real project", async () => {
      const allRulesEnabled = Object.fromEntries(
        Object.keys(rules).map((name) => [`formspec/${name}`, "warn"])
      );
      // The overrideConfig object is structurally compatible with ESLint 9 flat
      // config at runtime. The cast through unknown is required because
      // @typescript-eslint/utils's FlatConfig types and eslint's Linter.Config
      // diverge at the type-definition level (RuleModuleWithName vs RuleDefinition,
      // LanguageOptions index signatures) even though they represent the same shape.
      const overrideConfig = {
        files: ["**/*.ts"],
        languageOptions: {
          parser: tsParser,
          parserOptions: { projectService: true, tsconfigRootDir: tmpDir },
        },
        plugins: { formspec: { meta, rules } },
        rules: allRulesEnabled,
      };

      const eslint = new ESLint({
        cwd: tmpDir,
        overrideConfigFile: true,
        overrideConfig: overrideConfig as unknown as Linter.Config,
      });

      const [result] = await eslint.lintFiles(["test.ts"]);
      if (result === undefined) throw new Error("Expected lint result");
      expect(result.messages).toEqual([]);
    });

    it("supports downstream parser-services rules that reuse metadata analysis", async () => {
      if (tmpDir === undefined) {
        throw new Error("Expected temporary directory");
      }

      const seen: {
        readonly program: object;
        readonly apiName: string | undefined;
        readonly fileLogicalNames: readonly string[];
        readonly checkerCalls: number;
      }[] = [];

      const metadataProbeRule = ESLintUtils.RuleCreator((name) => name)({
        name: "metadata-probe",
        meta: {
          type: "problem",
          docs: { description: "Exercise downstream metadata analysis helpers" },
          schema: [],
          messages: {
            unexpected: "Unexpected metadata analysis result",
          },
        },
        defaultOptions: [],
        create(context) {
          const services = ESLintUtils.getParserServices(context);
          const originalGetTypeChecker = services.program.getTypeChecker.bind(services.program);
          let checkerCalls = 0;
          services.program.getTypeChecker = (() => {
            checkerCalls += 1;
            return originalGetTypeChecker();
          }) as typeof services.program.getTypeChecker;

          return {
            TSPropertySignature(node) {
              const tsNode = services.esTreeNodeToTSNodeMap.get(node);
              const nodeAnalysis = analyzeMetadataForNode({
                program: services.program,
                node: tsNode,
              });
              const fileAnalysis = analyzeMetadataForSourceFile({
                program: services.program,
                sourceFile: tsNode.getSourceFile(),
              });

              seen.push({
                program: services.program,
                apiName: nodeAnalysis?.resolvedMetadata?.apiName?.value,
                fileLogicalNames: fileAnalysis.map((analysis) => analysis.logicalName),
                checkerCalls,
              });

              if (nodeAnalysis?.resolvedMetadata?.apiName?.value !== "customer_name") {
                context.report({ node, messageId: "unexpected" });
              }
            },
          };
        },
      });

      writeFileSync(
        join(tmpDir, "metadata.ts"),
        [
          "export interface CustomerRecord {",
          "  /** @apiName customer_name */",
          "  customerName: string;",
          "}",
          "",
        ].join("\n")
      );

      // The overrideConfig object is structurally compatible with ESLint 9 flat
      // config at runtime. The cast through unknown is required because
      // @typescript-eslint/utils's FlatConfig types and eslint's Linter.Config
      // diverge at the type-definition level (RuleModuleWithName vs RuleDefinition,
      // LanguageOptions index signatures) even though they represent the same shape.
      const overrideConfig = {
        files: ["**/*.ts"],
        languageOptions: {
          parser: tsParser,
          parserOptions: { projectService: true, tsconfigRootDir: tmpDir },
        },
        plugins: {
          formspec: { meta, rules },
          probe: {
            meta: { name: "probe", version: "0.0.0" },
            rules: { "metadata-probe": metadataProbeRule },
          },
        },
        rules: {
          "probe/metadata-probe": "error",
        },
      };

      const eslint = new ESLint({
        cwd: tmpDir,
        overrideConfigFile: true,
        overrideConfig: overrideConfig as unknown as Linter.Config,
      });

      const [result] = await eslint.lintFiles(["metadata.ts"]);
      if (result === undefined) throw new Error("Expected lint result");
      expect(result.messages).toEqual([]);
      expect(seen).toHaveLength(1);
      expect(seen[0]?.apiName).toBe("customer_name");
      expect(seen[0]?.fileLogicalNames).toContain("CustomerRecord");
      expect(seen[0]?.fileLogicalNames).toContain("customerName");
      expect(seen[0]?.checkerCalls).toBeGreaterThanOrEqual(2);
    });
  });
});
