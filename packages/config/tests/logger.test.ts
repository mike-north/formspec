import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LoggerLike } from "@formspec/core";
import { loadFormSpecConfig } from "../src/index.js";

// ---------------------------------------------------------------------------
// Shared capturing logger helper
// ---------------------------------------------------------------------------

interface LogRecord {
  readonly level: "trace" | "debug" | "info" | "warn" | "error";
  readonly msg: string;
  /** Bindings accumulated via logger.child() calls */
  readonly bindings: Record<string, unknown>;
  /** Extra arguments passed to the log method (e.g. second arg to debug()) */
  readonly extraArgs: unknown[];
}

function makeCapturingLogger(
  bindings: Record<string, unknown> = {}
): { logger: LoggerLike; records: LogRecord[] } {
  const records: LogRecord[] = [];

  function build(currentBindings: Record<string, unknown>): LoggerLike {
    const push =
      (level: LogRecord["level"]) =>
      (msg: string, ...args: unknown[]) => {
        records.push({ level, msg, bindings: { ...currentBindings }, extraArgs: args });
      };
    return {
      trace: push("trace"),
      debug: push("debug"),
      info: push("info"),
      warn: push("warn"),
      error: push("error"),
      child(childBindings) {
        return build({ ...currentBindings, ...childBindings });
      },
    };
  }

  return { logger: build(bindings), records };
}

// ---------------------------------------------------------------------------
// Temp dir management
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const base = join(
    tmpdir(),
    `formspec-logger-test-${String(Date.now())}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(base, { recursive: true });
  tempDirs.push(base);
  return base;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("@formspec/config logger integration", () => {
  describe("loadFormSpecConfig", () => {
    it("emits a debug record with stage=config and configPath when a config file is found", async () => {
      // Integration: asserts resolved config path and source are logged (plan §3 @formspec/config)
      // configPath and source are passed as extra args to logger.debug()
      const dir = await createTempDir();
      const filePath = join(dir, "formspec.config.ts");
      await writeFile(
        filePath,
        `export default { vendorPrefix: "x-test" };`,
        "utf-8"
      );

      const { logger, records } = makeCapturingLogger();

      const result = await loadFormSpecConfig({ configPath: filePath, logger });

      expect(result.found).toBe(true);

      // Plan §3: log resolved config path and source
      const configRecord = records.find(
        (r) =>
          r.level === "debug" &&
          r.bindings["stage"] === "config" &&
          r.msg.includes("loading config file")
      );
      expect(configRecord).toBeDefined(); // stage: "config" debug record present for file loading
      const extra = configRecord?.extraArgs[0] as Record<string, unknown> | undefined;
      expect(extra?.["configPath"]).toBe(filePath); // resolved config path logged
    });

    it("emits a debug record indicating the source is 'explicit' when configPath is given", async () => {
      // Integration: asserts explicit vs discovered config source is logged
      const dir = await createTempDir();
      const filePath = join(dir, "formspec.config.ts");
      await writeFile(filePath, `export default {};`, "utf-8");

      const { logger, records } = makeCapturingLogger();

      await loadFormSpecConfig({ configPath: filePath, logger });

      const configRecord = records.find(
        (r) =>
          r.level === "debug" &&
          r.bindings["stage"] === "config" &&
          r.msg.includes("loading config file")
      );
      const extra = configRecord?.extraArgs[0] as Record<string, unknown> | undefined;
      expect(extra?.["source"]).toBe("explicit"); // source="explicit" for explicit configPath
    });

    it("emits a debug record indicating the source is 'discovered' when searching from a dir", async () => {
      // Integration: asserts discovered config source is logged
      const dir = await createTempDir();
      const filePath = join(dir, "formspec.config.ts");
      await writeFile(filePath, `export default {};`, "utf-8");

      const { logger, records } = makeCapturingLogger();

      await loadFormSpecConfig({ searchFrom: dir, logger });

      const configRecord = records.find(
        (r) =>
          r.level === "debug" &&
          r.bindings["stage"] === "config" &&
          r.msg.includes("loading config file")
      );
      const extra = configRecord?.extraArgs[0] as Record<string, unknown> | undefined;
      expect(extra?.["source"]).toBe("discovered"); // source="discovered" for auto-discovery
    });

    it("emits a debug record when no config file is found", async () => {
      // Integration: no-config case should still emit a debug log
      const dir = await createTempDir(); // empty — no config file

      const { logger, records } = makeCapturingLogger();

      const result = await loadFormSpecConfig({ searchFrom: dir, logger });

      expect(result.found).toBe(false);

      const notFoundRecord = records.find(
        (r) => r.level === "debug" && r.bindings["stage"] === "config"
      );
      expect(notFoundRecord).toBeDefined(); // debug record emitted even when no config found
    });

    it("produces no console output when logger is omitted", async () => {
      const dir = await createTempDir();
      const filePath = join(dir, "formspec.config.ts");
      await writeFile(filePath, `export default {};`, "utf-8");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => { /* silence */ });
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { /* silence */ });

      try {
        await loadFormSpecConfig({ configPath: filePath });
      } finally {
        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
      }

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
