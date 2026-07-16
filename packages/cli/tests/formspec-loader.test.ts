/**
 * Unit tests for `resolveCompiledPath` in the FormSpec runtime loader.
 *
 * Regression coverage for issue #544: the extension-mapping table must
 * follow TypeScript's NodeNext emit conventions —
 *   .mts → .mjs, .cts → .cjs, .ts/.tsx → .js
 * — and the function must not accept a second `outDir` argument (the sole
 * caller in `src/index.ts` never passed one, and the branch that remapped
 * `src/` to `outDir` was dead code with no test coverage).
 *
 * @see https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html#commonjs-mts-and-esm-cts
 */

import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { resolveCompiledPath } from "../src/runtime/formspec-loader.js";

describe("resolveCompiledPath", () => {
  // ── extension mapping (per-extension, per acceptance criteria) ─────────────

  it("maps .ts to .js", () => {
    expect(resolveCompiledPath("./src/forms.ts")).toBe(path.resolve("./src/forms.js"));
  });

  it("maps .tsx to .js", () => {
    expect(resolveCompiledPath("./src/forms.tsx")).toBe(path.resolve("./src/forms.js"));
  });

  it("maps .mts to .mjs (NodeNext ESM), not .js", () => {
    expect(resolveCompiledPath("./src/forms.mts")).toBe(path.resolve("./src/forms.mjs"));
  });

  it("maps .cts to .cjs (NodeNext CommonJS), not left unchanged", () => {
    expect(resolveCompiledPath("./src/forms.cts")).toBe(path.resolve("./src/forms.cjs"));
  });

  // ── already-compiled inputs pass through unchanged ──────────────────────────

  it("returns .js paths unchanged", () => {
    expect(resolveCompiledPath("./dist/forms.js")).toBe(path.resolve("./dist/forms.js"));
  });

  it("returns .mjs paths unchanged", () => {
    expect(resolveCompiledPath("./dist/forms.mjs")).toBe(path.resolve("./dist/forms.mjs"));
  });

  it("returns .cjs paths unchanged", () => {
    expect(resolveCompiledPath("./dist/forms.cjs")).toBe(path.resolve("./dist/forms.cjs"));
  });

  // ── path resolution ──────────────────────────────────────────────────────

  it("resolves relative paths to absolute paths", () => {
    const result = resolveCompiledPath("./src/forms.ts");
    expect(path.isAbsolute(result)).toBe(true);
  });

  it("preserves nested directory structure (in-place compilation)", () => {
    expect(resolveCompiledPath("./src/nested/dir/forms.ts")).toBe(
      path.resolve("./src/nested/dir/forms.js")
    );
  });

  // ── negative: only a single argument is accepted ────────────────────────────

  it("has an arity of 1 — the dead outDir parameter has been removed", () => {
    expect(resolveCompiledPath.length).toBe(1);
  });
});
