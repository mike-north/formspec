import { describe, it, expect, vi } from "vitest";
import { formspec, field } from "@formspec/dsl";
import { defineResolvers } from "../src/index.js";
import { makeCapturingLogger } from "./helpers.js";

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
            return {
              options: [{ value: "us", label: "United States" }],
              validity: "valid" as const,
            };
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

    // Regression test for issue #540: the construction-time missing-resolver
    // check wrote directly to `console.warn`, bypassing the injected logger
    // entirely (unlike `.get()`, which already routed through it). This
    // defeated the documented contract that an injected logger receives all
    // diagnostic output.
    it("routes the construction-time missing-resolver warning through the injected logger, not console.warn (#540)", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
        /* silence */
      });
      const { logger, records } = makeCapturingLogger();

      const form = formspec(field.dynamicEnum("country", "countries"));

      try {
        // @ts-expect-error resolver for "countries" is intentionally omitted
        defineResolvers(form, {}, { logger });
      } finally {
        consoleWarnSpy.mockRestore();
      }

      expect(records).toContainEqual(
        expect.objectContaining({
          level: "warn",
          msg: "Missing resolver for data source: countries",
        })
      );
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    // Regression test for issue #540: with no logger injected at all (the
    // default `noopLogger` path), the missing-resolver warning must not leak
    // to `console.warn` either.
    it("produces no console.warn output for a missing resolver when no logger is injected (#540)", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
        /* silence */
      });

      const form = formspec(field.dynamicEnum("country", "countries"));

      try {
        // @ts-expect-error resolver for "countries" is intentionally omitted
        defineResolvers(form, {});
      } finally {
        consoleWarnSpy.mockRestore();
      }

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("produces no console output when logger is omitted", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {
        /* silence */
      });
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
        /* silence */
      });

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
