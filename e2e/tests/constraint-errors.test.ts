/**
 * E2E tests for constraint error and warning detection.
 *
 * These tests use the `--validate-only` CLI flag to check that the validator
 * produces appropriate diagnostics for invalid constraint configurations:
 * - Contradicting constraints (inverted ranges)
 * - Type-incompatible constraints (@minimum on string, etc.)
 * - Invalid path-target constraints (primitive field, nonexistent path)
 *
 * @see 002-tsdoc-grammar.md §S4 (type determines applicable constraints)
 * @see 002-tsdoc-grammar.md §S2 (contradiction detection)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  runCli,
  resolveFixture,
  combinedOutput,
  type RunCliResult,
} from "../helpers/schema-assertions.js";

// ---------------------------------------------------------------------------
// 1. Contradicting constraints
// ---------------------------------------------------------------------------

describe("Contradicting constraints (--validate-only)", () => {
  // The "normal generate" test needs an output dir to avoid polluting the workspace.
  let tempDir: string;
  let validateResult: RunCliResult;
  let validateOutput: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-contradict-"));

    const fixturePath = resolveFixture("tsdoc-class", "contradicting-constraints.ts");
    validateResult = runCli([
      "generate",
      fixturePath,
      "ContradictingConstraints",
      "--validate-only",
    ]);
    validateOutput = combinedOutput(validateResult);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("exits non-zero when contradicting constraints are present", () => {
    expect(validateResult.exitCode).not.toBe(0);
  });

  it("reports an error for @minimum 100 @maximum 50 (inverted numeric range)", () => {
    // Must mention the field and the contradiction
    expect(validateOutput).toContain("invertedRange");
    expect(validateOutput.toLowerCase()).toMatch(/minimum|maximum/);
  });

  it("reports an error for @exclusiveMinimum 50 @exclusiveMaximum 50 (empty exclusive range)", () => {
    expect(validateOutput).toContain("emptyExclusiveRange");
    expect(validateOutput.toLowerCase()).toMatch(/exclusive/);
  });

  it("reports an error for @minLength 100 @maxLength 10 (inverted string length range)", () => {
    expect(validateOutput).toContain("invertedLength");
    expect(validateOutput.toLowerCase()).toMatch(/minlength|maxlength/);
  });

  it("reports an error for @minItems 10 @maxItems 1 (inverted array cardinality range)", () => {
    expect(validateOutput).toContain("invertedItems");
    expect(validateOutput.toLowerCase()).toMatch(/minitems|maxitems/);
  });

  it("produces 4 diagnostics total (one per contradicting field)", () => {
    // CLI reports "N diagnostic(s)"
    expect(validateOutput).toContain("4 diagnostic(s)");
  });

  it("includes ERROR severity markers in output", () => {
    expect(validateOutput).toContain("[ERROR]");
  });

  it("normal generate (without --validate-only) succeeds despite contradictions", () => {
    // The CLI only enforces validation in --validate-only mode; the normal
    // generate path writes the schema even when constraints are contradictory.
    // This documents the current behaviour; stricter enforcement may be added later.
    const fixturePath = resolveFixture("tsdoc-class", "contradicting-constraints.ts");
    const result = runCli([
      "generate",
      fixturePath,
      "ContradictingConstraints",
      "-o",
      path.join(tempDir, "out"),
    ]);
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Type-mismatch constraints
// ---------------------------------------------------------------------------

describe("Type-mismatch constraints (--validate-only)", () => {
  let result: RunCliResult;
  let output: string;

  beforeAll(() => {
    const fixturePath = resolveFixture("tsdoc-class", "type-mismatch-constraints.ts");
    result = runCli(["generate", fixturePath, "TypeMismatchConstraints", "--validate-only"]);
    output = combinedOutput(result);
  });

  it("exits non-zero when type-incompatible constraints are present", () => {
    expect(result.exitCode).not.toBe(0);
  });

  it("reports an error for @minimum 0 on a string field", () => {
    expect(output).toContain("nameIsString");
    expect(output.toLowerCase()).toContain("minimum");
  });

  it("reports an error for @minLength 1 on a number field", () => {
    expect(output).toContain("countIsNumber");
    expect(output.toLowerCase()).toContain("minlength");
  });

  it("reports an error for @minItems 1 on a string (non-array) field", () => {
    expect(output).toContain("notAnArray");
    expect(output.toLowerCase()).toContain("minitems");
  });

  it("produces 3 diagnostics total (one per mismatched field)", () => {
    expect(output).toContain("3 diagnostic(s)");
  });
});

// ---------------------------------------------------------------------------
// 3. Path-target error cases
// ---------------------------------------------------------------------------

describe("Path-target error cases (--validate-only)", () => {
  let result: RunCliResult;
  let output: string;

  beforeAll(() => {
    const fixturePath = resolveFixture("tsdoc-class", "path-target-errors.ts");
    result = runCli(["generate", fixturePath, "PathTargetErrors", "--validate-only"]);
    output = combinedOutput(result);
  });

  it("exits non-zero when a path-targeted constraint targets a primitive field", () => {
    expect(result.exitCode).not.toBe(0);
  });

  it("reports an error for @minimum :value 0 on a primitive number field", () => {
    expect(output).toContain("primitiveField");
    // The error must mention that the type cannot be traversed
    expect(output.toLowerCase()).toContain("cannot be traversed");
  });

  it.skip("reports an error for @minimum :nonexistent 0 when the path does not exist on the type (not yet implemented)", () => {
    // Currently, path targets that reference a nonexistent property on an object
    // type are silently accepted. Once path-existence validation is implemented,
    // this test should be unskipped and the fixture `total` field will produce
    // a diagnostic mentioning "nonexistent" or an unknown path segment.
    expect(output).toContain("total");
    expect(output.toLowerCase()).toMatch(/nonexistent|unknown.*path|path.*not.*found/);
  });
});
