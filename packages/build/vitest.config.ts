import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // This suite does a lot of real TypeScript program analysis and occasional
    // child-process work. Keeping it to one fork avoids CI-only worker RPC
    // timeouts after successful test completion.
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,
    // Exclude the empty exploration file left from issue #309 investigation.
    // TODO: delete src/__tests__/explore-output.test.ts and remove this entry.
    exclude: ["**/explore-output.test.ts", "**/node_modules/**"],
  },
});
