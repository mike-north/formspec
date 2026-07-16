import fs from "node:fs/promises";
import * as ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormSpecSemanticService } from "../src/semantic-service.js";
import { createProgramContext } from "./helpers.js";

/**
 * Regression tests for #553 — the in-process semantic service must contain
 * analysis exceptions the same way the IPC transport already does
 * (`FormSpecPluginService.respondToSocket`, `packages/ts-plugin/src/service.ts`).
 * Before this fix, a throwing analysis call (e.g. a checker call against an
 * incomplete/malformed node) propagated straight out of `getDiagnostics`,
 * `getHover`, and `getCompletionContext` into the embedding host's request
 * loop instead of degrading to the documented fallback shapes.
 */

const analysisInternalMocks = vi.hoisted(() => ({
  buildFormSpecAnalysisFileSnapshotImpl: null as
    | ((...args: unknown[]) => unknown)
    | null,
  getCommentHoverInfoAtOffsetImpl: null as ((...args: unknown[]) => unknown) | null,
  getSemanticCommentCompletionContextAtOffsetImpl: null as
    | ((...args: unknown[]) => unknown)
    | null,
}));

vi.mock("@formspec/analysis/internal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@formspec/analysis/internal")>();
  return {
    ...actual,
    buildFormSpecAnalysisFileSnapshot: (...args: unknown[]) =>
      analysisInternalMocks.buildFormSpecAnalysisFileSnapshotImpl !== null
        ? analysisInternalMocks.buildFormSpecAnalysisFileSnapshotImpl(...args)
        : (
            actual.buildFormSpecAnalysisFileSnapshot as (...fnArgs: unknown[]) => unknown
          )(...args),
    getCommentHoverInfoAtOffset: (...args: unknown[]) =>
      analysisInternalMocks.getCommentHoverInfoAtOffsetImpl !== null
        ? analysisInternalMocks.getCommentHoverInfoAtOffsetImpl(...args)
        : (actual.getCommentHoverInfoAtOffset as (...fnArgs: unknown[]) => unknown)(...args),
    getSemanticCommentCompletionContextAtOffset: (...args: unknown[]) =>
      analysisInternalMocks.getSemanticCommentCompletionContextAtOffsetImpl !== null
        ? analysisInternalMocks.getSemanticCommentCompletionContextAtOffsetImpl(...args)
        : (
            actual.getSemanticCommentCompletionContextAtOffset as (
              ...fnArgs: unknown[]
            ) => unknown
          )(...args),
  };
});

describe("FormSpecSemanticService crash safety (#553)", () => {
  const workspaces: string[] = [];
  const services: FormSpecSemanticService[] = [];

  afterEach(async () => {
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

    analysisInternalMocks.buildFormSpecAnalysisFileSnapshotImpl = null;
    analysisInternalMocks.getCommentHoverInfoAtOffsetImpl = null;
    analysisInternalMocks.getSemanticCommentCompletionContextAtOffsetImpl = null;
  });

  const SOURCE = `
    class Checkout {
      /** @minimum :amount 0 */
      discount!: {
        amount: number;
        label: string;
      };
    }
  `;

  it("contains a throwing snapshot build and reports an infrastructure diagnostic from getDiagnostics", async () => {
    const context = await createProgramContext(SOURCE);
    workspaces.push(context.workspaceRoot);
    const logger = { info: vi.fn() };
    const service = new FormSpecSemanticService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
      logger,
    });
    services.push(service);

    analysisInternalMocks.buildFormSpecAnalysisFileSnapshotImpl = () => {
      throw new Error("simulated checker crash on malformed node");
    };

    const result = service.getDiagnostics(context.filePath);

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "ANALYSIS_EXCEPTION",
      category: "infrastructure",
      severity: "warning",
    });
    expect(result.diagnostics[0]?.message).toContain("simulated checker crash on malformed node");
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("getFileSnapshotWithCacheState")
    );
  });

  it("contains a throwing snapshot build and returns an empty snapshot from getFileSnapshot", async () => {
    const context = await createProgramContext(SOURCE);
    workspaces.push(context.workspaceRoot);
    const service = new FormSpecSemanticService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
    });
    services.push(service);

    analysisInternalMocks.buildFormSpecAnalysisFileSnapshotImpl = () => {
      throw new Error("simulated checker crash");
    };

    const snapshot = service.getFileSnapshot(context.filePath);

    expect(snapshot.sourceHash).toBe("");
    expect(snapshot.comments).toEqual([]);
    expect(snapshot.diagnostics[0]?.code).toBe("ANALYSIS_EXCEPTION");
  });

  it("contains a throwing getProgram host callback — outside the buildFormSpecAnalysisFileSnapshot guard — and returns an empty snapshot from getFileSnapshot", () => {
    // Regression for the gap Copilot flagged on PR #610: getFileSnapshot()
    // had no try/catch of its own, so an exception raised before
    // getFileSnapshotWithCacheState's internal buildFormSpecAnalysisFileSnapshot
    // guard (e.g. the host's getProgram() callback, or program.getTypeChecker())
    // propagated straight out of the public method instead of degrading to the
    // documented fallback snapshot.
    const logger = { info: vi.fn() };
    const service = new FormSpecSemanticService({
      workspaceRoot: "/workspace/formspec",
      typescriptVersion: ts.version,
      getProgram: () => {
        throw new Error("simulated host getProgram crash");
      },
      logger,
    });
    services.push(service);

    const snapshot = service.getFileSnapshot("/workspace/formspec/example.ts");

    expect(snapshot.sourceHash).toBe("");
    expect(snapshot.comments).toEqual([]);
    expect(snapshot.diagnostics[0]).toMatchObject({
      code: "ANALYSIS_EXCEPTION",
      category: "infrastructure",
      severity: "warning",
    });
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("getFileSnapshot"));
  });

  it("does not poison the snapshot cache with a failed build (retries once the throw stops)", async () => {
    const context = await createProgramContext(SOURCE);
    workspaces.push(context.workspaceRoot);
    const service = new FormSpecSemanticService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
    });
    services.push(service);

    analysisInternalMocks.buildFormSpecAnalysisFileSnapshotImpl = () => {
      throw new Error("transient failure");
    };
    const failed = service.getDiagnostics(context.filePath);
    expect(failed.diagnostics[0]?.code).toBe("ANALYSIS_EXCEPTION");

    analysisInternalMocks.buildFormSpecAnalysisFileSnapshotImpl = null;
    const recovered = service.getDiagnostics(context.filePath);
    expect(recovered.sourceHash).not.toBe("");
    expect(recovered.diagnostics.some((diagnostic) => diagnostic.code === "ANALYSIS_EXCEPTION")).toBe(
      false
    );
  });

  it("contains a throwing hover analysis call and returns null from getHover", async () => {
    const context = await createProgramContext(SOURCE);
    workspaces.push(context.workspaceRoot);
    const logger = { info: vi.fn() };
    const service = new FormSpecSemanticService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
      logger,
    });
    services.push(service);

    analysisInternalMocks.getCommentHoverInfoAtOffsetImpl = () => {
      throw new Error("simulated hover analysis crash");
    };

    const hover = service.getHover(context.filePath, SOURCE.indexOf("@minimum") + 2);

    expect(hover).toBeNull();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("getHover")
    );
  });

  it("contains a throwing completion analysis call and returns null from getCompletionContext", async () => {
    const context = await createProgramContext(SOURCE);
    workspaces.push(context.workspaceRoot);
    const logger = { info: vi.fn() };
    const service = new FormSpecSemanticService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
      logger,
    });
    services.push(service);

    analysisInternalMocks.getSemanticCommentCompletionContextAtOffsetImpl = () => {
      throw new Error("simulated completion analysis crash");
    };

    const completion = service.getCompletionContext(
      context.filePath,
      SOURCE.indexOf("amount") + 2
    );

    expect(completion).toBeNull();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("getCompletionContext")
    );
  });

  it("negative: healthy diagnostics/hover/completion paths are unaffected when nothing throws", async () => {
    const context = await createProgramContext(SOURCE);
    workspaces.push(context.workspaceRoot);
    const service = new FormSpecSemanticService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
    });
    services.push(service);

    const diagnostics = service.getDiagnostics(context.filePath);
    const hover = service.getHover(context.filePath, SOURCE.indexOf("@minimum") + 2);
    const completion = service.getCompletionContext(
      context.filePath,
      SOURCE.indexOf("amount") + 2
    );

    expect(
      diagnostics.diagnostics.some((diagnostic) => diagnostic.code === "ANALYSIS_EXCEPTION")
    ).toBe(false);
    expect(hover?.hover?.markdown).toContain("@minimum");
    expect(completion?.context.kind).toBe("target");
  });
});
