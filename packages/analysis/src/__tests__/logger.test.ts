import { describe, it, expect, vi } from "vitest";
import * as ts from "typescript";
import type { LoggerLike } from "@formspec/core";
import { analyzeMetadataForSourceFile, analyzeMetadataForNode } from "../index.js";
import { createProgram } from "./helpers.js";

// ---------------------------------------------------------------------------
// Shared capturing logger helper
// ---------------------------------------------------------------------------

interface LogRecord {
  readonly level: "trace" | "debug" | "info" | "warn" | "error";
  readonly msg: string;
  /** Child bindings from logger.child() calls */
  readonly bindings: Record<string, unknown>;
  /** Extra args passed as the second argument to log methods */
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
// Fixture source — a simple class with two declarations to analyze
// ---------------------------------------------------------------------------

const FIXTURE_SOURCE = `
/** @apiName UserRecord @displayName User */
export class User {
  /** @displayName First Name */
  firstName: string = "";
  /** @displayName Last Name */
  lastName: string = "";
}
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("@formspec/analysis logger integration", () => {
  describe("analyzeMetadataForSourceFile", () => {
    it("emits a debug record with stage=analysis, fileName, and tagCount after file analysis", () => {
      // Integration: asserts one debug record per file (plan §3 @formspec/analysis)
      const { program, sourceFile } = createProgram(FIXTURE_SOURCE);
      const { logger, records } = makeCapturingLogger();

      const results = analyzeMetadataForSourceFile({ program, sourceFile, logger });

      // Three declarations in the fixture: User (class) + firstName + lastName
      expect(results.length).toBeGreaterThan(0);

      // Plan §3: one debug line per file analyzed (filename + tag count)
      // fileName and tagCount are passed as the second arg to logger.debug()
      const fileRecord = records.find(
        (r) =>
          r.level === "debug" &&
          r.bindings["stage"] === "analysis" &&
          r.msg.includes("analyzed source file")
      );
      expect(fileRecord).toBeDefined(); // stage: "analysis" debug record for file analysis present
      // Extra args: the second argument to debug() is { fileName, tagCount }
      const extra = fileRecord?.extraArgs[0] as Record<string, unknown> | undefined;
      expect(extra).toBeDefined();
      expect(typeof extra?.["fileName"]).toBe("string"); // fileName is a string
      expect((extra?.["fileName"] as string)).toContain("formspec.ts"); // source file name logged
      expect(typeof extra?.["tagCount"]).toBe("number"); // tagCount is a number
      expect(extra?.["tagCount"]).toBeGreaterThan(0); // at least one declaration found
    });
  });

  describe("analyzeMetadataForNode", () => {
    it("emits a debug record with stage=analysis when analyzing a node", () => {
      // Integration: asserts node-level analysis emits a debug record
      const { program, sourceFile } = createProgram(FIXTURE_SOURCE);
      const { logger, records } = makeCapturingLogger();

      // Find the first class declaration node
      let classNode: ts.Node | undefined;
      const visit = (node: ts.Node): void => {
        if (classNode === undefined && ts.isClassDeclaration(node)) {
          classNode = node;
        }
        node.forEachChild(visit);
      };
      sourceFile.forEachChild(visit);

      if (classNode === undefined) {
        throw new Error("Expected to find a class declaration in the fixture");
      }

      analyzeMetadataForNode({ program, node: classNode, logger });

      const analysisRecord = records.find(
        (r) => r.level === "debug" && r.bindings["stage"] === "analysis"
      );
      expect(analysisRecord).toBeDefined(); // stage: "analysis" binding present
    });

    it("produces no console output when logger is omitted", () => {
      const { program, sourceFile } = createProgram(FIXTURE_SOURCE);
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => { /* silence */ });
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { /* silence */ });

      try {
        analyzeMetadataForSourceFile({ program, sourceFile });
      } finally {
        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
      }

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
