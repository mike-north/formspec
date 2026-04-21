/**
 * Pins the silent-drop behavior of `parseTSDocTags` when the extension registry
 * has setup failures.
 *
 * When `registry.setupDiagnostics` is non-empty, `parseTSDocTags` returns ONLY
 * the setup diagnostics and skips all further tag analysis (placement validation,
 * summary-text extraction, constraint parsing, etc.) for the node.
 *
 * Rationale: an invalid registry means constraint types cannot be resolved, so
 * placement validation and tag argument checking for every field in the class
 * would be based on incomplete type information. Surfacing only the setup
 * diagnostic — rather than potentially spurious placement or type errors — keeps
 * the developer's feedback loop focused on fixing the broken extension
 * configuration before re-running analysis.
 *
 * @see packages/build/src/analyzer/tsdoc-parser.ts (parseTSDocTags early-return block)
 * @see packages/build/src/extensions/registry.ts (createExtensionRegistry)
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { createExtensionRegistry } from "../extensions/index.js";
import { parseTSDocTags } from "../analyzer/tsdoc-parser.js";

// =============================================================================
// Test helpers
// =============================================================================

/**
 * Creates an in-memory TypeScript source file and returns the first property
 * declaration in the first class/interface/type-alias.
 */
function getFirstProperty(source: string): ts.Node {
  const sourceFile = ts.createSourceFile("/virtual/test.ts", source, ts.ScriptTarget.Latest, true);

  for (const stmt of sourceFile.statements) {
    if (ts.isClassDeclaration(stmt) || ts.isInterfaceDeclaration(stmt)) {
      for (const member of stmt.members) {
        if (ts.isPropertyDeclaration(member) || ts.isPropertySignature(member)) {
          return member;
        }
      }
    }
  }

  throw new Error("No property declaration found in source");
}

/**
 * A class with valid constraint tags (@minLength, @maxLength on a string field).
 *
 * This fixture is used with a registry that has setup failures. Under
 * silent-drop the parser returns ONLY the setup diagnostic and extracts no
 * constraints — silent-drop is proven by asserting
 * `result.constraints.length === 0` (the valid constraints would otherwise be
 * extracted), not by checking for absence of placement errors. The fixture
 * intentionally has no placement error to keep the test focused on the
 * "full parse suppressed" behavior rather than error-forwarding mechanics.
 */
const CLASS_WITH_VALID_CONSTRAINTS_ON_STRING_FIELD = `
  class MyForm {
    /**
     * Valid summary text.
     * @minLength 1
     * @maxLength 10
     */
    label: string = "";
  }
`;

// =============================================================================
// Tests
// =============================================================================

describe("parseTSDocTags silent-drop: only setup diagnostics surface when registry has setup failures", () => {
  it("returns only setup diagnostics when registry.setupDiagnostics is non-empty", () => {
    // Registry with "Not A Type" — an invalid identifier, triggers SYNTHETIC_SETUP_FAILURE.
    const invalidRegistry = createExtensionRegistry([
      {
        extensionId: "x-test/invalid",
        types: [{ typeName: "MyType", tsTypeNames: ["Not A Type"] }],
      },
    ]);

    expect(invalidRegistry.setupDiagnostics).toHaveLength(1);
    expect(invalidRegistry.setupDiagnostics[0]?.kind).toBe("synthetic-setup");

    const prop = getFirstProperty(CLASS_WITH_VALID_CONSTRAINTS_ON_STRING_FIELD);
    const result = parseTSDocTags(prop, "/virtual/test.ts", {
      extensionRegistry: invalidRegistry,
    });

    // Setup diagnostic is emitted.
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("SYNTHETIC_SETUP_FAILURE");
    expect(result.diagnostics[0]?.message).toMatch(/Invalid custom type name "Not A Type"/);

    // Provenance is anchored at extension registration site, not tag site.
    expect(result.diagnostics[0]?.primaryLocation).toEqual({
      surface: "extension",
      file: "/virtual/test.ts",
      line: 1,
      column: 0,
    });

    // Constraint nodes are NOT extracted — the entire tag analysis is skipped.
    expect(result.constraints).toHaveLength(0);
    expect(result.annotations).toHaveLength(0);
  });

  it("does not surface placement errors when registry has setup failures (silent-drop)", () => {
    // "Array" is an unsupported global built-in override → UNSUPPORTED_CUSTOM_TYPE_OVERRIDE.
    const unsupportedBuiltinRegistry = createExtensionRegistry([
      {
        extensionId: "x-test/bad-array",
        types: [{ typeName: "Array", tsTypeNames: ["Array"] }],
      },
    ]);

    expect(unsupportedBuiltinRegistry.setupDiagnostics).toHaveLength(1);
    expect(unsupportedBuiltinRegistry.setupDiagnostics[0]?.kind).toBe(
      "unsupported-custom-type-override"
    );

    const prop = getFirstProperty(CLASS_WITH_VALID_CONSTRAINTS_ON_STRING_FIELD);
    const result = parseTSDocTags(prop, "/virtual/test.ts", {
      extensionRegistry: unsupportedBuiltinRegistry,
    });

    // Only the setup diagnostic surfaces. Silent-drop is proven by the
    // absence of the valid @minLength/@maxLength constraints — they would be
    // extracted if the parser had not short-circuited on setup failure.
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("UNSUPPORTED_CUSTOM_TYPE_OVERRIDE");
    expect(result.constraints).toHaveLength(0);
    expect(result.annotations).toHaveLength(0);
  });

  it("returns full parse results (constraints + annotations) when registry has no setup failures", () => {
    // A valid registry — no setup failures.
    const validRegistry = createExtensionRegistry([
      {
        extensionId: "x-test/valid",
        types: [{ typeName: "MyDecimal", tsTypeNames: ["MyDecimal"] }],
      },
    ]);

    expect(validRegistry.setupDiagnostics).toHaveLength(0);

    const prop = getFirstProperty(CLASS_WITH_VALID_CONSTRAINTS_ON_STRING_FIELD);
    const result = parseTSDocTags(prop, "/virtual/test.ts", {
      extensionRegistry: validRegistry,
    });

    // No setup diagnostics.
    expect(result.diagnostics.filter((d) => d.code === "SYNTHETIC_SETUP_FAILURE")).toHaveLength(0);

    // Constraint nodes ARE extracted — @minLength and @maxLength.
    expect(result.constraints.length).toBeGreaterThanOrEqual(2);
    const constraintKinds = result.constraints.map((c) => c.constraintKind);
    expect(constraintKinds).toContain("minLength");
    expect(constraintKinds).toContain("maxLength");
  });
});
