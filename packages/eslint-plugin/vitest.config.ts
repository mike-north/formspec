import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // ESLint rule tests with TypeScript parsing can be slow
    testTimeout: 15000,
  },
});
