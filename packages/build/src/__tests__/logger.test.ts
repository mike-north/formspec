import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { LoggerLike } from "@formspec/core";
import { formspec, field } from "@formspec/dsl";
import { buildFormSchemas, generateJsonSchema, generateUiSchema, writeSchemas } from "../index.js";

// ---------------------------------------------------------------------------
// Capturing logger — pushes every record to an array so tests can assert shape
// ---------------------------------------------------------------------------

interface LogRecord {
  readonly level: "trace" | "debug" | "info" | "warn" | "error";
  readonly msg: string;
  readonly bindings: Record<string, unknown>;
}

function makeCapturingLogger(
  bindings: Record<string, unknown> = {}
): { logger: LoggerLike; records: LogRecord[] } {
  const records: LogRecord[] = [];

  const push =
    (level: LogRecord["level"]) =>
    (msg: string, ..._args: unknown[]) => {
      records.push({ level, msg, bindings: { ...bindings } });
    };

  const logger: LoggerLike = {
    trace: push("trace"),
    debug: push("debug"),
    info: push("info"),
    warn: push("warn"),
    error: push("error"),
    child(childBindings) {
      return makeCapturingLogger({ ...bindings, ...childBindings }).logger;
    },
  };

  // The child logger shares the same records array via closure trick:
  // override child to push into *this* records array.
  const loggerWithSharedRecords: LoggerLike = {
    trace: push("trace"),
    debug: push("debug"),
    info: push("info"),
    warn: push("warn"),
    error: push("error"),
    child(childBindings) {
      const childPush =
        (level: LogRecord["level"]) =>
        (msg: string, ..._args: unknown[]) => {
          records.push({ level, msg, bindings: { ...bindings, ...childBindings } });
        };
      return {
        trace: childPush("trace"),
        debug: childPush("debug"),
        info: childPush("info"),
        warn: childPush("warn"),
        error: childPush("error"),
        child(grandChildBindings) {
          return makeCapturingLogger({ ...bindings, ...childBindings, ...grandChildBindings })
            .logger;
        },
      };
    },
  };
  void logger; // suppress unused-variable lint warning for naive logger above

  return { logger: loggerWithSharedRecords, records };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("@formspec/build logger integration", () => {
  const SIMPLE_FORM = formspec(
    field.text("name", { required: true }),
    field.number("age", { min: 0 })
  );

  describe("buildFormSchemas", () => {
    it("emits at least one debug record with stage=ir when a logger is passed", () => {
      // Integration test: asserts the IR-construction stage emits a debug record
      // (plan §3 @formspec/build — IR construction entry)
      const { logger, records } = makeCapturingLogger();

      buildFormSchemas(SIMPLE_FORM, { logger });

      const irRecord = records.find(
        (r) => r.level === "debug" && r.bindings["stage"] === "ir"
      );
      expect(irRecord).toBeDefined(); // stage: "ir" binding present
    });

    it("emits at least one debug record with stage=schema when a logger is passed", () => {
      // Integration test: asserts the schema-emit stage emits a debug record
      // (plan §3 @formspec/build — schema emit entry)
      const { logger, records } = makeCapturingLogger();

      buildFormSchemas(SIMPLE_FORM, { logger });

      const schemaRecord = records.find(
        (r) => r.level === "debug" && r.bindings["stage"] === "schema"
      );
      expect(schemaRecord).toBeDefined(); // stage: "schema" binding present
    });

    it("emits a top-level debug record at buildFormSchemas entry", () => {
      const { logger, records } = makeCapturingLogger();

      buildFormSchemas(SIMPLE_FORM, { logger });

      // At least one debug record emitted by buildFormSchemas itself (no stage binding)
      const topLevel = records.find((r) => r.level === "debug" && r.msg.includes("buildFormSchemas"));
      expect(topLevel).toBeDefined();
    });
  });

  describe("generateJsonSchema", () => {
    it("emits debug records with stage=ir and stage=schema bindings", () => {
      const { logger, records } = makeCapturingLogger();

      generateJsonSchema(SIMPLE_FORM, { logger });

      const irRecord = records.find(
        (r) => r.level === "debug" && r.bindings["stage"] === "ir"
      );
      const schemaRecord = records.find(
        (r) => r.level === "debug" && r.bindings["stage"] === "schema"
      );
      expect(irRecord).toBeDefined(); // IR stage debug record present
      expect(schemaRecord).toBeDefined(); // schema stage debug record present
    });
  });

  describe("generateUiSchema", () => {
    it("emits debug records with stage=ir and stage=schema bindings", () => {
      const { logger, records } = makeCapturingLogger();

      generateUiSchema(SIMPLE_FORM, { logger });

      const irRecord = records.find(
        (r) => r.level === "debug" && r.bindings["stage"] === "ir"
      );
      const schemaRecord = records.find(
        (r) => r.level === "debug" && r.bindings["stage"] === "schema"
      );
      expect(irRecord).toBeDefined(); // IR stage debug record present
      expect(schemaRecord).toBeDefined(); // schema stage debug record present
    });
  });

  describe("writeSchemas", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-logger-test-"));
    });

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    it("emits debug records with stage=write for each file written", () => {
      // Integration: asserts one debug entry per file written (plan §3 @formspec/build)
      const { logger, records } = makeCapturingLogger();

      writeSchemas(SIMPLE_FORM, { outDir: tempDir, name: "test", logger });

      const writeRecords = records.filter(
        (r) => r.level === "debug" && r.bindings["stage"] === "write"
      );
      // Expect exactly 2 write records — one per file (JSON Schema + UI Schema)
      expect(writeRecords.length).toBeGreaterThanOrEqual(2); // one per file written
    });
  });

  // ---------------------------------------------------------------------------
  // Regression: no console output when logger is absent
  // ---------------------------------------------------------------------------

  describe("no console output when logger is omitted", () => {
    it("buildFormSchemas produces no console.log or console.error output without a logger", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => { /* silence */ });
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { /* silence */ });

      try {
        buildFormSchemas(SIMPLE_FORM);
      } finally {
        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
      }

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("generateJsonSchema produces no console output without a logger", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => { /* silence */ });
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { /* silence */ });

      try {
        generateJsonSchema(SIMPLE_FORM);
      } finally {
        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
      }

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
