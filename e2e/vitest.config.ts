import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    hookTimeout: 60_000,
    testTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
    // Cap worker concurrency. The suite spawns long-running CLI subprocesses
    // (cli-subprocess.test.ts alone takes ~67s). With the default parallelism
    // on GitHub runners, the main process gets saturated with onTaskUpdate RPC
    // calls from many workers at once and birpc's 60s call timeout can fire.
    // Capping workers relieves main-process RPC pressure.
    pool: "forks",
    maxWorkers: 2,
  },
});
