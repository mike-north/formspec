import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // TypeScript analysis tests can be slow
    testTimeout: 15000,
    // Builds the CLI binary once, before any test file runs, so the
    // dry-run-subprocess and exit-codes-subprocess suites never race each
    // other into concurrently building dist/index.js.
    globalSetup: ["./tests/global-setup.ts"],
  },
});
