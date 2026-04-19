/**
 * Tests for the shared logger contract in `@formspec/core`.
 *
 * Semantics follow the `debug` npm package convention: comma-separated
 * patterns, `*` wildcard, `-` prefix for negation, and negations always win
 * regardless of ordering.
 *
 * @see https://github.com/debug-js/debug#wildcards
 */
import { describe, expect, it, vi } from "vitest";
import { isNamespaceEnabled, noopLogger } from "../logger.js";

describe("isNamespaceEnabled", () => {
  describe("empty and whitespace patterns", () => {
    it("returns false for empty string", () => {
      expect(isNamespaceEnabled("", "formspec:cli")).toBe(false);
    });

    it("returns false for whitespace-only string", () => {
      expect(isNamespaceEnabled("   ", "formspec:cli")).toBe(false);
    });

    it("returns false for a list of empty commas", () => {
      expect(isNamespaceEnabled(",,,", "formspec:cli")).toBe(false);
    });
  });

  describe("exact match", () => {
    it("enables exact namespace match", () => {
      expect(isNamespaceEnabled("formspec:cli", "formspec:cli")).toBe(true);
    });

    it("does not enable non-matching namespace", () => {
      expect(isNamespaceEnabled("formspec:cli", "formspec:build")).toBe(false);
    });

    it("treats `:` as a literal character", () => {
      expect(isNamespaceEnabled("formspec:cli", "formspec_cli")).toBe(false);
    });
  });

  describe("wildcards", () => {
    it("matches everything under a prefix with `*`", () => {
      expect(isNamespaceEnabled("formspec:*", "formspec:cli")).toBe(true);
      expect(isNamespaceEnabled("formspec:*", "formspec:build:ir")).toBe(true);
    });

    it("does not match a different prefix", () => {
      expect(isNamespaceEnabled("formspec:*", "other:cli")).toBe(false);
    });

    it("matches multi-segment wildcard", () => {
      expect(isNamespaceEnabled("*:ir", "formspec:build:ir")).toBe(true);
    });

    it("bare `*` matches anything", () => {
      expect(isNamespaceEnabled("*", "anything")).toBe(true);
    });
  });

  describe("negation", () => {
    it("disables a specific namespace under a wildcard", () => {
      expect(isNamespaceEnabled("formspec:*,-formspec:cli", "formspec:cli")).toBe(false);
    });

    it("still enables non-negated namespaces under the wildcard", () => {
      expect(isNamespaceEnabled("formspec:*,-formspec:cli", "formspec:build")).toBe(true);
    });

    it("negation wins regardless of ordering", () => {
      expect(isNamespaceEnabled("-formspec:cli,formspec:*", "formspec:cli")).toBe(false);
    });

    it("negation without a positive pattern leaves everything disabled", () => {
      expect(isNamespaceEnabled("-formspec:cli", "formspec:cli")).toBe(false);
      expect(isNamespaceEnabled("-formspec:cli", "formspec:build")).toBe(false);
    });

    it("wildcard negation disables a whole prefix", () => {
      expect(isNamespaceEnabled("*,-formspec:*", "formspec:cli")).toBe(false);
      expect(isNamespaceEnabled("*,-formspec:*", "other:foo")).toBe(true);
    });
  });

  describe("comma-separated lists", () => {
    it("enables when any positive pattern matches", () => {
      expect(isNamespaceEnabled("formspec:cli,formspec:build", "formspec:build")).toBe(true);
    });

    it("ignores whitespace around patterns", () => {
      expect(isNamespaceEnabled("  formspec:cli  ,  formspec:build  ", "formspec:cli")).toBe(true);
    });
  });

  describe("malformed input does not throw", () => {
    it("handles lone `-`", () => {
      expect(() => isNamespaceEnabled("-", "formspec:cli")).not.toThrow();
      expect(isNamespaceEnabled("-", "formspec:cli")).toBe(false);
    });

    it("handles regex metacharacters in the pattern", () => {
      expect(() => isNamespaceEnabled("form(spec", "form(spec")).not.toThrow();
      expect(isNamespaceEnabled("form(spec", "form(spec")).toBe(true);
    });
  });
});

describe("noopLogger", () => {
  it("child() returns a LoggerLike", () => {
    const child = noopLogger.child({ stage: "ir" });
    expect(typeof child.debug).toBe("function");
  });

  it("does not write to console", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {
      /* silence */
    });
    try {
      noopLogger.trace("x");
      noopLogger.debug("x");
      noopLogger.info("x");
      noopLogger.warn("x");
      noopLogger.error("x");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
