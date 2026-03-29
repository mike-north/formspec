import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    hookTimeout: 60_000,
    testTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
  },
});
