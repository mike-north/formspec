/**
 * Tests for --emit-ir and --validate-only CLI pipeline.
 *
 * These tests exercise the IR pipeline used by the new flags:
 * - canonicalizeTSDoc (class path)
 * - canonicalizeChainDSL (chain DSL path)
 * - validateIR
 *
 * They mirror the logic in the main() function to provide regression
 * coverage for the new code paths without spawning a subprocess.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  createProgramContext,
  findClassByName,
  analyzeClassToIR,
  canonicalizeTSDoc,
  canonicalizeChainDSL,
  validateIR,
} from "@formspec/build/internals";
import type { ValidationResult } from "@formspec/build/internals";
import type { FormIR } from "@formspec/core";
import { IR_VERSION } from "@formspec/core";
import { loadFormSpecs } from "../runtime/formspec-loader.js";

const fixturesDir = path.join(__dirname, "fixtures");
const sampleFormsPath = path.join(fixturesDir, "sample-forms.ts");
const compiledPath = path.join(fixturesDir, "sample-forms.js");
const testOutputDir = path.join(__dirname, "__test_output_ir__");

const hasCompiledFixture = fs.existsSync(compiledPath);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Writes a FormIR as JSON to a temp file, mimicking --emit-ir output.
 */
function writeIrFile(ir: FormIR, name: string, outDir: string): string {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const filePath = path.join(outDir, `${name}.ir.json`);
  fs.writeFileSync(filePath, JSON.stringify(ir, null, 2) + "\n");
  return filePath;
}

// ---------------------------------------------------------------------------
// --emit-ir: class path (TSDoc canonicalizer)
// ---------------------------------------------------------------------------

describe("--emit-ir: class path", () => {
  beforeAll(() => {
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true });
    }
  });

  it("produces a valid FormIR from analyzeClassToIR + canonicalizeTSDoc", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "SimpleProduct");
    if (!classDecl) throw new Error("SimpleProduct not found");

    const irAnalysis = analyzeClassToIR(classDecl, ctx.checker);
    const ir = canonicalizeTSDoc(irAnalysis, { file: sampleFormsPath });

    expect(ir.kind).toBe("form-ir");
    expect(ir.irVersion).toBeDefined();
    expect(Array.isArray(ir.elements)).toBe(true);
    expect(ir.elements.length).toBeGreaterThan(0);
    expect(ir.provenance.surface).toBe("tsdoc");
    expect(ir.provenance.file).toBe(sampleFormsPath);
  });

  it("writes a .ir.json file to the output directory", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "SimpleProduct");
    if (!classDecl) throw new Error("SimpleProduct not found");

    const irAnalysis = analyzeClassToIR(classDecl, ctx.checker);
    const ir = canonicalizeTSDoc(irAnalysis, { file: sampleFormsPath });

    const writtenPath = writeIrFile(ir, "SimpleProduct", testOutputDir);

    expect(fs.existsSync(writtenPath)).toBe(true);
    const content: unknown = JSON.parse(fs.readFileSync(writtenPath, "utf-8"));
    expect((content as { kind: string }).kind).toBe("form-ir");
    expect(Array.isArray((content as { elements: unknown[] }).elements)).toBe(true);
  });

  it("IR has the correct field names for SimpleProduct", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "SimpleProduct");
    if (!classDecl) throw new Error("SimpleProduct not found");

    const irAnalysis = analyzeClassToIR(classDecl, ctx.checker);
    const ir = canonicalizeTSDoc(irAnalysis, { file: sampleFormsPath });

    const fieldNames = ir.elements
      .filter(
        (el): el is Extract<(typeof ir.elements)[number], { kind: "field" }> => el.kind === "field"
      )
      .map((el) => el.name);

    expect(fieldNames).toContain("name");
    expect(fieldNames).toContain("active");
  });
});

// ---------------------------------------------------------------------------
// --validate-only: class path
// ---------------------------------------------------------------------------

describe("--validate-only: class path", () => {
  it("returns valid=true for a well-formed class", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "SimpleProduct");
    if (!classDecl) throw new Error("SimpleProduct not found");

    const irAnalysis = analyzeClassToIR(classDecl, ctx.checker);
    const ir = canonicalizeTSDoc(irAnalysis, { file: sampleFormsPath });

    const result: ValidationResult = validateIR(ir);

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("returns valid=true for InstallmentPlan class", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan not found");

    const irAnalysis = analyzeClassToIR(classDecl, ctx.checker);
    const ir = canonicalizeTSDoc(irAnalysis, { file: sampleFormsPath });

    const result: ValidationResult = validateIR(ir);

    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// --emit-ir / --validate-only: chain DSL path
// ---------------------------------------------------------------------------

describe.skipIf(!hasCompiledFixture)("--emit-ir / --validate-only: chain DSL path", () => {
  beforeAll(() => {
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true });
    }
  });

  it("canonicalizes UserRegistrationForm to a valid FormIR", async () => {
    const { module } = await loadFormSpecs(compiledPath);
    const rawFormSpec = module["UserRegistrationForm"];

    expect(rawFormSpec).toBeDefined();
    // rawFormSpec is unknown; the runtime check below validates its shape before passing to the canonicalizer
    if (typeof rawFormSpec !== "object" || rawFormSpec === null || !("elements" in rawFormSpec)) {
      throw new Error("Expected UserRegistrationForm to be a FormSpec-like object");
    }
    expect(Array.isArray((rawFormSpec as { elements: unknown }).elements)).toBe(true);

    const ir = canonicalizeChainDSL(rawFormSpec as never);

    expect(ir.kind).toBe("form-ir");
    expect(ir.provenance.surface).toBe("chain-dsl");
    expect(ir.elements.length).toBeGreaterThan(0);
  });

  it("validates UserRegistrationForm with no constraint violations", async () => {
    const { module } = await loadFormSpecs(compiledPath);
    const rawFormSpec = module["UserRegistrationForm"];
    if (!rawFormSpec) throw new Error("UserRegistrationForm not found in module");

    const ir = canonicalizeChainDSL(rawFormSpec as never);
    const result = validateIR(ir);

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("validates ActivateParams with no constraint violations", async () => {
    const { module } = await loadFormSpecs(compiledPath);
    const rawFormSpec = module["ActivateParams"];
    if (!rawFormSpec) throw new Error("ActivateParams not found in module");

    const ir = canonicalizeChainDSL(rawFormSpec as never);
    const result = validateIR(ir);

    expect(result.valid).toBe(true);
  });

  it("writes IR files for chain DSL FormSpecs", async () => {
    const { module } = await loadFormSpecs(compiledPath);
    const rawFormSpec = module["ProductConfigForm"];
    if (!rawFormSpec) throw new Error("ProductConfigForm not found in module");

    const ir = canonicalizeChainDSL(rawFormSpec as never);
    const writtenPath = writeIrFile(ir, "ProductConfigForm", testOutputDir);

    expect(fs.existsSync(writtenPath)).toBe(true);
    const content: unknown = JSON.parse(fs.readFileSync(writtenPath, "utf-8"));
    expect((content as { kind: string }).kind).toBe("form-ir");
    expect((content as { provenance: { surface: string } }).provenance.surface).toBe("chain-dsl");
  });
});

// ---------------------------------------------------------------------------
// validateIR: constraint violation detection (negative tests)
// ---------------------------------------------------------------------------

describe("validateIR: constraint violations", () => {
  it("detects minimum > maximum contradiction in a synthetic IR", () => {
    const provenance = { surface: "chain-dsl" as const, file: "", line: 0, column: 0 };
    const ir: FormIR = {
      kind: "form-ir",
      irVersion: IR_VERSION,
      elements: [
        {
          kind: "field",
          name: "amount",
          required: false,
          type: { kind: "primitive", primitiveKind: "number" },
          constraints: [
            {
              kind: "constraint" as const,
              constraintKind: "minimum" as const,
              value: 100,
              provenance,
            },
            {
              kind: "constraint" as const,
              constraintKind: "maximum" as const,
              value: 10,
              provenance,
            },
          ],
          annotations: [],
          provenance,
        },
      ],
      typeRegistry: {},
      provenance,
    };

    const result = validateIR(ir);

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.severity).toBe("error");
    expect(result.diagnostics[0]?.code).toMatch(/CONTRADICTION/);
    expect(result.diagnostics[0]?.message).toContain("minimum");
    expect(result.diagnostics[0]?.message).toContain("maximum");
  });

  it("detects type mismatch: minLength on a number field", () => {
    const provenance = { surface: "chain-dsl" as const, file: "", line: 0, column: 0 };
    const ir: FormIR = {
      kind: "form-ir",
      irVersion: IR_VERSION,
      elements: [
        {
          kind: "field",
          name: "count",
          required: false,
          type: { kind: "primitive", primitiveKind: "number" },
          constraints: [
            {
              kind: "constraint" as const,
              constraintKind: "minLength" as const,
              value: 5,
              provenance,
            },
          ],
          annotations: [],
          provenance,
        },
      ],
      typeRegistry: {},
      provenance,
    };

    const result = validateIR(ir);

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.severity).toBe("error");
    expect(result.diagnostics[0]?.code).toMatch(/TYPE_MISMATCH/);
  });

  it("returns valid=true for an empty IR with no elements", () => {
    const provenance = { surface: "chain-dsl" as const, file: "", line: 0, column: 0 };
    const ir: FormIR = {
      kind: "form-ir",
      irVersion: IR_VERSION,
      elements: [],
      typeRegistry: {},
      provenance,
    };

    const result = validateIR(ir);

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });
});
