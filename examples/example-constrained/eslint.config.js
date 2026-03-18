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
    rules: {
      ...formspec.configs.recommended[0].rules,
      "@formspec/prefer-custom-decorator": [
        "warn",
        {
          prefer: {
            Field: "StrictField",
            Minimum: "BoundedMin",
            Maximum: "BoundedMax",
          },
        },
      ],
      "@formspec/decorator-allowed-field-types": [
        "error",
        {
          allow: ["string", "number", "enum"],
        },
      ],
    },
  },
];
