import { baseConfig } from "../../tsup.config.base.js";
import { defineConfig } from "tsup";

export default defineConfig({
  ...baseConfig,
  entry: ["src/index.ts", "src/base.ts"],
  noExternal: ["@formspec/dsl-policy"],
});
