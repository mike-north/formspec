import { describe, it, expect, vi } from "vitest";
import type { LoggerLike } from "@formspec/core";
import { formspec, field } from "@formspec/dsl";
import { defineResolvers } from "../index.js";

// ---------------------------------------------------------------------------
// Shared capturing logger helper
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

  function build(currentBindings: Record<string, unknown>): LoggerLike {
    const push =
      (level: LogRecord["level"]) =>
      (msg: string, ..._args: unknown[]) => {
        records.push({ level, msg, bindings: { ...currentBindings } });
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
// Tests
// ---------------------------------------------------------------------------

describe("@formspec/runtime logger integration", () => {
  describe("defineResolvers", () => {
    it("emits a debug record with stage=runtime when a resolver is invoked via .get()", () => {
      // Integration: asserts resolver invocation triggers a debug log (plan §3 @formspec/runtime)
      const { logger, records } = makeCapturingLogger();

      const form = formspec(field.dynamicEnum("country", "countries", { label: "Country" }));
      const resolvers = defineResolvers(
        form,
        {
          countries: async () => {
            await Promise.resolve();
            return { options: [{ value: "us", label: "United States" }], validity: "valid" as const };
          },
        },
        { logger }
      );

      // Invoke the resolver to trigger the debug log
      resolvers.get("countries");

      const runtimeRecord = records.find(
        (r) => r.level === "debug" && r.bindings["stage"] === "runtime"
      );
      expect(runtimeRecord).toBeDefined(); // stage: "runtime" binding present
      // .get() returns the resolver function reference — it does not invoke it
      expect(runtimeRecord?.msg).toContain("resolver requested");
    });

    it("emits an error record at .error level when resolver is missing", () => {
      // Regression: missing resolver should log at error level (plan §3 @formspec/runtime)
      const { logger, records } = makeCapturingLogger();

      const form = formspec(field.dynamicEnum("country", "countries"));
      const resolvers = defineResolvers(
        form,
        {
          countries: async () => {
            await Promise.resolve();
            return { options: [], validity: "valid" as const };
          },
        },
        { logger }
      );

      expect(() => resolvers.get("unknown" as "countries")).toThrow(
        "No resolver found for data source: unknown"
      );

      const errorRecord = records.find((r) => r.level === "error");
      expect(errorRecord).toBeDefined(); // error log emitted for missing resolver
    });

    it("produces no console output when logger is omitted", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => { /* silence */ });
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { /* silence */ });

      const form = formspec(field.dynamicEnum("country", "countries"));

      try {
        const resolvers = defineResolvers(form, {
          countries: async () => {
            await Promise.resolve();
            return { options: [], validity: "valid" as const };
          },
        });
        resolvers.get("countries");
      } finally {
        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
      }

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
