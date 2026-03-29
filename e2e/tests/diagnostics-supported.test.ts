import { describe, it, expect } from "vitest";
import { resolveFixture, runCli } from "../helpers/schema-assertions.js";

describe("Supported diagnostics", () => {
  it("reports semantic contradiction diagnostics with field names, constraint names, and locations", () => {
    const fixturePath = resolveFixture("tsdoc-class", "error-contradicting-constraints.ts");
    const result = runCli([
      "generate",
      fixturePath,
      "ContradictingConstraintsForm",
      "--validate-only",
    ]);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('Class "ContradictingConstraintsForm": 2 diagnostic(s)');
    expect(output).toContain("[ERROR] CONTRADICTING_CONSTRAINTS");
    expect(output).toContain('Field "count"');
    expect(output).toContain("minimum");
    expect(output).toContain("maximum");
    expect(output).toContain('Field "code"');
    expect(output).toContain("minLength");
    expect(output).toContain("maxLength");
    expect(output).toContain(
      "[ERROR] CONTRADICTING_CONSTRAINTS fixtures/tsdoc-class/error-contradicting-constraints.ts:3:6"
    );
    expect(output).toContain(
      "[ERROR] CONTRADICTING_CONSTRAINTS fixtures/tsdoc-class/error-contradicting-constraints.ts:9:6"
    );
    expect(output).toContain(
      "related: fixtures/tsdoc-class/error-contradicting-constraints.ts:4:6"
    );
    expect(output).toContain(
      "related: fixtures/tsdoc-class/error-contradicting-constraints.ts:10:6"
    );
  });

  it("reports semantic type-mismatch diagnostics with field names, constraint names, and locations", () => {
    const fixturePath = resolveFixture("tsdoc-class", "error-type-mismatch.ts");
    const result = runCli([
      "generate",
      fixturePath,
      "TypeMismatchDiagnosticsForm",
      "--validate-only",
    ]);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('Class "TypeMismatchDiagnosticsForm": 2 diagnostic(s)');
    expect(output).toContain("[ERROR] TYPE_MISMATCH");
    expect(output).toContain('Target "name!: string;"');
    expect(output).toContain('constraint "minimum"');
    expect(output).toContain('Target "total!: number;"');
    expect(output).toContain('constraint "minItems"');
    expect(output).toContain(
      '[ERROR] TYPE_MISMATCH fixtures/tsdoc-class/error-type-mismatch.ts:3:6 Target "name!: string;"'
    );
    expect(output).toContain(
      '[ERROR] TYPE_MISMATCH fixtures/tsdoc-class/error-type-mismatch.ts:8:6 Target "total!: number;"'
    );
  });

  it("reports semantic invalid path-target diagnostics with the unresolved segment", () => {
    const fixturePath = resolveFixture("tsdoc-class", "error-invalid-path-target.ts");
    const result = runCli(["generate", fixturePath, "InvalidPathTargetForm", "--validate-only"]);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    expect(output).toContain("[ERROR] UNKNOWN_PATH_TARGET");
    expect(output).toContain('Target "zip"');
    expect(output).toContain("zip");
    expect(output).toContain(
      '[ERROR] UNKNOWN_PATH_TARGET fixtures/tsdoc-class/error-invalid-path-target.ts:8:6 Target "zip"'
    );
  });

  it("reports semantic broadening diagnostics for less restrictive follow-up constraints", () => {
    const fixturePath = resolveFixture("tsdoc-class", "error-broadening-constraint.ts");
    const result = runCli(["generate", fixturePath, "BroadeningConstraintForm", "--validate-only"]);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    expect(output).toContain("[ERROR] CONSTRAINT_BROADENING");
    expect(output).toContain('Field "quantity"');
    expect(output).toContain("@minimum");
    expect(output).toContain(
      '[ERROR] CONSTRAINT_BROADENING fixtures/tsdoc-class/error-broadening-constraint.ts:8:6 Field "quantity"'
    );
    expect(output).toContain("related: fixtures/tsdoc-class/error-broadening-constraint.ts:2:4");
  });

  it("reports contradictions against inherited alias constraints on resolved path targets", () => {
    const fixturePath = resolveFixture(
      "tsdoc-class",
      "error-path-target-inherited-contradiction.ts"
    );
    const result = runCli([
      "generate",
      fixturePath,
      "PathTargetInheritedContradictionForm",
      "--validate-only",
    ]);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    expect(output).toContain("[ERROR] CONTRADICTING_CONSTRAINTS");
    expect(output).toContain('Field "discount.percent"');
    expect(output).toContain("minimum");
    expect(output).toContain("maximum");
    expect(output).toContain(
      "fixtures/tsdoc-class/error-path-target-inherited-contradiction.ts:1:"
    );
    expect(output).toContain(
      "fixtures/tsdoc-class/error-path-target-inherited-contradiction.ts:9:"
    );
    expect(output).toContain(
      "related: fixtures/tsdoc-class/error-path-target-inherited-contradiction.ts:1:"
    );
  });
});
