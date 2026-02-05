import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // TypeScript analysis tests can be slow
    testTimeout: 15000,
  },
});
