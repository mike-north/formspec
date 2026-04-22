import * as ts from "typescript";
import {
  FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
  computeFormSpecTextHash,
  type FormSpecAnalysisDeclarationSummary,
  type FormSpecAnalysisDiagnostic,
  type FormSpecAnalysisFileSnapshot,
  type FormSpecSerializedCompletionContext,
  type FormSpecSerializedHoverInfo,
} from "@formspec/analysis/protocol";
import {
  buildFormSpecAnalysisFileSnapshot,
  createFormSpecPerformanceRecorder,
  findDeclarationForCommentOffset,
  getCommentHoverInfoAtOffset,
  getSemanticCommentCompletionContextAtOffset,
  getFormSpecPerformanceNow,
  getSubjectType,
  optionalMeasure,
  resolveDeclarationPlacement,
  serializeCompletionContext,
  serializeHoverInfo,
  type BuildFormSpecAnalysisFileSnapshotOptions,
  type FormSpecPerformanceEvent,
  type FormSpecPerformanceRecorder,
} from "@formspec/analysis/internal";
import {
  FORM_SPEC_PLUGIN_DEFAULT_PERFORMANCE_LOG_THRESHOLD_MS,
  FORM_SPEC_PLUGIN_DEFAULT_SNAPSHOT_DEBOUNCE_MS,
} from "./constants.js";
import { formatPerformanceEvent } from "./perf-utils.js";

/**
 * Minimal logger contract used by the semantic service.
 *
 * @remarks
 * This interface is intentionally narrower than `LoggerLike` from
 * `@formspec/core`. The semantic service only emits informational lines (via
 * `info`) for profiling/refresh-failure messages, so callers can satisfy it
 * with a plain `{ info(s: string): void }` object — including `ts.server.Logger`
 * directly without wrapping. The broader `LoggerLike` from `@formspec/core` is
 * used at the plugin activation layer (`packages/ts-plugin/src/index.ts`) where
 * structured levels (debug, warn, error) and child-logger bindings are needed.
 *
 * @public
 */
export interface LoggerLike {
  /** Writes an informational log line. */
  info(message: string): void;
}

/**
 * Options used to construct a semantic service instance.
 *
 * @public
 */
export interface FormSpecSemanticServiceOptions {
  /** Workspace root used for runtime paths and contextual logging. */
  readonly workspaceRoot: string;
  /** TypeScript version string reported by the host runtime. */
  readonly typescriptVersion: string;
  /** Supplies the current host program. Returns `undefined` until ready. */
  readonly getProgram: () => ts.Program | undefined;
  /** Optional logger used for profiling and refresh-failure messages. */
  readonly logger?: LoggerLike;
  /** Enables structured hotspot logging for semantic queries. */
  readonly enablePerformanceLogging?: boolean;
  /** Minimum query duration, in milliseconds, required before logging. */
  readonly performanceLogThresholdMs?: number;
  /** Debounce window, in milliseconds, for background snapshot refresh. */
  readonly snapshotDebounceMs?: number;
  /** Injectable clock used by tests and runtime snapshot timestamps. */
  readonly now?: () => Date;
}

/**
 * Serialized completion response returned by the semantic service.
 *
 * @public
 */
export interface FormSpecSemanticCompletionResult {
  /** Protocol version of the serialized completion payload. */
  readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
  /** Source hash used to validate freshness. */
  readonly sourceHash: string;
  /** Serialized completion context for the cursor position. */
  readonly context: FormSpecSerializedCompletionContext;
}

/**
 * Serialized hover response returned by the semantic service.
 *
 * @public
 */
export interface FormSpecSemanticHoverResult {
  /** Protocol version of the serialized hover payload. */
  readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
  /** Source hash used to validate freshness. */
  readonly sourceHash: string;
  /** Serialized hover payload, if available. */
  readonly hover: FormSpecSerializedHoverInfo | null;
}

/**
 * Serialized diagnostics response returned by the semantic service.
 *
 * @public
 */
export interface FormSpecSemanticDiagnosticsResult {
  /** Protocol version of the serialized diagnostics payload. */
  readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
  /** Source hash used to validate freshness. */
  readonly sourceHash: string;
  /** Diagnostics for the requested file. */
  readonly diagnostics: readonly FormSpecAnalysisDiagnostic[];
}

/**
 * Aggregate statistics collected by the semantic service.
 *
 * @public
 */
export interface FormSpecSemanticServiceStats {
  /** Total number of calls by semantic query kind. */
  readonly queryTotals: {
    /** Number of completion requests handled. */
    readonly completion: number;
    /** Number of hover requests handled. */
    readonly hover: number;
    /** Number of diagnostics requests handled. */
    readonly diagnostics: number;
    /** Number of file snapshot requests handled. */
    readonly fileSnapshot: number;
  };
  /** Cold vs warm query path counts for snapshot-backed operations. */
  readonly queryPathTotals: {
    /** Cold and warm counts for diagnostics queries. */
    readonly diagnostics: { readonly cold: number; readonly warm: number };
    /** Cold and warm counts for file snapshot queries. */
    readonly fileSnapshot: { readonly cold: number; readonly warm: number };
  };
  /** Number of file snapshot cache hits. */
  readonly fileSnapshotCacheHits: number;
  /** Number of file snapshot cache misses. */
  readonly fileSnapshotCacheMisses: number;
}

interface CachedFileSnapshot {
  readonly sourceHash: string;
  readonly snapshot: FormSpecAnalysisFileSnapshot;
}

interface SourceEnvironment {
  readonly sourceFile: ts.SourceFile;
  readonly checker: ts.TypeChecker;
  readonly sourceHash: string;
}

interface CommentQueryContext extends SourceEnvironment {
  readonly declaration: ts.Node | null;
  readonly placement: ReturnType<typeof resolveDeclarationPlacement>;
  readonly subjectType: ts.Type | undefined;
}

function findInnermostDeclarationSummary(
  snapshot: FormSpecAnalysisFileSnapshot,
  offset: number
): FormSpecAnalysisDeclarationSummary | undefined {
  let bestMatch: FormSpecAnalysisDeclarationSummary | undefined;
  let bestWidth = Number.POSITIVE_INFINITY;

  for (const comment of snapshot.comments) {
    if (
      offset < comment.declarationSpan.start ||
      offset >= comment.declarationSpan.end ||
      (offset >= comment.commentSpan.start && offset < comment.commentSpan.end)
    ) {
      continue;
    }

    const width = comment.declarationSpan.end - comment.declarationSpan.start;
    if (width <= bestWidth) {
      bestMatch = comment.declarationSummary;
      bestWidth = width;
    }
  }

  return bestMatch;
}

type SnapshotCacheState = "hit" | "miss" | "missing-source";

interface MutableSemanticServiceStats {
  queryTotals: {
    completion: number;
    hover: number;
    diagnostics: number;
    fileSnapshot: number;
  };
  queryPathTotals: {
    diagnostics: { cold: number; warm: number };
    fileSnapshot: { cold: number; warm: number };
  };
  fileSnapshotCacheHits: number;
  fileSnapshotCacheMisses: number;
}

// Extension point for event names that should be counted in stats but not
// recorded to the per-call performance trail. Currently empty.
const STATS_ONLY_EVENT_NAMES = new Set<string>([]);

class StatsOnlyPerformanceRecorder implements FormSpecPerformanceRecorder {
  private readonly mutableEvents: FormSpecPerformanceEvent[] = [];

  public get events(): readonly FormSpecPerformanceEvent[] {
    return this.mutableEvents;
  }

  public measure<T>(
    name: string,
    detail: Readonly<Record<string, string | number | boolean>> | undefined,
    callback: () => T
  ): T {
    const result = callback();
    if (STATS_ONLY_EVENT_NAMES.has(name)) {
      this.mutableEvents.push({
        name,
        durationMs: 0,
        ...(detail === undefined ? {} : { detail }),
      });
    }
    return result;
  }

  public record(event: FormSpecPerformanceEvent): void {
    if (STATS_ONLY_EVENT_NAMES.has(event.name)) {
      this.mutableEvents.push(event);
    }
  }
}
/**
 * Reusable in-process semantic service for FormSpec authoring features.
 *
 * Downstream TypeScript hosts can construct this directly against their own
 * `Program` and own the final presentation of completions, hover, and
 * diagnostics. The shipped tsserver plugin is a reference wrapper over this
 * public service.
 *
 * @public
 */
export class FormSpecSemanticService {
  private readonly snapshotCache = new Map<string, CachedFileSnapshot>();
  private readonly refreshTimers = new Map<string, NodeJS.Timeout>();
  private readonly stats: MutableSemanticServiceStats = {
    queryTotals: {
      completion: 0,
      hover: 0,
      diagnostics: 0,
      fileSnapshot: 0,
    },
    queryPathTotals: {
      diagnostics: { cold: 0, warm: 0 },
      fileSnapshot: { cold: 0, warm: 0 },
    },
    fileSnapshotCacheHits: 0,
    fileSnapshotCacheMisses: 0,
  };

  public constructor(private readonly options: FormSpecSemanticServiceOptions) {}

  /** Resolves semantic completion context for a comment cursor position. */
  public getCompletionContext(
    filePath: string,
    offset: number
  ): FormSpecSemanticCompletionResult | null {
    this.stats.queryTotals.completion += 1;
    return this.runMeasured("semantic.getCompletionContext", { filePath, offset }, (performance) =>
      this.withCommentQueryContext(filePath, offset, performance, (context) => ({
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        sourceHash: context.sourceHash,
        context: serializeCompletionContext(
          getSemanticCommentCompletionContextAtOffset(context.sourceFile.text, offset, {
            checker: context.checker,
            ...(context.placement === null ? {} : { placement: context.placement }),
            ...(context.subjectType === undefined ? {} : { subjectType: context.subjectType }),
            ...(context.declaration === null ? {} : { declaration: context.declaration }),
          })
        ),
      }))
    );
  }

  /** Resolves semantic hover payload for a comment cursor position. */
  public getHover(filePath: string, offset: number): FormSpecSemanticHoverResult | null {
    this.stats.queryTotals.hover += 1;
    return this.runMeasured("semantic.getHover", { filePath, offset }, (performance) => {
      const environment = this.getSourceEnvironment(filePath, performance);
      if (environment === null) {
        return null;
      }

      const declaration = optionalMeasure(
        performance,
        "semantic.findDeclarationForCommentOffset",
        {
          filePath,
          offset,
        },
        () => findDeclarationForCommentOffset(environment.sourceFile, offset)
      );
      const placement =
        declaration === null
          ? null
          : optionalMeasure(performance, "semantic.resolveDeclarationPlacement", undefined, () =>
              resolveDeclarationPlacement(declaration)
            );
      const subjectType =
        declaration === null
          ? undefined
          : optionalMeasure(performance, "semantic.getSubjectType", undefined, () =>
              getSubjectType(declaration, environment.checker)
            );
      const hover = serializeHoverInfo(
        getCommentHoverInfoAtOffset(environment.sourceFile.text, offset, {
          checker: environment.checker,
          ...(placement === null ? {} : { placement }),
          ...(subjectType === undefined ? {} : { subjectType }),
          ...(declaration === null ? {} : { declaration }),
        })
      );
      if (hover !== null) {
        return {
          protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
          sourceHash: environment.sourceHash,
          hover,
        };
      }

      const { snapshot } = this.getFileSnapshotWithCacheState(filePath, performance, environment);
      const declarationSummary = findInnermostDeclarationSummary(snapshot, offset);

      return {
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        sourceHash: snapshot.sourceHash,
        hover:
          declarationSummary === undefined
            ? null
            : {
                kind: "declaration",
                markdown: declarationSummary.hoverMarkdown,
              },
      };
    });
  }

  /** Returns canonical FormSpec diagnostics for a file in the current host program. */
  public getDiagnostics(filePath: string): FormSpecSemanticDiagnosticsResult {
    this.stats.queryTotals.diagnostics += 1;
    return this.runMeasured("semantic.getDiagnostics", { filePath }, (performance) => {
      const { snapshot, cacheState } = this.getFileSnapshotWithCacheState(filePath, performance);
      this.recordQueryPath("diagnostics", cacheState);
      return {
        protocolVersion: FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        sourceHash: snapshot.sourceHash,
        diagnostics: snapshot.diagnostics,
      };
    });
  }

  /** Returns the full serialized semantic snapshot for a file. */
  public getFileSnapshot(filePath: string): FormSpecAnalysisFileSnapshot {
    this.stats.queryTotals.fileSnapshot += 1;
    return this.runMeasured("semantic.getFileSnapshot", { filePath }, (performance) => {
      const { snapshot, cacheState } = this.getFileSnapshotWithCacheState(filePath, performance);
      this.recordQueryPath("fileSnapshot", cacheState);
      return snapshot;
    });
  }

  /** Schedules a debounced background refresh for the file snapshot cache. */
  public scheduleSnapshotRefresh(filePath: string): void {
    const existing = this.refreshTimers.get(filePath);
    if (existing !== undefined) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      try {
        this.getFileSnapshot(filePath);
      } catch (error: unknown) {
        this.options.logger?.info(
          `[FormSpec] Failed to refresh semantic snapshot for ${filePath}: ${String(error)}`
        );
      }
      this.refreshTimers.delete(filePath);
    }, this.options.snapshotDebounceMs ?? FORM_SPEC_PLUGIN_DEFAULT_SNAPSHOT_DEBOUNCE_MS);
    timer.unref();

    this.refreshTimers.set(filePath, timer);
  }

  /** Clears pending timers and cached semantic snapshots. */
  public dispose(): void {
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();
    this.snapshotCache.clear();
  }

  /** Returns a copy of the current performance and cache counters. */
  public getStats(): FormSpecSemanticServiceStats {
    return {
      queryTotals: { ...this.stats.queryTotals },
      queryPathTotals: {
        diagnostics: { ...this.stats.queryPathTotals.diagnostics },
        fileSnapshot: { ...this.stats.queryPathTotals.fileSnapshot },
      },
      fileSnapshotCacheHits: this.stats.fileSnapshotCacheHits,
      fileSnapshotCacheMisses: this.stats.fileSnapshotCacheMisses,
    };
  }

  private runMeasured<T>(
    name: string,
    detail: Record<string, string | number>,
    fn: (performance: FormSpecPerformanceRecorder) => T
  ): T {
    const performance =
      this.options.enablePerformanceLogging === true
        ? createFormSpecPerformanceRecorder()
        : new StatsOnlyPerformanceRecorder();
    const result = optionalMeasure(performance, name, detail, () => fn(performance));
    this.updateStatsFromPerformanceEvents(performance.events);
    if (this.options.enablePerformanceLogging === true) {
      this.logPerformanceEvents(name, performance.events);
    }
    return result;
  }

  private withCommentQueryContext<T>(
    filePath: string,
    offset: number,
    performance: FormSpecPerformanceRecorder,
    handler: (context: CommentQueryContext) => T
  ): T | null {
    return optionalMeasure(
      performance,
      "semantic.resolveCommentQueryContext",
      {
        filePath,
        offset,
      },
      () => {
        const environment = this.getSourceEnvironment(filePath, performance);
        if (environment === null) {
          return null;
        }

        const declaration = optionalMeasure(
          performance,
          "semantic.findDeclarationForCommentOffset",
          {
            filePath,
            offset,
          },
          () => findDeclarationForCommentOffset(environment.sourceFile, offset)
        );
        const placement =
          declaration === null
            ? null
            : optionalMeasure(performance, "semantic.resolveDeclarationPlacement", undefined, () =>
                resolveDeclarationPlacement(declaration)
              );
        const subjectType =
          declaration === null
            ? undefined
            : optionalMeasure(performance, "semantic.getSubjectType", undefined, () =>
                getSubjectType(declaration, environment.checker)
              );

        return handler({
          ...environment,
          declaration,
          placement,
          subjectType,
        });
      }
    );
  }

  private getFileSnapshotWithCacheState(
    filePath: string,
    performance: FormSpecPerformanceRecorder,
    environment?: SourceEnvironment | null
  ): {
    readonly snapshot: FormSpecAnalysisFileSnapshot;
    readonly cacheState: SnapshotCacheState;
  } {
    const startedAt = getFormSpecPerformanceNow();
    const sourceEnvironment =
      environment === undefined ? this.getSourceEnvironment(filePath, performance) : environment;
    if (sourceEnvironment === null) {
      this.stats.fileSnapshotCacheMisses += 1;
      const snapshot: FormSpecAnalysisFileSnapshot = {
        filePath,
        sourceHash: "",
        generatedAt: this.getNow().toISOString(),
        comments: [],
        diagnostics: [
          {
            code: "MISSING_SOURCE_FILE",
            category: "infrastructure",
            message: `Unable to resolve TypeScript source file for ${filePath}`,
            range: { start: 0, end: 0 },
            severity: "warning",
            relatedLocations: [],
            data: {
              filePath,
            },
          },
        ],
      };
      performance.record({
        name: "semantic.getFileSnapshot.result",
        durationMs: getFormSpecPerformanceNow() - startedAt,
        detail: {
          filePath,
          cache: "missing-source",
        },
      });
      return {
        snapshot,
        cacheState: "missing-source",
      };
    }

    const cached = this.snapshotCache.get(filePath);
    if (cached?.sourceHash === sourceEnvironment.sourceHash) {
      this.stats.fileSnapshotCacheHits += 1;
      performance.record({
        name: "semantic.getFileSnapshot.result",
        durationMs: getFormSpecPerformanceNow() - startedAt,
        detail: {
          filePath,
          cache: "hit",
        },
      });
      return {
        snapshot: cached.snapshot,
        cacheState: "hit",
      };
    }

    this.stats.fileSnapshotCacheMisses += 1;
    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceEnvironment.sourceFile, {
      checker: sourceEnvironment.checker,
      now: () => this.getNow(),
      performance,
    } satisfies BuildFormSpecAnalysisFileSnapshotOptions);
    this.snapshotCache.set(filePath, {
      sourceHash: sourceEnvironment.sourceHash,
      snapshot,
    });
    performance.record({
      name: "semantic.getFileSnapshot.result",
      durationMs: getFormSpecPerformanceNow() - startedAt,
      detail: {
        filePath,
        cache: "miss",
      },
    });
    return {
      snapshot,
      cacheState: "miss",
    };
  }

  private getNow(): Date {
    return this.options.now?.() ?? new Date();
  }

  private getSourceEnvironment(
    filePath: string,
    performance: FormSpecPerformanceRecorder
  ): SourceEnvironment | null {
    return optionalMeasure(
      performance,
      "semantic.getSourceEnvironment",
      {
        filePath,
      },
      () => {
        const program = optionalMeasure(
          performance,
          "semantic.sourceEnvironment.getProgram",
          undefined,
          () => this.options.getProgram()
        );
        if (program === undefined) {
          return null;
        }

        const sourceFile = optionalMeasure(
          performance,
          "semantic.sourceEnvironment.getSourceFile",
          undefined,
          () => program.getSourceFile(filePath)
        );
        if (sourceFile === undefined) {
          return null;
        }

        const checker = optionalMeasure(
          performance,
          "semantic.sourceEnvironment.getTypeChecker",
          undefined,
          () => program.getTypeChecker()
        );
        const sourceHash = optionalMeasure(
          performance,
          "semantic.sourceEnvironment.computeTextHash",
          undefined,
          () => computeFormSpecTextHash(sourceFile.text)
        );

        return {
          sourceFile,
          checker,
          sourceHash,
        };
      }
    );
  }

  private recordQueryPath(
    kind: "diagnostics" | "fileSnapshot",
    cacheState: SnapshotCacheState
  ): void {
    if (cacheState === "hit") {
      this.stats.queryPathTotals[kind].warm += 1;
      return;
    }

    this.stats.queryPathTotals[kind].cold += 1;
  }

  // TODO: This hook is currently a no-op. The former synthetic-program
  // performance counters were removed from FormSpecSemanticServiceStats in
  // Phase 5C. If future performance events warrant new stats counters,
  // re-enable this method with the appropriate event-to-stat mapping.
  // Until then, the caller site can be removed if there are no meaningful
  // events to track.
  private updateStatsFromPerformanceEvents(_events: readonly FormSpecPerformanceEvent[]): void {}

  private logPerformanceEvents(
    rootEventName: string,
    events: readonly FormSpecPerformanceEvent[]
  ): void {
    const logger = this.options.logger;
    if (logger === undefined || events.length === 0) {
      return;
    }

    const rootEvent = [...events].reverse().find((event) => event.name === rootEventName);
    if (rootEvent === undefined) {
      return;
    }

    const thresholdMs =
      this.options.performanceLogThresholdMs ??
      FORM_SPEC_PLUGIN_DEFAULT_PERFORMANCE_LOG_THRESHOLD_MS;
    if (rootEvent.durationMs < thresholdMs) {
      return;
    }

    const sortedHotspots = [...events]
      .filter((event) => event.name !== rootEventName)
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 8);
    const lines = [
      `[FormSpec][perf] ${formatPerformanceEvent(rootEvent)}`,
      ...sortedHotspots.map((event) => `  ${formatPerformanceEvent(event)}`),
    ];
    logger.info(lines.join("\n"));
  }
}
