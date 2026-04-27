import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default [
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.js",
            "scripts/check-typeflags-magic-numbers.mjs",
            "scripts/normalize-generated-markdown.mjs",
            "scripts/check-stale-doc-references.mjs",
            "scripts/check-stale-doc-references.test.mjs",
            "scripts/compute-typescript-minor-smoke-matrix.mjs",
            "scripts/compute-typescript-minor-smoke-matrix.test.mjs",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow underscore-prefixed unused variables
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Allow ++ and -- operators
      "no-plusplus": "off",
    },
  },
  {
    // Legacy/transitional files — deprecated APIs and unresolved types cleaned up in later stack PRs
    files: [
      "packages/build/tests/jsdoc-constraints.test.ts",
      "packages/build/tests/constraint-validator.test.ts",
      "packages/build/tests/extension-api.test.ts",
      "packages/build/src/analyzer/jsdoc-constraints.ts",
      "packages/build/src/analyzer/tsdoc-parser.ts",
      "packages/build/src/extensions/registry.ts",
      "packages/build/src/validate/constraint-validator.ts",
      "packages/eslint-plugin/src/utils/jsdoc-utils.ts",
    ],
    rules: {
      "@typescript-eslint/no-deprecated": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
    },
  },
  {
    // CI flags no-unnecessary-type-arguments on RuleModule<MessageIds> due to
    // platform-dependent @typescript-eslint type resolution (Linux vs macOS).
    files: [
      "packages/eslint-plugin/src/factories/constraint-rule.ts",
      "packages/eslint-plugin/tests/factories/create-constraint-rule.test.ts",
    ],
    rules: {
      "@typescript-eslint/no-unnecessary-type-arguments": "off",
    },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/temp/**",
      "**/coverage/**",
      "scratch/**",
      ".worktrees/**",
      ".Codex/**",
      ".claude/**",
      "packages/ts-plugin/index.cjs",
      // Unused CJS artifact from Phase 0-C benchmark development — not part of
      // the TypeScript project and cannot be linted as such.
      "e2e/benchmarks/ts-intercept-preload.cjs",
      // CI scripts are plain JS, not part of the TypeScript project.
      ".github/**",
      // Examples have their own eslint.config.js with formspec plugin rules.
      // They are linted separately via `pnpm -r run lint`.
      "examples/**",
      // Scratch probe file created during Phase 0.5d development — not project source.
      "probe-diagnostics.mjs",
    ],
  },
];
