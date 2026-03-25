/**
 * Tests for the shared JSON parsing utility used by the analyzer pipeline.
 */

import { describe, it, expect } from "vitest";
import { tryParseJson } from "../analyzer/json-utils.js";

describe("tryParseJson", () => {
  // -------------------------------------------------------------------------
  // Positive cases — valid JSON returns the parsed value
  // -------------------------------------------------------------------------

  it("parses a JSON array", () => {
    expect(tryParseJson('["a", "b"]')).toEqual(["a", "b"]);
  });

  it("parses a JSON object", () => {
    expect(tryParseJson('{"key": 1}')).toEqual({ key: 1 });
  });

  it("parses a JSON number", () => {
    expect(tryParseJson("42")).toBe(42);
  });

  it("parses a JSON string", () => {
    expect(tryParseJson('"hello"')).toBe("hello");
  });

  it("parses a JSON boolean true", () => {
    expect(tryParseJson("true")).toBe(true);
  });

  it("parses a JSON boolean false", () => {
    expect(tryParseJson("false")).toBe(false);
  });

  it("parses JSON null", () => {
    expect(tryParseJson("null")).toBeNull();
  });

  it("parses a nested JSON array", () => {
    expect(tryParseJson('[1, {"id": "x"}, 3]')).toEqual([1, { id: "x" }, 3]);
  });

  // -------------------------------------------------------------------------
  // Negative cases — invalid JSON returns null (no throw)
  // -------------------------------------------------------------------------

  it("returns null for invalid JSON (bare word)", () => {
    expect(tryParseJson("not-json")).toBeNull();
  });

  it("returns null for JSON with trailing comma (not valid JSON)", () => {
    // JSON.parse rejects trailing commas — this exercises the catch path
    expect(tryParseJson("[1, 2,]")).toBeNull();
  });

  it("returns null for an unclosed array", () => {
    expect(tryParseJson("[1, 2")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(tryParseJson("")).toBeNull();
  });

  it("returns null for a string with only whitespace", () => {
    expect(tryParseJson("   ")).toBeNull();
  });

  it("does not throw on invalid JSON", () => {
    expect(() => tryParseJson("{bad json}")).not.toThrow();
  });
});
