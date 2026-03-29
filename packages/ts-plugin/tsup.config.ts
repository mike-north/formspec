import { defineConfig } from "tsup";
import { baseConfig } from "../../tsup.config.base.js";

export default defineConfig({
  ...baseConfig,
  entry: ["src/index.ts"],
  external: ["typescript", "typescript/lib/tsserverlibrary.js"],
});
