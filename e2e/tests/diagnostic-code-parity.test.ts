import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ESLint as ESLintNamespace, Linter } from "eslint";
import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";
import * as ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";

import { buildFormSpecAnalysisFileSnapshot } from "../../packages/analysis/src/internal.js";
import type { FormSpecAnalysisDiagnostic } from "../../packages/analysis/src/protocol.js";
import type { DetailedClassSchemasResult } from "../../packages/build/src/index.js";
import { generateSchemas } from "../../packages/build/src/index.js";
import type { ValidationDiagnostic } from "../../packages/build/src/validate/index.js";
import formspecPlugin from "../../packages/eslint-plugin/src/index.js";
import { toLspDiagnostics } from "../../packages/language-server/src/diagnostics.js";
import { FormSpecSemanticService } from "../../packages/ts-plugin/src/semantic-service.js";

type ConsumerName = "build" | "snapshot" | "eslint" | "language-server";

interface DiagnosticRange {
  readonly start: number;
  readonly end: number;
}

interface NormalizedDiagnostic {
  readonly code: string;
  readonly range: DiagnosticRange;
  readonly message: string;
}

interface DiagnosticConsumerResult {
  readonly consumer: ConsumerName;
  readonly diagnostics: readonly NormalizedDiagnostic[];
}

interface ParityFixture {
  readonly label: string;
  readonly tagName: string;
  readonly subjectType: string;
  readonly tagArgument: string;
  readonly preamble?: string;
  readonly targetDeclaration?: "type-alias";
}

interface FixtureFile {
  readonly filePath: string;
  readonly source: string;
  readonly typeName: string;
}

interface SurfaceException {
  readonly fixtureLabel: string;
  readonly consumer: ConsumerName;
  readonly expectedCodes: readonly string[];
  readonly reason: string;
}

interface KnownDivergence {
  readonly fixtureLabel: string;
  readonly expectedCodesByConsumer: Record<ConsumerName, readonly string[]>;
  readonly reason: string;
  readonly followUp: string;
}

function fixture(
  label: string,
  tagName: string,
  subjectType: string,
  tagArgument: string,
  options: Pick<ParityFixture, "preamble" | "targetDeclaration"> = {}
): ParityFixture {
  return { label, tagName, subjectType, tagArgument, ...options };
}

const CONSUMERS = [
  "build",
  "snapshot",
  "eslint",
  "language-server",
] as const satisfies readonly ConsumerName[];

const NON_APPLICABLE_SURFACES: readonly SurfaceException[] = [
  {
    fixtureLabel: '@const "XYZ" on string literal union',
    consumer: "eslint",
    expectedCodes: [],
    reason: "tag-type-check owns target type compatibility, not const membership validation.",
  },
  {
    fixtureLabel: '@minimum "hello" on string',
    consumer: "eslint",
    expectedCodes: [],
    reason: "tag-type-check defers malformed numeric payloads before type compatibility.",
  },
  {
    fixtureLabel: "@minimum 0 on type alias string",
    consumer: "build",
    expectedCodes: ["UNSUPPORTED_ROOT_TYPE"],
    reason:
      "generateSchemas owns class/interface roots and reports unsupported type-alias roots before placement.",
  },
  {
    fixtureLabel: "@minimum 0 on type alias string",
    consumer: "eslint",
    expectedCodes: [],
    reason: "tag-type-check does not own placement-only diagnostics for type aliases.",
  },
];

const KNOWN_DIVERGENCES: readonly KnownDivergence[] = [
  {
    fixtureLabel: "@minLength 1 on string array",
    expectedCodesByConsumer: {
      build: [],
      snapshot: [],
      eslint: ["TYPE_MISMATCH"],
      "language-server": [],
    },
    reason:
      "tag-type-check treats @minLength as string-only while the other consumers preserve current array behavior.",
    followUp:
      "Remove this divergence and add an array-length case to MESSAGE_EQUIVALENCE_FIXTURES once shared analysis owns the intended behavior.",
  },
  {
    fixtureLabel: '@const "USD" on nullable string literal union',
    expectedCodesByConsumer: {
      build: ["TYPE_MISMATCH"],
      snapshot: [],
      eslint: [],
      "language-server": [],
    },
    reason:
      "generateSchemas reports nullable const compatibility through IR validation while snapshot-backed consumers do not.",
    followUp:
      "Remove this divergence after nullable const compatibility is normalized across build and snapshot-backed consumers.",
  },
  {
    fixtureLabel: "@const true on nullable boolean",
    expectedCodesByConsumer: {
      build: ["TYPE_MISMATCH"],
      snapshot: [],
      eslint: [],
      "language-server": [],
    },
    reason:
      "generateSchemas reports nullable const compatibility through IR validation while snapshot-backed consumers do not.",
    followUp:
      "Remove this divergence after nullable const compatibility is normalized across build and snapshot-backed consumers.",
  },
];

const DIAGNOSTIC_CODE_FIXTURES: readonly ParityFixture[] = [
  fixture("@minimum 0 on number", "minimum", "number", "0"),
  fixture("@minimum 0 on string", "minimum", "string", "0"),
  fixture("@minimum 0 on Integer", "minimum", "Integer", "0", {
    preamble: "type Integer = number;",
  }),
  fixture("@minimum 0 on nullable number", "minimum", "number | null", "0"),
  fixture("@minimum 0 on optional number", "minimum", "number | undefined", "0"),
  fixture("@maximum 100 on number", "maximum", "number", "100"),
  fixture("@maximum 100 on string", "maximum", "string", "100"),
  fixture("@minLength 1 on string", "minLength", "string", "1"),
  fixture("@minLength 1 on number", "minLength", "number", "1"),
  fixture("@minLength 1 on string array", "minLength", "string[]", "1"),
  fixture("@maxLength 50 on string", "maxLength", "string", "50"),
  fixture("@pattern on string", "pattern", "string", '"^\\\\d+$"'),
  fixture("@pattern on number", "pattern", "number", '"^\\\\d+$"'),
  fixture("@enumOptions on string", "enumOptions", "string", '["a", "b"]'),
  fixture("@enumOptions on number", "enumOptions", "number", '["a", "b"]'),
  fixture('@const "USD" on string', "const", "string", '"USD"'),
  fixture('@const "USD" on string literal union', "const", '"USD" | "EUR"', '"USD"'),
  fixture('@const "XYZ" on string literal union', "const", '"USD" | "EUR"', '"XYZ"'),
  fixture(
    '@const "USD" on nullable string literal union',
    "const",
    '"USD" | "EUR" | null',
    '"USD"'
  ),
  fixture("@const true on nullable boolean", "const", "boolean | null", "true"),
  fixture("@uniqueItems on string array", "uniqueItems", "string[]", ""),
  fixture("@uniqueItems on string", "uniqueItems", "string", ""),
  fixture("@minimum 0 on alias chain", "minimum", "PositiveNumber", "0", {
    preamble: "type NonNegativeNumber = number;\ntype PositiveNumber = NonNegativeNumber;",
  }),
  fixture("@const not-json on string", "const", "string", "not-json"),
  fixture("@minimum Infinity on number", "minimum", "number", "Infinity"),
  fixture("@minimum NaN on number", "minimum", "number", "NaN"),
  fixture('@minimum "hello" on string', "minimum", "string", '"hello"'),
  fixture("@minimum 0 on type alias string", "minimum", "string", "0", {
    targetDeclaration: "type-alias",
  }),
];

// Array-length author mistakes are pinned in KNOWN_DIVERGENCES until current
// @minLength string[] behavior is normalized across all four consumers.
const MESSAGE_EQUIVALENCE_FIXTURES: readonly ParityFixture[] = [
  fixture("numeric tag on string: minimum", "minimum", "string", "0"),
  fixture("numeric tag on string: maximum", "maximum", "string", "100"),
  fixture("numeric tag on string: multipleOf", "multipleOf", "string", "2"),
  fixture("length tag on number: minLength", "minLength", "number", "1"),
  fixture("length tag on number: maxLength", "maxLength", "number", "50"),
  fixture("array tag on string: minItems", "minItems", "string", "1"),
  fixture("array tag on string: maxItems", "maxItems", "string", "10"),
  fixture("array tag on string: uniqueItems", "uniqueItems", "string", ""),
  fixture("enum options on number", "enumOptions", "number", '["small", "large"]'),
  fixture("pattern on number", "pattern", "number", '"^\\\\d+$"'),
];

let tempRoot: string;
let eslint: ESLint;

beforeAll(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "formspec-nway-parity-"));
  await fs.writeFile(
    path.join(tempRoot, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          skipLibCheck: true,
        },
      },
      null,
      2
    )
  );

  const overrideConfig = [
    {
      files: ["**/*.ts"],
      languageOptions: {
        ecmaVersion: "latest",
        parser: tsParser,
        parserOptions: {
          projectService: true,
          tsconfigRootDir: tempRoot,
        },
        sourceType: "module",
      },
      plugins: {
        formspec: formspecPlugin as unknown as ESLintNamespace.Plugin,
      },
      rules: {
        "formspec/type-compatibility/tag-type-check": "error",
      },
    },
  ] satisfies Linter.Config[];
  eslint = new ESLint({
    cwd: tempRoot,
    overrideConfigFile: true,
    overrideConfig,
  });
});

afterAll(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe("diagnostic consumer parity", () => {
  it("documents consumer exceptions for real fixture/surface pairs", () => {
    const fixtureLabels = new Set(DIAGNOSTIC_CODE_FIXTURES.map((fixture) => fixture.label));
    const seenSkipKeys = new Set<string>();

    for (const surface of NON_APPLICABLE_SURFACES) {
      expect(fixtureLabels.has(surface.fixtureLabel)).toBe(true);
      expect(CONSUMERS).toContain(surface.consumer);
      expect(
        seenSkipKeys.has(getConsumerExceptionKey(surface.fixtureLabel, surface.consumer))
      ).toBe(false);
      expect(surface.reason).not.toHaveLength(0);
      seenSkipKeys.add(getConsumerExceptionKey(surface.fixtureLabel, surface.consumer));
    }

    for (const divergence of KNOWN_DIVERGENCES) {
      expect(fixtureLabels.has(divergence.fixtureLabel)).toBe(true);
      expect(Object.keys(divergence.expectedCodesByConsumer).sort()).toEqual([...CONSUMERS].sort());
      expect(divergence.reason).not.toHaveLength(0);
      expect(divergence.followUp).not.toHaveLength(0);
    }
  });

  it.each(DIAGNOSTIC_CODE_FIXTURES)(
    "keeps diagnostic codes aligned for $label",
    async (fixture) => {
      const fixtureFile = await writeFixtureFile(fixture);
      const consumerResults = await runAllConsumers(fixtureFile);

      for (const result of consumerResults) {
        expectDiagnosticsAreSourceBounded(result, fixtureFile.source);
      }

      const knownDivergence = getKnownDivergence(fixture);
      if (knownDivergence !== undefined) {
        for (const result of consumerResults) {
          expect(
            extractCodes(result.diagnostics),
            `${fixture.label}: ${result.consumer} should keep its documented divergent output`
          ).toEqual(knownDivergence.expectedCodesByConsumer[result.consumer]);
        }
        return;
      }

      const applicableResults = consumerResults.filter(
        (result) => !isNonApplicableSurface(fixture, result.consumer)
      );
      const [expectedResult, ...actualResults] = applicableResults;
      const expectedCodes = extractCodes(expectedResult.diagnostics);

      for (const skippedResult of consumerResults.filter((result) =>
        isNonApplicableSurface(fixture, result.consumer)
      )) {
        const surface = getNonApplicableSurface(fixture, skippedResult.consumer);
        if (surface === undefined) {
          throw new Error(`Missing skipped-surface metadata for ${fixture.label}`);
        }
        const skippedCodes = extractCodes(skippedResult.diagnostics);
        expect(
          skippedCodes,
          `${fixture.label}: ${skippedResult.consumer} should keep its documented skip output`
        ).toEqual(surface.expectedCodes);
        expect(
          skippedCodes,
          `${fixture.label}: ${skippedResult.consumer} skip should be removed when it matches parity`
        ).not.toEqual(expectedCodes);
      }

      for (const actualResult of actualResults) {
        expect(
          extractCodes(actualResult.diagnostics),
          `${fixture.label}: ${actualResult.consumer} should match ${expectedResult.consumer}`
        ).toEqual(expectedCodes);
      }
    }
  );
});

describe("TYPE_MISMATCH message equivalence", () => {
  it.each(MESSAGE_EQUIVALENCE_FIXTURES)(
    "keeps messages in the shared equivalence class for $label",
    async (fixture) => {
      const fixtureFile = await writeFixtureFile(fixture);
      const consumerResults = await runAllConsumers(fixtureFile);

      for (const result of consumerResults) {
        expect(extractCodes(result.diagnostics)).toEqual(["TYPE_MISMATCH"]);
        expectDiagnosticsAreSourceBounded(result, fixtureFile.source);

        const [diagnostic] = result.diagnostics;
        expectTypeMismatchMessageEquivalence(diagnostic, fixture);
      }
    }
  );
});

async function runAllConsumers(
  fixtureFile: FixtureFile
): Promise<readonly DiagnosticConsumerResult[]> {
  const program = createProgram(fixtureFile.filePath);

  return [
    runBuildConsumer(fixtureFile),
    runSnapshotConsumer(fixtureFile, program),
    await runEslintConsumer(fixtureFile),
    runLanguageServerConsumer(fixtureFile, program),
  ];
}

function runBuildConsumer(fixtureFile: FixtureFile): DiagnosticConsumerResult {
  const result: DetailedClassSchemasResult = generateSchemas({
    filePath: fixtureFile.filePath,
    typeName: fixtureFile.typeName,
    errorReporting: "diagnostics",
  });
  const diagnostics = result.diagnostics.map((diagnostic) =>
    normalizeBuildDiagnostic(diagnostic, fixtureFile.source)
  );

  return { consumer: "build", diagnostics: sortDiagnostics(diagnostics) };
}

function runSnapshotConsumer(
  fixtureFile: FixtureFile,
  program: ts.Program
): DiagnosticConsumerResult {
  const sourceFile = program.getSourceFile(fixtureFile.filePath);
  if (!sourceFile) {
    throw new Error(`Unable to load fixture source file ${fixtureFile.filePath}`);
  }

  const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, {
    checker: program.getTypeChecker(),
  });
  const diagnostics = snapshot.diagnostics.map((diagnostic) =>
    normalizeAnalysisDiagnostic(diagnostic)
  );

  return { consumer: "snapshot", diagnostics: sortDiagnostics(diagnostics) };
}

async function runEslintConsumer(fixtureFile: FixtureFile): Promise<DiagnosticConsumerResult> {
  // The ESLint consumer intentionally enables only tag-type-check; other ESLint
  // rules have separate ownership and are documented in NON_APPLICABLE_SURFACES.
  const [result] = await eslint.lintFiles([path.basename(fixtureFile.filePath)]);
  if (result === undefined) {
    throw new Error(`Expected ESLint result for ${fixtureFile.filePath}`);
  }
  const unexpectedMessages = result.messages.filter(
    (message) => message.ruleId !== "formspec/type-compatibility/tag-type-check"
  );
  expect(unexpectedMessages).toEqual([]);

  const diagnostics = result.messages
    .filter((message) => message.ruleId === "formspec/type-compatibility/tag-type-check")
    .map((message) => ({
      code: message.messageId === "typeMismatch" ? "TYPE_MISMATCH" : String(message.messageId),
      message: message.message,
      range: {
        start: lineColumnToOffset(fixtureFile.source, message.line, message.column),
        end: lineColumnToOffset(
          fixtureFile.source,
          message.endLine ?? message.line,
          message.endColumn ?? message.column
        ),
      },
    }));

  return { consumer: "eslint", diagnostics: sortDiagnostics(diagnostics) };
}

function runLanguageServerConsumer(
  fixtureFile: FixtureFile,
  program: ts.Program
): DiagnosticConsumerResult {
  const service = new FormSpecSemanticService({
    workspaceRoot: tempRoot,
    typescriptVersion: ts.version,
    getProgram: () => program,
  });
  const result = service.getDiagnostics(fixtureFile.filePath);
  const document = TextDocument.create(
    pathToFileURL(fixtureFile.filePath).href,
    "typescript",
    0,
    fixtureFile.source
  );
  const diagnostics = toLspDiagnostics(document, result.diagnostics, {
    source: "formspec",
  }).map((diagnostic) => ({
    code: String(diagnostic.code ?? "UNKNOWN"),
    message: diagnostic.message,
    range: {
      start: document.offsetAt(diagnostic.range.start),
      end: document.offsetAt(diagnostic.range.end),
    },
  }));

  return { consumer: "language-server", diagnostics: sortDiagnostics(diagnostics) };
}

function createProgram(filePath: string): ts.Program {
  return ts.createProgram({
    rootNames: [filePath],
    options: {
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
    },
  });
}

async function writeFixtureFile(fixture: ParityFixture): Promise<FixtureFile> {
  const slug = fixture.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const filePath = path.join(tempRoot, `${slug}.ts`);
  const { source, typeName } = generateFixtureSource(fixture);
  await fs.writeFile(filePath, source);

  return { filePath, source, typeName };
}

function generateFixtureSource(fixture: ParityFixture): Pick<FixtureFile, "source" | "typeName"> {
  const preamble = fixture.preamble ? `${fixture.preamble}\n\n` : "";
  const tagArgument = fixture.tagArgument ? ` ${fixture.tagArgument}` : "";
  const tagComment = `/**\n * @${fixture.tagName}${tagArgument}\n */`;

  if (fixture.targetDeclaration === "type-alias") {
    return {
      typeName: "TestAlias",
      source: `${preamble}${tagComment}\nexport type TestAlias = ${fixture.subjectType};\n`,
    };
  }

  const optionalMarker = fixture.subjectType.includes("undefined") ? "?" : "!";

  return {
    typeName: "TestClass",
    source: `${preamble}export class TestClass {\n  ${tagComment
      .split("\n")
      .join("\n  ")}\n  field${optionalMarker}: ${fixture.subjectType};\n}\n`,
  };
}

function normalizeAnalysisDiagnostic(diagnostic: FormSpecAnalysisDiagnostic): NormalizedDiagnostic {
  return {
    code: diagnostic.code,
    range: diagnostic.range,
    message: diagnostic.message,
  };
}

function normalizeBuildDiagnostic(
  diagnostic: ValidationDiagnostic,
  source: string
): NormalizedDiagnostic {
  const start = lineColumnToOffset(
    source,
    diagnostic.primaryLocation.line,
    diagnostic.primaryLocation.column + 1
  );

  return {
    code: diagnostic.code,
    message: diagnostic.message,
    range: {
      start,
      end: clampOffset(start + (diagnostic.primaryLocation.length ?? 0), source),
    },
  };
}

function sortDiagnostics(
  diagnostics: readonly NormalizedDiagnostic[]
): readonly NormalizedDiagnostic[] {
  return [...diagnostics].sort(
    (left, right) =>
      left.range.start - right.range.start ||
      left.range.end - right.range.end ||
      left.code.localeCompare(right.code)
  );
}

function extractCodes(diagnostics: readonly NormalizedDiagnostic[]): readonly string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

function expectDiagnosticsAreSourceBounded(result: DiagnosticConsumerResult, source: string): void {
  for (const diagnostic of result.diagnostics) {
    expect(
      diagnostic.range.start,
      `${result.consumer} start range for ${diagnostic.code}`
    ).toBeGreaterThanOrEqual(0);
    expect(
      diagnostic.range.end,
      `${result.consumer} end range for ${diagnostic.code}`
    ).toBeGreaterThanOrEqual(diagnostic.range.start);
    expect(
      diagnostic.range.end,
      `${result.consumer} end range for ${diagnostic.code}`
    ).toBeLessThanOrEqual(source.length);
  }
}

function expectTypeMismatchMessageEquivalence(
  diagnostic: NormalizedDiagnostic,
  fixture: ParityFixture
): void {
  const tagReference = new RegExp(`@${fixture.tagName}|"${fixture.tagName}"`);
  expect(diagnostic.message).toMatch(tagReference);
  expect(diagnostic.message).toMatch(/only valid on|can only be used on|compatible/i);
}

function isNonApplicableSurface(fixture: ParityFixture, consumer: ConsumerName): boolean {
  return getNonApplicableSurface(fixture, consumer) !== undefined;
}

function getNonApplicableSurface(
  fixture: ParityFixture,
  consumer: ConsumerName
): SurfaceException | undefined {
  return NON_APPLICABLE_SURFACES.find(
    (surface) => surface.fixtureLabel === fixture.label && surface.consumer === consumer
  );
}

function getKnownDivergence(fixture: ParityFixture): KnownDivergence | undefined {
  return KNOWN_DIVERGENCES.find((divergence) => divergence.fixtureLabel === fixture.label);
}

function getConsumerExceptionKey(fixtureLabel: string, consumer: ConsumerName): string {
  return `${fixtureLabel}\0${consumer}`;
}

function lineColumnToOffset(source: string, line: number, column: number): number {
  const lines = source.split(/\n/);
  const targetLine = Math.max(1, Math.floor(line));
  const targetColumn = Math.max(1, Math.floor(column));
  let offset = 0;

  for (let index = 0; index < targetLine - 1 && index < lines.length; index += 1) {
    offset += lines[index].length + 1;
  }

  return clampOffset(offset + targetColumn - 1, source);
}

function clampOffset(offset: number, source: string): number {
  return Math.min(Math.max(0, offset), source.length);
}
