/**
 * Tests for the shared RFC 6901 JSON Pointer token helpers.
 *
 * Expected escapes are written by hand from RFC 6901 §3:
 *   `~` → `~0`, `/` → `~1`, applied `~`-first on encode and `~1`-first on decode.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc6901
 */
import { describe, it, expect } from "vitest";
import { encodeJsonPointerToken, decodeJsonPointerToken } from "../src/ui-schema/json-pointer.js";

describe("encodeJsonPointerToken", () => {
  it("leaves a token with no special characters unchanged", () => {
    expect(encodeJsonPointerToken("name")).toBe("name");
  });

  it("escapes a forward slash to ~1 (RFC 6901 §3)", () => {
    expect(encodeJsonPointerToken("a/b")).toBe("a~1b");
  });

  it("escapes a tilde to ~0 (RFC 6901 §3)", () => {
    expect(encodeJsonPointerToken("a~b")).toBe("a~0b");
  });

  it("escapes ~ before / so a literal ~1 is not misread as an escaped slash", () => {
    // Input literal "~1": ~-first ordering yields "~01", not "~11".
    expect(encodeJsonPointerToken("~1")).toBe("~01");
  });

  it("escapes both tilde and slash together (a/b~c → a~1b~0c)", () => {
    expect(encodeJsonPointerToken("a/b~c")).toBe("a~1b~0c");
  });

  it("escapes every occurrence, not just the first", () => {
    expect(encodeJsonPointerToken("a/b/c")).toBe("a~1b~1c");
    expect(encodeJsonPointerToken("a~b~c")).toBe("a~0b~0c");
  });

  it("does not transform spaces, Unicode, or URI-reserved characters", () => {
    expect(encodeJsonPointerToken("first name")).toBe("first name");
    expect(encodeJsonPointerToken("café")).toBe("café");
    expect(encodeJsonPointerToken("a?b=1&c")).toBe("a?b=1&c");
    expect(encodeJsonPointerToken("a%2Fb")).toBe("a%2Fb");
  });

  it("returns an empty string unchanged", () => {
    expect(encodeJsonPointerToken("")).toBe("");
  });
});

describe("decodeJsonPointerToken", () => {
  it("leaves a token with no escapes unchanged", () => {
    expect(decodeJsonPointerToken("name")).toBe("name");
  });

  it("decodes ~1 to a forward slash", () => {
    expect(decodeJsonPointerToken("a~1b")).toBe("a/b");
  });

  it("decodes ~0 to a tilde", () => {
    expect(decodeJsonPointerToken("a~0b")).toBe("a~b");
  });

  it("decodes ~1 before ~0 so ~01 round-trips to a literal ~1", () => {
    expect(decodeJsonPointerToken("~01")).toBe("~1");
  });

  it("decodes both escapes together (a~1b~0c → a/b~c)", () => {
    expect(decodeJsonPointerToken("a~1b~0c")).toBe("a/b~c");
  });

  it("decodes every occurrence, not just the first", () => {
    expect(decodeJsonPointerToken("a~1b~1c")).toBe("a/b/c");
    expect(decodeJsonPointerToken("a~0b~0c")).toBe("a~b~c");
  });
});

describe("encode/decode round-trip", () => {
  const names = [
    "name",
    "a/b",
    "a~b",
    "a/b~c",
    "~1",
    "~0",
    "///",
    "~~~",
    "first name",
    "café",
    "a?b=1&c",
    "a%2Fb",
    "路径",
    "",
  ];

  for (const name of names) {
    it(`round-trips ${JSON.stringify(name)} unchanged`, () => {
      expect(decodeJsonPointerToken(encodeJsonPointerToken(name))).toBe(name);
    });
  }
});
