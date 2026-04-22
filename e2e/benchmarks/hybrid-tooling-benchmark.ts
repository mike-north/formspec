import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import * as ts from "typescript";
import {
  FormSpecPluginService,
  FormSpecSemanticService,
  type FormSpecSemanticServiceStats,
} from "@formspec/ts-plugin";
// Intentionally import the same internal helper assembly that the packaged
// reference language server uses for completion/hover composition.
import {
  getPluginCompletionContextForDocument,
  getPluginHoverForDocument,
} from "../../packages/language-server/src/plugin-client.js";
import { getPluginDiagnosticsForDocument, toLspDiagnostics } from "@formspec/language-server";
import { getCompletionItemsAtOffset } from "../../packages/language-server/src/providers/completion.js";
import { getHoverAtOffset } from "../../packages/language-server/src/providers/hover.js";
import {
  HYBRID_BENCHMARK_SCENARIOS,
  type HybridBenchmarkOperation,
  type HybridBenchmarkResult,
  type HybridBenchmarkScenario,
  subtractHybridBenchmarkStats,
} from "./hybrid-tooling-benchmark-shared.js";
import { TextDocument } from "vscode-languageserver-textdocument";

export { renderHybridToolingBenchmarkReport } from "./hybrid-tooling-benchmark-shared.js";

interface WorkspaceContext {
  readonly workspaceRoot: string;
  readonly filePaths: Readonly<Record<string, string>>;
  readonly fileTexts: Readonly<Record<string, string>>;
  readonly program: ts.Program;
}

interface OperationMeasurement {
  readonly startupMs: number;
  readonly coldMs: number;
  readonly warmMs: number;
  readonly summary: string;
  readonly before: SemanticStats;
  readonly after: SemanticStats;
}

type SemanticStats = Pick<
  FormSpecSemanticServiceStats,
  "fileSnapshotCacheHits" | "fileSnapshotCacheMisses"
>;

type MaybePromise<T> = Promise<T> | T;

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  strict: true,
};

export async function runHybridToolingBenchmarks(): Promise<readonly HybridBenchmarkResult[]> {
  const results: HybridBenchmarkResult[] = [];

  for (const scenario of HYBRID_BENCHMARK_SCENARIOS) {
    results.push(await runDirectScenarioOperation(scenario, "diagnostics"));
    results.push(await runDirectScenarioOperation(scenario, "completion"));
    results.push(await runDirectScenarioOperation(scenario, "hover"));

    results.push(await runPluginScenarioOperation(scenario, "diagnostics"));
    results.push(await runPluginScenarioOperation(scenario, "completion"));
    results.push(await runPluginScenarioOperation(scenario, "hover"));

    results.push(await runLanguageServerScenarioOperation(scenario, "diagnostics"));
    results.push(await runLanguageServerScenarioOperation(scenario, "completion"));
    results.push(await runLanguageServerScenarioOperation(scenario, "hover"));
  }

  return results;
}

async function runDirectScenarioOperation(
  scenario: HybridBenchmarkScenario,
  operation: HybridBenchmarkOperation
): Promise<HybridBenchmarkResult> {
  const context = await createWorkspaceContext(scenario);
  const service = new FormSpecSemanticService({
    workspaceRoot: context.workspaceRoot,
    typescriptVersion: ts.version,
    getProgram: () => context.program,
  });

  try {
    const measurement: OperationMeasurement = await measureOperation(
      0,
      () => service.getStats(),
      () => runDirectOperation(service, context, scenario, operation)
    );
    return {
      scenarioId: scenario.id,
      mode: "direct-semantic-service",
      operation,
      startupMs: measurement.startupMs,
      coldMs: measurement.coldMs,
      warmMs: measurement.warmMs,
      summary: measurement.summary,
      stats: subtractHybridBenchmarkStats(measurement.after, measurement.before),
    };
  } finally {
    service.dispose();
    await disposeWorkspaceContext(context);
  }
}

async function runPluginScenarioOperation(
  scenario: HybridBenchmarkScenario,
  operation: HybridBenchmarkOperation
): Promise<HybridBenchmarkResult> {
  return runTransportScenarioOperation("plugin-ipc", scenario, operation, runPluginOperation);
}

async function runLanguageServerScenarioOperation(
  scenario: HybridBenchmarkScenario,
  operation: HybridBenchmarkOperation
): Promise<HybridBenchmarkResult> {
  return runTransportScenarioOperation(
    "packaged-language-server",
    scenario,
    operation,
    runLanguageServerOperation
  );
}

async function runTransportScenarioOperation(
  mode: Extract<HybridBenchmarkResult["mode"], "plugin-ipc" | "packaged-language-server">,
  scenario: HybridBenchmarkScenario,
  operation: HybridBenchmarkOperation,
  execute: (
    context: WorkspaceContext,
    scenario: HybridBenchmarkScenario,
    operation: HybridBenchmarkOperation
  ) => Promise<string>
): Promise<HybridBenchmarkResult> {
  const context = await createWorkspaceContext(scenario);
  const service = new FormSpecPluginService({
    workspaceRoot: context.workspaceRoot,
    typescriptVersion: ts.version,
    getProgram: () => context.program,
  });

  let startupMs = 0;

  try {
    const startupStartedAt = performance.now();
    await service.start();
    startupMs = performance.now() - startupStartedAt;

    const semanticService = service.getSemanticService();
    const measurement: OperationMeasurement = await measureOperation(
      startupMs,
      () => semanticService.getStats(),
      () => execute(context, scenario, operation)
    );
    return {
      scenarioId: scenario.id,
      mode,
      operation,
      startupMs: measurement.startupMs,
      coldMs: measurement.coldMs,
      warmMs: measurement.warmMs,
      summary: measurement.summary,
      stats: subtractHybridBenchmarkStats(measurement.after, measurement.before),
    };
  } finally {
    await service.stop();
    await disposeWorkspaceContext(context);
  }
}

async function measureOperation(
  startupMs: number,
  readStats: () => SemanticStats,
  execute: () => MaybePromise<string>
): Promise<OperationMeasurement> {
  const before = readStats();

  const coldStartedAt = performance.now();
  const coldSummary = await Promise.resolve(execute());
  const coldMs = performance.now() - coldStartedAt;

  const warmStartedAt = performance.now();
  const warmSummary = await Promise.resolve(execute());
  const warmMs = performance.now() - warmStartedAt;

  const after = readStats();

  return {
    startupMs,
    coldMs,
    warmMs,
    summary: coldSummary === warmSummary ? coldSummary : `${coldSummary} -> ${warmSummary}`,
    before,
    after,
  };
}

function runDirectOperation(
  service: FormSpecSemanticService,
  context: WorkspaceContext,
  scenario: HybridBenchmarkScenario,
  operation: HybridBenchmarkOperation
): string {
  switch (operation) {
    case "diagnostics": {
      const count = scenario.diagnosticsFiles.reduce((total, fileName) => {
        const response = service.getDiagnostics(getScenarioFilePath(context, fileName));
        return total + response.diagnostics.length;
      }, 0);
      return `${String(count)} canonical diagnostics`;
    }
    case "completion": {
      const offset = getInteractionOffset(context, scenario);
      const response = service.getCompletionContext(
        getScenarioFilePath(context, scenario.interactionFile),
        offset
      );
      const count =
        response?.context.kind === "target"
          ? response.context.semantic.targetCompletions.length
          : response?.context.kind === "tag-name"
            ? response.context.availableTags.length
            : 0;
      return `${String(count)} semantic completions`;
    }
    case "hover": {
      const offset = getInteractionOffset(context, scenario);
      const response = service.getHover(
        getScenarioFilePath(context, scenario.interactionFile),
        offset
      );
      const hover = response?.hover;
      return hover === undefined || hover === null ? "no semantic hover" : "semantic hover";
    }
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

async function runPluginOperation(
  context: WorkspaceContext,
  scenario: HybridBenchmarkScenario,
  operation: HybridBenchmarkOperation
): Promise<string> {
  const workspaceRoots = [context.workspaceRoot];
  const filePath = getScenarioFilePath(context, scenario.interactionFile);
  const documentText = getScenarioFileText(context, scenario.interactionFile);

  switch (operation) {
    case "diagnostics": {
      let count = 0;
      for (const fileName of scenario.diagnosticsFiles) {
        const diagnostics =
          (await getPluginDiagnosticsForDocument(
            workspaceRoots,
            getScenarioFilePath(context, fileName),
            getScenarioFileText(context, fileName)
          )) ?? [];
        count += diagnostics.length;
      }
      return `${String(count)} IPC diagnostics`;
    }
    case "completion": {
      const completionContext = await getPluginCompletionContextForDocument(
        workspaceRoots,
        filePath,
        documentText,
        getInteractionOffset(context, scenario)
      );
      const count =
        completionContext?.kind === "target"
          ? completionContext.semantic.targetCompletions.length
          : completionContext?.kind === "tag-name"
            ? completionContext.availableTags.length
            : 0;
      return `${String(count)} IPC completions`;
    }
    case "hover": {
      const hover = await getPluginHoverForDocument(
        workspaceRoots,
        filePath,
        documentText,
        getInteractionOffset(context, scenario)
      );
      return hover === null ? "no IPC hover" : "IPC hover";
    }
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

async function runLanguageServerOperation(
  context: WorkspaceContext,
  scenario: HybridBenchmarkScenario,
  operation: HybridBenchmarkOperation
): Promise<string> {
  const workspaceRoots = [context.workspaceRoot];
  const filePath = getScenarioFilePath(context, scenario.interactionFile);
  const documentText = getScenarioFileText(context, scenario.interactionFile);
  const offset = getInteractionOffset(context, scenario);

  switch (operation) {
    case "diagnostics": {
      let count = 0;
      for (const fileName of scenario.diagnosticsFiles) {
        const diagnostics =
          (await getPluginDiagnosticsForDocument(
            workspaceRoots,
            getScenarioFilePath(context, fileName),
            getScenarioFileText(context, fileName)
          )) ?? [];
        const lspDiagnostics = toLspDiagnostics(
          createDocument(
            getScenarioFilePath(context, fileName),
            getScenarioFileText(context, fileName)
          ),
          diagnostics
        );
        count += lspDiagnostics.length;
      }
      return `${String(count)} LSP diagnostics`;
    }
    case "completion": {
      const semanticContext = await getPluginCompletionContextForDocument(
        workspaceRoots,
        filePath,
        documentText,
        offset
      );
      const items = getCompletionItemsAtOffset(documentText, offset, undefined, semanticContext);
      return `${String(items.length)} LSP completion items`;
    }
    case "hover": {
      const semanticHover = await getPluginHoverForDocument(
        workspaceRoots,
        filePath,
        documentText,
        offset
      );
      const hover = getHoverAtOffset(documentText, offset, undefined, semanticHover);
      return hover === null ? "no LSP hover" : "LSP hover";
    }
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

function getInteractionOffset(
  context: WorkspaceContext,
  scenario: HybridBenchmarkScenario
): number {
  const text = getScenarioFileText(context, scenario.interactionFile);
  const needleIndex = text.indexOf(scenario.interactionNeedle);
  if (needleIndex < 0) {
    throw new Error(
      `Could not find interaction needle "${scenario.interactionNeedle}" in ${scenario.interactionFile}`
    );
  }

  return needleIndex + scenario.interactionOffsetDelta;
}

async function createWorkspaceContext(
  scenario: HybridBenchmarkScenario
): Promise<WorkspaceContext> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "formspec-hybrid-benchmark-"));
  const filePaths: Record<string, string> = {};
  const fileTexts: Record<string, string> = {};

  for (const [fileName, source] of Object.entries(scenario.files)) {
    const normalizedSource = `${source.trim()}\n`;
    const filePath = path.join(workspaceRoot, fileName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, normalizedSource, "utf8");
    filePaths[fileName] = filePath;
    fileTexts[fileName] = normalizedSource;
  }

  const program = ts.createProgram(Object.values(filePaths), COMPILER_OPTIONS);
  return {
    workspaceRoot,
    filePaths,
    fileTexts,
    program,
  };
}

async function disposeWorkspaceContext(context: WorkspaceContext): Promise<void> {
  await fs.rm(context.workspaceRoot, { recursive: true, force: true });
}

function createDocument(filePath: string, text: string): Parameters<typeof toLspDiagnostics>[0] {
  return TextDocument.create(pathToFileURL(filePath).href, "typescript", 1, text);
}

function getScenarioFilePath(context: WorkspaceContext, fileName: string): string {
  const filePath = context.filePaths[fileName];
  if (filePath === undefined) {
    throw new Error(`Missing benchmark file path for ${fileName}`);
  }
  return filePath;
}

function getScenarioFileText(context: WorkspaceContext, fileName: string): string {
  const text = context.fileTexts[fileName];
  if (text === undefined) {
    throw new Error(`Missing benchmark file text for ${fileName}`);
  }
  return text;
}
