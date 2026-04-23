/**
 * Unit tests for the tag-scanner utility.
 *
 * Tests cover `scanFormSpecTags` (the public API) and `getTagIdentity`.
 *
 * Because `scanFormSpecTags` requires a `SourceCode` object only to
 * retrieve leading JSDoc comments, a minimal mock is used: an object
 * with just `getCommentsBefore` returning the constructed comment.
 * This is documented on the mock construction sites below.
 */

import { AST_NODE_TYPES, AST_TOKEN_TYPES, type TSESTree } from "@typescript-eslint/utils";
import type { SourceCode } from "@typescript-eslint/utils/ts-eslint";
import { describe, expect, it } from "vitest";
import { getTagIdentity, scanFormSpecTags, type ScannedTag } from "../../src/utils/tag-scanner.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Constructs a minimal TSESTree.Block comment whose `value` is the content
 * between `/*` and `*\/`. The `range` starts at `rangeStart` so that
 * `rawArgumentRange` assertions can be checked against absolute positions.
 *
 * The comment text must start with `/**` (JSDoc) for `getLeadingJSDocComments`
 * to include it. The `value` field therefore starts with `*`.
 */
function makeBlockComment(source: string, rangeStart = 0): TSESTree.Comment {
  // source is the full comment text, e.g. "/** @minimum 0 */"
  // value = everything between /* and */
  const value = source.slice(2, source.length - 2);
  const end = rangeStart + source.length;
  return {
    type: AST_TOKEN_TYPES.Block,
    value,
    range: [rangeStart, end],
    loc: {
      start: { line: 1, column: rangeStart },
      end: { line: 1, column: end },
    },
  };
}

/**
 * Creates a minimal SourceCode mock that returns the given comments for
 * any `getCommentsBefore` call. Only `getCommentsBefore` is exercised by
 * `scanFormSpecTags` on non-PropertyDefinition nodes.
 *
 * The cast to `SourceCode` is intentional: SourceCode has dozens of methods
 * we do not need; this mock only satisfies the narrow contract used by the
 * scanner.
 */
function makeSourceCode(comments: TSESTree.Comment[]): SourceCode {
  return {
    getCommentsBefore: (_node: TSESTree.Node | TSESTree.Token) => comments,
  } as unknown as SourceCode;
}

/**
 * Creates a minimal non-PropertyDefinition AST node to pass as the subject
 * node to `scanFormSpecTags`. The scanner calls `getCommentsBefore(node)`;
 * the node type only matters to trigger the PropertyDefinition branch.
 */
function makeSubjectNode(): TSESTree.Node {
  return {
    type: AST_NODE_TYPES.ClassDeclaration,
    range: [0, 0],
    loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
  } as unknown as TSESTree.Node;
}

/**
 * Convenience wrapper: parse a single JSDoc comment and return its scanned tags.
 *
 * @param source - The full JSDoc comment text, e.g. `"/** @minimum 0 *\/"`.
 * @param rangeStart - Absolute offset of the `/*` in the source file (default 0).
 */
function scanTags(source: string, rangeStart = 0): ScannedTag[] {
  const comment = makeBlockComment(source, rangeStart);
  const sourceCode = makeSourceCode([comment]);
  return scanFormSpecTags(makeSubjectNode(), sourceCode);
}

// ---------------------------------------------------------------------------
// Single tag — basic field extraction
// ---------------------------------------------------------------------------

describe("scanFormSpecTags — single tag", () => {
  it("extracts rawName for @minimum", () => {
    // spec: rawName is the identifier as written in the source, before normalisation
    const [tag] = scanTags("/** @minimum 0 */");
    expect(tag?.rawName).toBe("minimum");
  });

  it("extracts normalizedName (first char lowercased) for @minimum", () => {
    // spec: normalizeFormSpecTagName lowercases the first character only
    const [tag] = scanTags("/** @minimum 0 */");
    expect(tag?.normalizedName).toBe("minimum");
  });

  it("normalizedName lowercases an uppercase first letter", () => {
    // spec: @Minimum → normalizedName "minimum" (camelCase convention)
    const [tag] = scanTags("/** @Minimum 5 */");
    expect(tag?.normalizedName).toBe("minimum");
    expect(tag?.rawName).toBe("Minimum");
  });

  it("extracts rawArgument for @minimum 0", () => {
    // spec: rawArgument is the trimmed text after the tag name on the same segment
    const [tag] = scanTags("/** @minimum 0 */");
    expect(tag?.rawArgument).toBe("0");
  });

  it("extracts valueText equal to rawArgument when no target is present", () => {
    // spec: valueText = rawArgument when there is no :target prefix
    const [tag] = scanTags("/** @minimum 0 */");
    expect(tag?.valueText).toBe("0");
  });

  it("target is null when no :target prefix is present", () => {
    // spec: target is null for plain value arguments
    const [tag] = scanTags("/** @minimum 0 */");
    expect(tag?.target).toBeNull();
  });

  it("rawText contains the tag name and its argument", () => {
    // spec: rawText is the trimmed segment from @tag to the start of the next tag
    const [tag] = scanTags("/** @minimum 0 */");
    expect(tag?.rawText).toBe("@minimum 0");
  });

  it("comment reference points back to the original Comment node", () => {
    const comment = makeBlockComment("/** @minimum 0 */");
    const sourceCode = makeSourceCode([comment]);
    const [tag] = scanFormSpecTags(makeSubjectNode(), sourceCode);
    expect(tag?.comment).toBe(comment);
  });
});

// ---------------------------------------------------------------------------
// rawArgumentRange accuracy
// ---------------------------------------------------------------------------

describe("scanFormSpecTags — rawArgumentRange", () => {
  it("points to the correct character range for a single-digit argument at offset 0", () => {
    // "/** @minimum 0 */"
    //  0123456789012345
    //  01234567890123456
    //  commentContentStart = 0 + 2 = 2
    //  cleanedPrefixLength = 2 ("* ")
    //  tag start=0, end=8 in cleaned ("@minimum")
    //  leadingWhitespace = 1 (the space between "minimum" and "0")
    //  rawArgumentStart = 2 + 0 + 2 + 0 + 8 + 1 = 13
    //  rawArgument = "0" (length 1) → range [13, 14]
    const [tag] = scanTags("/** @minimum 0 */");
    expect(tag?.rawArgumentRange).toEqual([13, 14]);
  });

  it("rawArgumentRange is null when the tag has no argument", () => {
    // spec: rawArgumentRange is null when rawArgument is empty
    const [tag] = scanTags("/** @uniqueItems */");
    expect(tag?.rawArgumentRange).toBeNull();
  });

  it("rawArgumentRange adjusts when comment does not start at offset 0", () => {
    // Source with leading whitespace: "    /** @minimum 42 */"
    //                                  0123    = 4 spaces, rangeStart=4
    // commentContentStart = 4 + 2 = 6
    // cleanedPrefixLength = 2, tag start=0, end=8, leadingWhitespace=1
    // rawArgumentStart = 6 + 0 + 2 + 0 + 8 + 1 = 17
    // rawArgument = "42" → range [17, 19]
    const [tag] = scanTags("/** @minimum 42 */", 4);
    expect(tag?.rawArgumentRange).toEqual([17, 19]);
  });

  it("rawArgumentRange spans multi-character arguments correctly", () => {
    // "/** @maxLength 100 */"
    //  0         1         2
    //  0123456789012345678901
    // commentContentStart = 2
    // cleanedPrefixLength = 2 ("* ")
    // @maxLength = 10 chars → end=10 in cleaned
    // leadingWhitespace = 1
    // rawArgumentStart = 2 + 0 + 2 + 0 + 10 + 1 = 15
    // "100" length = 3 → range [15, 18]
    const [tag] = scanTags("/** @maxLength 100 */");
    expect(tag?.rawArgumentRange).toEqual([15, 18]);
  });
});

// ---------------------------------------------------------------------------
// Multiple tags on the same line
// ---------------------------------------------------------------------------

describe("scanFormSpecTags — multiple tags on one line", () => {
  it("returns both tags", () => {
    const tags = scanTags("/** @minimum 0 @maximum 100 */");
    expect(tags).toHaveLength(2);
  });

  it("first tag rawName and rawArgument are correct", () => {
    const [first] = scanTags("/** @minimum 0 @maximum 100 */");
    expect(first?.rawName).toBe("minimum");
    expect(first?.rawArgument).toBe("0");
  });

  it("second tag rawName and rawArgument are correct", () => {
    const [, second] = scanTags("/** @minimum 0 @maximum 100 */");
    expect(second?.rawName).toBe("maximum");
    expect(second?.rawArgument).toBe("100");
  });

  it("rawText for the first tag ends before the second tag starts", () => {
    // rawText is trimmed from the current tag to the start of the next
    const [first] = scanTags("/** @minimum 0 @maximum 100 */");
    expect(first?.rawText).toBe("@minimum 0");
  });
});

// ---------------------------------------------------------------------------
// Multiple tags on separate lines (multi-line JSDoc)
// ---------------------------------------------------------------------------

describe("scanFormSpecTags — multiple tags on separate lines", () => {
  const multilineComment = ["/**", " * @minimum 0", " * @maximum 100", " */"].join("\n");

  it("returns both tags from a multi-line comment", () => {
    const tags = scanTags(multilineComment);
    expect(tags).toHaveLength(2);
  });

  it("extracts rawName and rawArgument from first line", () => {
    const [first] = scanTags(multilineComment);
    expect(first?.rawName).toBe("minimum");
    expect(first?.rawArgument).toBe("0");
  });

  it("extracts rawName and rawArgument from second line", () => {
    const [, second] = scanTags(multilineComment);
    expect(second?.rawName).toBe("maximum");
    expect(second?.rawArgument).toBe("100");
  });
});

// ---------------------------------------------------------------------------
// Tag mid-line in prose
// ---------------------------------------------------------------------------

describe("scanFormSpecTags — tag appearing mid-line after prose", () => {
  it("finds a tag after prose text on the same line", () => {
    // The scanner finds @-tags anywhere on a cleaned line, not just at the start.
    // This is the documented current behavior.
    const tags = scanTags("/** A legal field @minimum 0 */");
    const minimumTag = tags.find((t) => t.rawName === "minimum");
    expect(minimumTag).toBeDefined();
    expect(minimumTag?.rawArgument).toBe("0");
  });

  it("does not emit a tag for the prose text before the @-tag", () => {
    const tags = scanTags("/** A legal field @minimum 0 */");
    // Only one tag should be found
    expect(tags).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Target parsing — :path
// ---------------------------------------------------------------------------

describe("scanFormSpecTags — target parsing (:path)", () => {
  it("parses a bare identifier target for @discriminator", () => {
    // @discriminator supports 'path' target (from DISCRIMINATOR_TAG_METADATA).
    // raw captures the text after the leading ":" — the colon is the trigger
    // syntax, not part of the raw value stored in ScannedTagTarget.raw.
    const [tag] = scanTags("/** @discriminator :kind T */");
    expect(tag?.target).not.toBeNull();
    expect(tag?.target?.kind).toBe("path");
    expect(tag?.target?.value).toBe("kind");
    expect(tag?.target?.raw).toBe("kind");
  });

  it("valueText is the text after the target", () => {
    // spec: valueText = text after `:target ` is stripped
    const [tag] = scanTags("/** @discriminator :kind T */");
    expect(tag?.valueText).toBe("T");
  });

  it("parses a dotted path target", () => {
    // spec: `:a.b` is a valid path target matching /[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*/
    // raw is the text after the colon (no colon prefix in raw)
    const [tag] = scanTags("/** @discriminator :meta.kind T */");
    expect(tag?.target?.value).toBe("meta.kind");
    expect(tag?.target?.raw).toBe("meta.kind");
  });

  it("parses a quoted string target", () => {
    // spec: `:"my field"` is a valid quoted target; raw includes quotes, value strips them
    const [tag] = scanTags('/** @discriminator :"my field" T */');
    expect(tag?.target?.raw).toBe('"my field"');
    expect(tag?.target?.value).toBe("my field");
  });
});

// ---------------------------------------------------------------------------
// Target parsing — :variant
// ---------------------------------------------------------------------------

describe("scanFormSpecTags — target parsing (:variant)", () => {
  it("infers 'variant' kind for :singular on a tag that supports variant", () => {
    // @displayName supports variant targets; :singular and :plural map to kind "variant"
    const [tag] = scanTags("/** @displayName :singular Customer */");
    expect(tag?.target?.kind).toBe("variant");
    expect(tag?.target?.value).toBe("singular");
  });

  it("infers 'variant' kind for :plural on a tag that supports variant", () => {
    const [tag] = scanTags("/** @displayName :plural Customers */");
    expect(tag?.target?.kind).toBe("variant");
    expect(tag?.target?.value).toBe("plural");
  });
});

// ---------------------------------------------------------------------------
// Target absent — rawArgument does not start with :
// ---------------------------------------------------------------------------

describe("scanFormSpecTags — no target when argument is not a :specifier", () => {
  it("treats a plain non-colon argument as no target", () => {
    // "kind T" does not match the target regex (no leading colon)
    const [tag] = scanTags("/** @discriminator kind T */");
    expect(tag?.target).toBeNull();
    expect(tag?.rawArgument).toBe("kind T");
    expect(tag?.valueText).toBe("kind T");
  });
});

// ---------------------------------------------------------------------------
// Tag name normalization
// ---------------------------------------------------------------------------

describe("scanFormSpecTags — tag name normalization", () => {
  it("normalizes @MaxLength to maxLength", () => {
    const [tag] = scanTags("/** @MaxLength 50 */");
    expect(tag?.rawName).toBe("MaxLength");
    expect(tag?.normalizedName).toBe("maxLength");
  });

  it("normalizes @MinItems to minItems", () => {
    const [tag] = scanTags("/** @MinItems 1 */");
    expect(tag?.normalizedName).toBe("minItems");
  });

  it("leaves already-lowercase names unchanged", () => {
    const [tag] = scanTags("/** @pattern .+ */");
    expect(tag?.rawName).toBe("pattern");
    expect(tag?.normalizedName).toBe("pattern");
  });
});

// ---------------------------------------------------------------------------
// No tags
// ---------------------------------------------------------------------------

describe("scanFormSpecTags — no-tag cases", () => {
  it("returns an empty array when the comment has no @-tags", () => {
    const tags = scanTags("/** A plain description with no tags */");
    expect(tags).toHaveLength(0);
  });

  it("returns an empty array when no JSDoc comments are present", () => {
    // Non-JSDoc block comment (no leading asterisk in value) is filtered out
    const comment: TSESTree.Comment = {
      type: AST_TOKEN_TYPES.Block,
      value: " a plain block comment ",
      range: [0, 25],
      loc: {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 25 },
      },
    };
    const sourceCode = makeSourceCode([comment]);
    const tags = scanFormSpecTags(makeSubjectNode(), sourceCode);
    expect(tags).toHaveLength(0);
  });

  it("returns an empty array when the comment list is empty", () => {
    const sourceCode = makeSourceCode([]);
    const tags = scanFormSpecTags(makeSubjectNode(), sourceCode);
    expect(tags).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getTagIdentity
// ---------------------------------------------------------------------------

describe("getTagIdentity", () => {
  it("returns 'normalizedName|none' when target is null", () => {
    // spec: identity = `${normalizedName}|none` when no target
    const [tag] = scanTags("/** @minimum 0 */");
    expect(tag).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asserted above
    expect(getTagIdentity(tag!)).toBe("minimum|none");
  });

  it("returns 'normalizedName|kind:value' when a target is present", () => {
    // spec: identity = `${normalizedName}|${target.kind}:${target.value}`
    const [tag] = scanTags("/** @discriminator :kind T */");
    expect(tag).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asserted above
    expect(getTagIdentity(tag!)).toBe("discriminator|path:kind");
  });

  it("deduplication key differs when target value differs", () => {
    const [tagA] = scanTags("/** @discriminator :kind T */");
    const [tagB] = scanTags("/** @discriminator :type T */");
    expect(tagA).toBeDefined();
    expect(tagB).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asserted above
    expect(getTagIdentity(tagA!)).not.toBe(getTagIdentity(tagB!));
  });

  it("deduplication key is the same for two identical tags", () => {
    const [tagA] = scanTags("/** @minimum 0 */");
    const [tagB] = scanTags("/** @minimum 99 */");
    expect(tagA).toBeDefined();
    expect(tagB).toBeDefined();
    // identity ignores the argument value — it's purely name + target
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asserted above
    expect(getTagIdentity(tagA!)).toBe(getTagIdentity(tagB!));
  });

  it("deduplication key normalizes the tag name (Minimum == minimum)", () => {
    const [tagLower] = scanTags("/** @minimum 0 */");
    const [tagUpper] = scanTags("/** @Minimum 0 */");
    expect(tagLower).toBeDefined();
    expect(tagUpper).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asserted above
    expect(getTagIdentity(tagLower!)).toBe(getTagIdentity(tagUpper!));
  });
});
