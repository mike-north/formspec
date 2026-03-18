import tseslint from "typescript-eslint";
import formspec from "@formspec/eslint-plugin";

export default [
  {
    ignores: ["dist/**", "vitest.config.ts"],
  },
  {
    ...formspec.configs.recommended[0],
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
