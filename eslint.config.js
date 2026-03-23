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
          allowDefaultProject: ["eslint.config.js"],
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
    // Legacy analyzer callers — deprecated APIs are replaced in a later stack PR
    files: [
      "packages/build/src/__tests__/analyzer.test.ts",
      "packages/build/src/__tests__/analyzer-edge-cases.test.ts",
      "packages/build/src/__tests__/interface-types.test.ts",
      "packages/build/src/__tests__/jsdoc-constraints.test.ts",
      "packages/build/src/analyzer/class-analyzer.ts",
      "packages/build/src/analyzer/type-converter.ts",
      "packages/build/src/generators/class-schema.ts",
      "packages/build/src/internals.ts",
      "packages/cli/src/__tests__/analyzer.test.ts",
      "packages/cli/src/__tests__/edge-cases.test.ts",
      "packages/cli/src/__tests__/integration.test.ts",
      "packages/cli/src/index.ts",
    ],
    rules: {
      "@typescript-eslint/no-deprecated": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
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
      // Examples have their own eslint.config.js with formspec plugin rules.
      // They are linted separately via `pnpm -r run lint`.
      "examples/**",
    ],
  },
];
