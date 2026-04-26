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
  noDescriptionTag,
  noUnsupportedDescriptionTag,
  rules,
} from "../src/index.js";

function getConfigRuleIds(config: TSESLint.FlatConfig.ConfigArray): string[] {
  return config.flatMap((entry) => Object.keys(entry.rules ?? {}));
}

const canonicalRuleIds = [
  "tag-recognition/no-unknown-tags",
  "tag-recognition/require-tag-arguments",
  "tag-recognition/no-disabled-tags",
  "tag-recognition/no-markdown-formatting",
  "tag-recognition/tsdoc-comment-syntax",
  "value-parsing/valid-numeric-value",
  "value-parsing/valid-integer-value",
  "value-parsing/valid-regex-pattern",
  "value-parsing/valid-json-value",
  "type-compatibility/tag-type-check",
  "target-resolution/valid-path-target",
  "target-resolution/valid-member-target",
  "target-resolution/no-unsupported-targeting",
  "target-resolution/no-member-target-on-object",
  "target-resolution/valid-target-variant",
  "constraint-validation/no-contradictions",
  "constraint-validation/no-duplicate-tags",
  "constraint-validation/no-contradictory-rules",
  "constraint-validation/valid-discriminator",
  "constraint-validation/no-double-underscore-fields",
  "constraint-validation/no-default-on-required-field",
  "documentation/no-unsupported-description-tag",
  "dsl-policy/allowed-field-types",
  "dsl-policy/allowed-layouts",
] as const;

const deprecatedRuleAliases = [
  "constraint-validation/no-description-tag",
  "constraints-allowed-field-types",
  "constraints-allowed-layouts",
] as const;

const deprecatedRuleReplacements = {
  "constraint-validation/no-description-tag": "documentation/no-unsupported-description-tag",
  "constraints-allowed-field-types": "dsl-policy/allowed-field-types",
  "constraints-allowed-layouts": "dsl-policy/allowed-layouts",
} as const;

interface DeprecatedAliasBehaviorCase {
  readonly aliasId: keyof typeof deprecatedRuleReplacements;
  readonly fileName: string;
  readonly ruleEntry: Linter.RuleEntry;
  readonly code: string;
  readonly messageId: string;
}

interface DeprecatedRuleMeta {
  readonly deprecated?: unknown;
  readonly replacedBy?: readonly string[];
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

    expect(Object.keys(rules).sort()).toEqual(
      [...canonicalRuleIds, ...deprecatedRuleAliases].sort()
    );

    for (const ruleId of canonicalRuleIds) {
      expect(rules[ruleId].meta.deprecated).toBeFalsy();
    }

    for (const aliasId of deprecatedRuleAliases) {
      const aliasMeta = rules[aliasId].meta as DeprecatedRuleMeta;
      expect(rules[aliasId].name).toBe(aliasId);
      expect(aliasMeta.deprecated).toBe(true);
      expect(aliasMeta.replacedBy).toEqual([deprecatedRuleReplacements[aliasId]]);
    }

    expect(noUnsupportedDescriptionTag.name).toBe("documentation/no-unsupported-description-tag");
    /* eslint-disable @typescript-eslint/no-deprecated -- These assertions pin the compatibility export. */
    expect(noDescriptionTag.name).toBe("constraint-validation/no-description-tag");
    expect((noDescriptionTag.meta as DeprecatedRuleMeta).deprecated).toBe(true);
    /* eslint-enable @typescript-eslint/no-deprecated */

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

  it("enables canonical rule IDs in presets without deprecated aliases", () => {
    const recommendedRuleIds = getConfigRuleIds(configs.recommended).sort();
    const strictRuleIds = getConfigRuleIds(configs.strict).sort();
    const expectedPresetRuleIds = canonicalRuleIds.map((ruleId) => `formspec/${ruleId}`).sort();

    expect(recommendedRuleIds).toEqual(expectedPresetRuleIds);
    expect(strictRuleIds).toEqual(expectedPresetRuleIds);

    for (const aliasId of deprecatedRuleAliases) {
      expect(recommendedRuleIds).not.toContain(`formspec/${aliasId}`);
      expect(strictRuleIds).not.toContain(`formspec/${aliasId}`);
    }

    expect(configs.recommended[0]?.rules).toMatchObject({
      "formspec/tag-recognition/no-markdown-formatting": "warn",
      "formspec/documentation/no-unsupported-description-tag": "error",
      "formspec/dsl-policy/allowed-field-types": "error",
      "formspec/dsl-policy/allowed-layouts": "error",
    });
    expect(configs.strict[0]?.rules).toMatchObject({
      "formspec/tag-recognition/no-markdown-formatting": "error",
      "formspec/documentation/no-unsupported-description-tag": "error",
      "formspec/dsl-policy/allowed-field-types": "error",
      "formspec/dsl-policy/allowed-layouts": "error",
    });
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

    function createEslintForRules(ruleSettings: NonNullable<Linter.Config["rules"]>): ESLint {
      if (tmpDir === undefined) {
        throw new Error("Expected temporary directory");
      }

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
        rules: ruleSettings,
      };

      return new ESLint({
        cwd: tmpDir,
        overrideConfigFile: true,
        overrideConfig: overrideConfig as unknown as Linter.Config,
      });
    }

    it("resolves and loads every rule against a real project", async () => {
      const allRulesEnabled = Object.fromEntries(
        Object.keys(rules).map((name) => [`formspec/${name}`, "warn"])
      ) as NonNullable<Linter.Config["rules"]>;
      const eslint = createEslintForRules(allRulesEnabled);

      const [result] = await eslint.lintFiles(["test.ts"]);
      if (result === undefined) throw new Error("Expected lint result");
      expect(result.messages).toEqual([]);
    });

    it("reports deprecated aliases with their canonical replacements", async () => {
      const aliasRulesEnabled = Object.fromEntries(
        deprecatedRuleAliases.map((name) => [`formspec/${name}`, "warn"])
      ) as NonNullable<Linter.Config["rules"]>;
      const eslint = createEslintForRules(aliasRulesEnabled);

      const [result] = await eslint.lintFiles(["test.ts"]);
      if (result === undefined) throw new Error("Expected lint result");
      expect(result.messages).toEqual([]);
      expect(result.usedDeprecatedRules.map((rule) => rule.ruleId).sort()).toEqual(
        deprecatedRuleAliases.map((ruleId) => `formspec/${ruleId}`).sort()
      );

      for (const [aliasId, replacementId] of Object.entries(deprecatedRuleReplacements)) {
        const deprecatedRule = result.usedDeprecatedRules.find(
          (rule) => rule.ruleId === `formspec/${aliasId}`
        );
        expect(deprecatedRule).toEqual({
          ruleId: `formspec/${aliasId}`,
          replacedBy: [replacementId],
        });
      }
    });

    const deprecatedAliasBehaviorCases: readonly DeprecatedAliasBehaviorCase[] = [
      {
        aliasId: "constraint-validation/no-description-tag",
        fileName: "deprecated-description-alias.ts",
        ruleEntry: "error",
        code: `class Form { /** @description A name */ name!: string; }`,
        messageId: "descriptionTagForbidden",
      },
      {
        aliasId: "constraints-allowed-field-types",
        fileName: "deprecated-field-policy-alias.ts",
        ruleEntry: ["error", { dynamicEnum: "error" }],
        code: `
          const field = {
            dynamicEnum: (name: string, source: string) => ({ name, source }),
          };
          field.dynamicEnum("country", "countries");
        `,
        messageId: "disallowedFieldType",
      },
      {
        aliasId: "constraints-allowed-layouts",
        fileName: "deprecated-layout-policy-alias.ts",
        ruleEntry: ["error", { group: "error" }],
        code: `
          function group(label: string, ...elements: unknown[]) {
            return { label, elements };
          }
          group("Contact", { name: "name" });
        `,
        messageId: "disallowedGroup",
      },
    ];

    it.each(deprecatedAliasBehaviorCases)(
      "runs deprecated alias $aliasId through its canonical rule implementation",
      async ({ aliasId, fileName, ruleEntry, code, messageId }) => {
        if (tmpDir === undefined) {
          throw new Error("Expected temporary directory");
        }

        writeFileSync(join(tmpDir, fileName), code);
        const eslint = createEslintForRules({
          [`formspec/${aliasId}`]: ruleEntry,
        });

        const [result] = await eslint.lintFiles([fileName]);
        if (result === undefined) throw new Error("Expected lint result");

        expect(result.messages).toHaveLength(1);
        expect(result.messages[0]).toMatchObject({
          ruleId: `formspec/${aliasId}`,
          messageId,
        });
        expect(result.usedDeprecatedRules).toEqual([
          {
            ruleId: `formspec/${aliasId}`,
            replacedBy: [deprecatedRuleReplacements[aliasId]],
          },
        ]);
      }
    );

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
