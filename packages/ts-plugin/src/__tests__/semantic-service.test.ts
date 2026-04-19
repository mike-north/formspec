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

  it("returns declaration-level hover summaries when hovering the documented declaration", async () => {
    const source = `
      class Checkout {
        /**
         * Internal program name
         * @displayName Program Name
         * @minLength 1
         * @maxLength 20
         */
        name!: string;
      }
    `;
    const context = await createProgramContext(source);
    workspaces.push(context.workspaceRoot);

    const getProgram = vi.fn(() => context.program);
    const service = new FormSpecSemanticService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram,
    });
    services.push(service);

    const hover = service.getHover(context.filePath, source.indexOf("name!: string;") + 1);

    expect(hover?.hover?.kind).toBe("declaration");
    expect(hover?.hover?.markdown).toContain("Program Name");
    expect(hover?.hover?.markdown).toContain("length 1-20");
    expect(getProgram).toHaveBeenCalledTimes(1);
  });

  it("prefers the innermost declaration summary when declaration spans overlap", async () => {
    const source = `
      /**
       * Outer checkout summary
       */
      class Checkout {
        /**
         * Inner field summary
         */
        name!: string;
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

    const hover = service.getHover(context.filePath, source.indexOf("name!: string;") + 1);

    expect(hover?.hover?.kind).toBe("declaration");
    expect(hover?.hover?.markdown).toContain("Inner field summary");
    expect(hover?.hover?.markdown).not.toContain("Outer checkout summary");
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

  // ---------------------------------------------------------------------------
  // §9.1 #2 — Constraint-tag-specific fixtures (Phase 0.5b)
  // ---------------------------------------------------------------------------

  it("surfaces TYPE_MISMATCH when @minimum path-targets a string sub-field (fixture 0.5b-1)", async () => {
    // Fixture: @minimum applied via path target to a `string` sub-field must
    // surface TYPE_MISMATCH through the LSP diagnostic stream. The snapshot
    // path resolves the path target to `string`, which is not numeric-comparable,
    // so the constraint is rejected and the diagnostic is emitted.
    //
    // The tag targets :label (string), not :amount (number), which is the
    // type-incompatibility trigger. Modeled after the existing semantic-service
    // test at line 28–55.
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

    // The diagnostic must be present — just assert presence and tag name.
    // No pixel-perfect line/col check is required (§9.1 #2 scope).
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.data["tagName"]).toBe("minimum");
  });

  it("accepts @minimum 0 on an Integer-typed field resolved to number via the host program (fixture 0.5b-2)", async () => {
    // Fixture: `@minimum 0` on a field whose type is numeric must not surface
    // TYPE_MISMATCH through the LSP diagnostic stream.
    //
    // This exercises the host-program path the plugin uses: because the TypeScript
    // program can resolve the subject type to a `number`-compatible type, the
    // synthetic checker sees a numeric-comparable subject type and accepts the
    // constraint. This mirrors the `isIntegerBrandedType` bypass behavior for
    // locally-declared numeric types.
    //
    // Cross-file branded intersections (e.g. `number & { readonly [__brand]: true }`
    // imported from a separate module) require an additional snapshot-path
    // bypass (tracked under §9.1 #3). This fixture covers the baseline numeric
    // field case that the snapshot path already handles correctly.
    const source = `
      class Checkout {
        /** @minimum 0 */
        count!: number;
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

    // A numeric field must not trigger TYPE_MISMATCH for a numeric constraint.
    expect(diagnostics.diagnostics.filter((d) => d.code === "TYPE_MISMATCH")).toHaveLength(0);
  });

  it("accepts @exclusiveMinimum :amount 0 on an object field via path-target (fixture 0.5b-3, D2)", async () => {
    // Fixture: path-targeted `@exclusiveMinimum :amount 0` on a field whose
    // inline object type has a numeric `amount` sub-property must be accepted
    // (D2 — path-target broadening).
    //
    // The path target :amount resolves to `number`, which provides
    // `numeric-comparable` capability. The constraint is emitted as a standard
    // JSON Schema keyword at the path level, not a vendor-prefixed extension
    // keyword. No TYPE_MISMATCH diagnostic should be surfaced.
    //
    // Modeled after the existing path-target acceptance test (lines 57–82), using
    // @exclusiveMinimum instead of @minimum to confirm the same D2 path works
    // for any numeric built-in constraint tag.
    const source = `
      class Payment {
        /** @exclusiveMinimum :amount 0 */
        price!: {
          amount: number;
          currency: string;
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

    // Path target :amount resolves to `number` — no TYPE_MISMATCH expected.
    expect(diagnostics.diagnostics.filter((d) => d.code === "TYPE_MISMATCH")).toHaveLength(0);
  });
});
