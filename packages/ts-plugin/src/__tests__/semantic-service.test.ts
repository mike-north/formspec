import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormSpecSemanticService } from "../semantic-service.js";
import { createProgramContext } from "./helpers.js";

describe("FormSpecSemanticService", () => {
  const workspaces: string[] = [];
  const services: FormSpecSemanticService[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    services.forEach((service) => {
      service.dispose();
    });
    services.length = 0;

    await Promise.all(
      workspaces.map(async (workspaceRoot) => {
        await fs.rm(workspaceRoot, { recursive: true, force: true });
      })
    );
    workspaces.length = 0;
  });

  it("supports direct in-process diagnostics composition without IPC", async () => {
    const source = `
      class Checkout {
        /** @minimum :label 0 */
        discount!: {
          amount: number;
          label: string;
        };
      }
    `;
    const context = await createProgramContext(source);
    workspaces.push(context.workspaceRoot);

    const service = new FormSpecSemanticService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
    });
    services.push(service);

    const diagnostics = service.getDiagnostics(context.filePath);
    const diagnostic = diagnostics.diagnostics.find((entry) => entry.code === "TYPE_MISMATCH");

    expect(diagnostic).toBeDefined();
    expect(diagnostic?.category).toBe("type-compatibility");
    expect(diagnostic?.data["tagName"]).toBe("minimum");
    expect(diagnostic?.data["targetKind"]).toBe("path");
  });

  it("supports direct completion and hover queries without going through IPC", async () => {
    const source = `
      class Checkout {
        /** @minimum :amount 0 */
        discount!: {
          amount: number;
          label: string;
        };
      }
    `;
    const context = await createProgramContext(source);
    workspaces.push(context.workspaceRoot);

    const service = new FormSpecSemanticService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
    });
    services.push(service);

    const completion = service.getCompletionContext(context.filePath, source.indexOf("amount") + 2);
    const hover = service.getHover(context.filePath, source.indexOf("@minimum") + 2);

    expect(completion?.context.kind).toBe("target");
    expect(hover?.hover?.markdown).toContain("@minimum");
  });

  it("tracks warm and cold query paths plus synthetic cache reuse", async () => {
    const source = `
      class Checkout {
        /**
         * @minimum :amount 0
         * @maximum :amount 100
         * @minLength :label 1
         * @maxLength :label 64
         */
        discount!: {
          amount: number;
          label: string;
        };
      }
    `;
    const context = await createProgramContext(source);
    workspaces.push(context.workspaceRoot);

    const service = new FormSpecSemanticService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
    });
    services.push(service);

    const first = service.getDiagnostics(context.filePath);
    const second = service.getDiagnostics(context.filePath);

    expect(first.diagnostics).toEqual([]);
    expect(second.diagnostics).toEqual([]);

    const stats = service.getStats();
    expect(stats.queryTotals.diagnostics).toBe(2);
    expect(stats.queryPathTotals.diagnostics.cold).toBe(1);
    expect(stats.queryPathTotals.diagnostics.warm).toBe(1);
    expect(stats.fileSnapshotCacheMisses).toBe(1);
    expect(stats.fileSnapshotCacheHits).toBe(1);
    expect(stats.syntheticCompileCount).toBeGreaterThanOrEqual(1);
  });

  it("analyzes multiple files in one workspace without regressing to per-tag compiler passes", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "formspec-semantic-service-"));
    workspaces.push(workspaceRoot);
    const fileA = path.join(workspaceRoot, "checkout.ts");
    const fileB = path.join(workspaceRoot, "invoice.ts");
    await fs.writeFile(
      fileA,
      `
        export class Checkout {
          /**
           * @minimum :amount 0
           * @maximum :amount 100
           * @minimum :secondaryAmount 0
           * @maximum :secondaryAmount 100
           */
          discount!: {
            amount: number;
            secondaryAmount: number;
          };
        }
      `,
      "utf8"
    );
    await fs.writeFile(
      fileB,
      `
        export class Invoice {
          /**
           * @minLength :code 1
           * @maxLength :code 8
           * @pattern :code ^[A-Z]+$
           */
          reference!: {
            code: string;
          };
        }
      `,
      "utf8"
    );

    const program = ts.createProgram([fileA, fileB], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      strict: true,
    });
    const service = new FormSpecSemanticService({
      workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => program,
    });
    services.push(service);

    expect(service.getDiagnostics(fileA).diagnostics).toEqual([]);
    expect(service.getDiagnostics(fileB).diagnostics).toEqual([]);

    const stats = service.getStats();
    expect(stats.queryTotals.diagnostics).toBe(2);
    expect(stats.syntheticCompileApplications).toBeLessThanOrEqual(7);
    expect(stats.syntheticCompileCount).toBeLessThanOrEqual(2);
  });

  it("returns null for completion and hover when the host program cannot resolve the file", () => {
    const service = new FormSpecSemanticService({
      workspaceRoot: "/workspace/formspec",
      typescriptVersion: ts.version,
      getProgram: () => undefined,
    });
    services.push(service);

    expect(service.getCompletionContext("/workspace/formspec/example.ts", 0)).toBeNull();
    expect(service.getHover("/workspace/formspec/example.ts", 0)).toBeNull();
  });

  it("logs semantic performance summaries when enabled", async () => {
    const source = `
      class Checkout {
        /** @minimum :amount 0 */
        discount!: {
          amount: number;
        };
      }
    `;
    const context = await createProgramContext(source);
    workspaces.push(context.workspaceRoot);
    const logger = {
      info: vi.fn(),
    };
    const service = new FormSpecSemanticService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
      logger,
      enablePerformanceLogging: true,
      performanceLogThresholdMs: 0,
    });
    services.push(service);

    service.getDiagnostics(context.filePath);

    expect(logger.info).toHaveBeenCalled();
    const loggedOutput = logger.info.mock.calls.map(([message]) => String(message)).join("\n");
    expect(loggedOutput).toContain("semantic.getDiagnostics");
  });

  it("unrefs snapshot refresh timers so direct hosts do not stay alive accidentally", () => {
    const unref = vi.fn();
    const clearTimeoutSpy = vi
      .spyOn(global, "clearTimeout")
      .mockImplementation((() => undefined) as typeof clearTimeout);
    const setTimeoutSpy = vi.spyOn(global, "setTimeout").mockImplementation(((
      callback: () => void
    ) => {
      void callback;
      return { unref } as unknown as NodeJS.Timeout;
    }) as typeof setTimeout);
    const service = new FormSpecSemanticService({
      workspaceRoot: "/workspace/formspec",
      typescriptVersion: ts.version,
      getProgram: () => undefined,
    });
    services.push(service);

    service.scheduleSnapshotRefresh("/workspace/formspec/example.ts");

    expect(unref).toHaveBeenCalledTimes(1);
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  it("debounces scheduled refreshes and clears timers on dispose", async () => {
    vi.useFakeTimers();
    const source = `
      class Checkout {
        /** @minimum 0 */
        discount!: number;
      }
    `;
    const context = await createProgramContext(source);
    workspaces.push(context.workspaceRoot);
    const logger = {
      info: vi.fn(),
    };
    const service = new FormSpecSemanticService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
      logger,
      snapshotDebounceMs: 50,
    });
    services.push(service);

    service.scheduleSnapshotRefresh(context.filePath);
    service.scheduleSnapshotRefresh(context.filePath);
    await vi.advanceTimersByTimeAsync(49);
    expect(service.getStats().queryTotals.fileSnapshot).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(service.getStats().queryTotals.fileSnapshot).toBe(1);

    service.scheduleSnapshotRefresh(context.filePath);
    service.dispose();
    await vi.advanceTimersByTimeAsync(100);
    expect(service.getStats().queryTotals.fileSnapshot).toBe(1);
    expect(logger.info).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
