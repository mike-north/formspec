import { defineConfig } from "tsup";
import { baseConfig } from "../../tsup.config.base.js";

export default defineConfig([
  {
    ...baseConfig,
    entry: ["src/index.ts", "src/browser.ts", "src/internals.ts"],
  },
  {
    ...baseConfig,
    entry: ["src/cli.ts"],
    clean: false, // don't wipe output from first config
  },
]);
