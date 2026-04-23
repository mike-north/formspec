/**
 * Unit tests for the CLI logger module.
 *
 * Tests focus on `isNamespaceEnabled`, which implements the `DEBUG` env-var
 * pattern matching. The rules mirror the `debug` npm package convention:
 *   - comma-separated patterns
 *   - `*` wildcard (glob, not regex)
 *   - `-` prefix negates a pattern; negations take precedence over positive matches
 *
 * Spec-first: all expected values are written by hand from the rules above,
 * not derived from running the implementation.
 */

import { describe, it, expect } from "vitest";
import { isNamespaceEnabled } from "@formspec/core";

describe("isNamespaceEnabled", () => {
  // ── empty / undefined-equivalent patterns ──────────────────────────────────

  it("returns false for empty pattern string", () => {
    expect(isNamespaceEnabled("", "formspec:cli")).toBe(false);
  });

  it("returns false for whitespace-only pattern", () => {
    expect(isNamespaceEnabled("   ", "formspec:cli")).toBe(false);
  });

  // ── exact match ────────────────────────────────────────────────────────────

  it("returns true when pattern exactly matches namespace", () => {
    expect(isNamespaceEnabled("formspec:cli", "formspec:cli")).toBe(true);
  });

  it("returns false when pattern does not match namespace", () => {
    expect(isNamespaceEnabled("formspec:build", "formspec:cli")).toBe(false);
  });

  it("is case-sensitive: 'Formspec:cli' does not match 'formspec:cli'", () => {
    expect(isNamespaceEnabled("Formspec:cli", "formspec:cli")).toBe(false);
  });

  // ── wildcard (*) ───────────────────────────────────────────────────────────

  it("* alone enables any namespace", () => {
    expect(isNamespaceEnabled("*", "formspec:cli")).toBe(true);
    expect(isNamespaceEnabled("*", "anything")).toBe(true);
  });

  it("prefix wildcard formspec:* matches all formspec namespaces", () => {
    expect(isNamespaceEnabled("formspec:*", "formspec:cli")).toBe(true);
    expect(isNamespaceEnabled("formspec:*", "formspec:build")).toBe(true);
    expect(isNamespaceEnabled("formspec:*", "formspec:build:ir")).toBe(true);
  });

  it("prefix wildcard formspec:* does not match unrelated namespaces", () => {
    expect(isNamespaceEnabled("formspec:*", "other:lib")).toBe(false);
  });

  it("suffix wildcard *:cli matches any prefix before :cli", () => {
    expect(isNamespaceEnabled("*:cli", "formspec:cli")).toBe(true);
    expect(isNamespaceEnabled("*:cli", "myapp:cli")).toBe(true);
  });

  it("mid-string wildcard formspec:*:ir matches multi-level names", () => {
    expect(isNamespaceEnabled("formspec:*:ir", "formspec:build:ir")).toBe(true);
    expect(isNamespaceEnabled("formspec:*:ir", "formspec:x:ir")).toBe(true);
    expect(isNamespaceEnabled("formspec:*:ir", "formspec:build:schema")).toBe(false);
  });

  // ── negation (-) ───────────────────────────────────────────────────────────

  it("negation alone (-formspec:build) does not enable formspec:cli", () => {
    // Only negation, no positive patterns → nothing is enabled
    expect(isNamespaceEnabled("-formspec:build", "formspec:cli")).toBe(false);
  });

  it("negation silences a specific namespace when combined with wildcard", () => {
    // formspec:* enables everything under formspec, but -formspec:cli:noisy blocks it
    expect(isNamespaceEnabled("formspec:*,-formspec:cli:noisy", "formspec:cli")).toBe(true);
    expect(isNamespaceEnabled("formspec:*,-formspec:cli:noisy", "formspec:cli:noisy")).toBe(false);
    expect(isNamespaceEnabled("formspec:*,-formspec:cli:noisy", "formspec:build")).toBe(true);
  });

  it("negation wildcard silences a whole subtree", () => {
    // Everything under formspec except formspec:build:*
    expect(isNamespaceEnabled("formspec:*,-formspec:build:*", "formspec:cli")).toBe(true);
    expect(isNamespaceEnabled("formspec:*,-formspec:build:*", "formspec:build:ir")).toBe(false);
    expect(isNamespaceEnabled("formspec:*,-formspec:build:*", "formspec:build:schema")).toBe(false);
    // formspec:build itself does not match the -formspec:build:* negation (needs : after build)
    expect(isNamespaceEnabled("formspec:*,-formspec:build:*", "formspec:build")).toBe(true);
  });

  it("negation takes precedence regardless of pattern order", () => {
    // Even though the positive pattern appears after the negation pattern, negations win
    expect(isNamespaceEnabled("-formspec:cli,formspec:*", "formspec:cli")).toBe(false);
  });

  // ── comma-separated multiple patterns ──────────────────────────────────────

  it("returns true when any positive pattern matches", () => {
    expect(isNamespaceEnabled("formspec:cli,formspec:build", "formspec:cli")).toBe(true);
    expect(isNamespaceEnabled("formspec:cli,formspec:build", "formspec:build")).toBe(true);
  });

  it("returns false when no positive pattern matches", () => {
    expect(isNamespaceEnabled("formspec:cli,formspec:build", "formspec:analysis")).toBe(false);
  });

  it("handles leading/trailing spaces around comma-separated patterns", () => {
    expect(isNamespaceEnabled("formspec:cli , formspec:build", "formspec:build")).toBe(true);
  });

  it("ignores empty segments produced by adjacent commas", () => {
    expect(isNamespaceEnabled("formspec:cli,,formspec:build", "formspec:build")).toBe(true);
  });

  // ── negative cases: ensure exact semantics ──────────────────────────────────

  it("formspec:build does not match formspec:build:ir (partial match is not enough)", () => {
    // Exact pattern without wildcard must be an exact match
    expect(isNamespaceEnabled("formspec:build", "formspec:build:ir")).toBe(false);
  });

  it("formspec: prefix does not match formspec:cli (colon is literal, not wildcard)", () => {
    expect(isNamespaceEnabled("formspec:", "formspec:cli")).toBe(false);
  });
});
