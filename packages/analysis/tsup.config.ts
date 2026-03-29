import { defineConfig } from "tsup";
import { baseConfig } from "../../tsup.config.base.js";

export default defineConfig({
  ...baseConfig,
  entry: ["src/index.ts", "src/protocol.ts", "src/internal.ts"],
  external: ["typescript"],
});
