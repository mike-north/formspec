import type { Options } from "tsup";

export const baseConfig: Options = {
  format: ["esm", "cjs"],
  target: "es2022",
  sourcemap: true,
  clean: true,
  dts: false, // API Extractor handles .d.ts
  splitting: false,
};
