/**
 * Integration test pinning the orphaned raw-text-fallback path in
 * `tsdoc-parser.ts:1305-1331` (§9.3 #17).
 *
 * # What is the orphaned fallback path?
 *
 * `parseTSDocTags` maintains two tag-collection strategies running in parallel:
 *
 * 1. The **unified parser path** (main loop, lines 1150-1284): iterates
 *    `ts.getLeadingCommentRanges`, calls `parseUnifiedComment` on each `/**`
 *    block, and for `TAGS_REQUIRING_RAW_TEXT` tags (`@pattern`, `@enumOptions`,
 *    `@defaultValue`) pops the corresponding entry from `rawTextFallbacks` with
 *    `.shift()` as it consumes each tag.
 *
 * 2. The **TS compiler API fallback** (`collectRawTextFallbacks`): calls
 *    `ts.getJSDocTags(node)` once before the main loop and builds a map of
 *    `TAGS_REQUIRING_RAW_TEXT` tags found by TypeScript's own JSDoc parser.
 *
 * After the main loop, any entries remaining in `rawTextFallbacks` are
 * "orphaned": they were found by `ts.getJSDocTags()` but never consumed by
 * the regex-based unified parser.  Those orphans are processed at lines
 * 1305-1331.
 *
 * # Attempt to isolate the orphan path
 *
 * Extensive probing was performed to find comment syntax that would cause
 * `parseCommentBlock` (the regex parser inside `parseUnifiedComment`) to miss
 * a `@pattern` tag that `ts.getJSDocTags()` still finds.  The cases tested:
 *
 * - Tags on continuation lines (with and without `*` prefix)
 * - Comments starting with `/**` but having content before the first `*` line
 * - Multi-star lines (`** @pattern`)
 * - Tags immediately following another tag on the same line
 * - Tags after `{` characters that confuse TSDoc but not the regex parser
 * - Properties with decorators or access modifiers
 * - Interface and type-alias property signatures
 * - Comments that start on the same line as the property declaration
 *
 * In every case, both parsers agreed: if `ts.getJSDocTags()` found `@pattern`,
 * the regex parser also found it in the `/**` comment range.  The regex parser
 * (`parseCommentBlock`) is robust enough that the orphan path does not appear
 * to be reachable through any tested input.
 *
 * # What this test pins
 *
 * Rather than testing the orphan path directly (which cannot be isolated with
 * the current pipeline), this file pins the following:
 *
 * 1. The **normal recovery path** for `@pattern "abc"` through the unified
 *    parser so Phase 1 knows what the baseline looks like.
 * 2. A **near-miss case** where the raw fallback map IS populated but gets
 *    consumed by the unified parser (not orphaned), confirming that the
 *    `rawTextFallbacks` mechanism as a whole functions correctly.
 * 3. Explicit documentation that the orphan path (1305-1331) is not currently
 *    exercised.  Phase 1's typed parser must decide whether to preserve the
 *    orphan recovery or explicitly decline to (and can rely on this file as
 *    the spec test either way).
 *
 * @see packages/build/src/analyzer/tsdoc-parser.ts lines 1144-1146 (fallback collection)
 * @see packages/build/src/analyzer/tsdoc-parser.ts lines 1203-1230 (unified-parser consumption)
 * @see packages/build/src/analyzer/tsdoc-parser.ts lines 1305-1331 (orphan processing)
 * @see docs/refactors/synthetic-checker-retirement.md §9.3 #17
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import {
  extractJSDocConstraintNodes,
  extractJSDocParseResult,
} from "../src/analyzer/jsdoc-constraints.js";
import { parseTSDocTags } from "../src/analyzer/tsdoc-parser.js";

// =============================================================================
// Test helpers
// =============================================================================

/**
 * Creates an in-memory TypeScript source file and returns the first property
 * declaration found in the first class.
 *
 * The source MUST include a class with a property on its own line (not inline
 * with the class opening brace) for TypeScript to attach JSDoc to the property.
 */
function getPropertyFromSource(source: string): ts.PropertyDeclaration {
  const sourceFile = ts.createSourceFile("test.ts", source, ts.ScriptTarget.Latest, true);

  for (const stmt of sourceFile.statements) {
    if (ts.isClassDeclaration(stmt)) {
      for (const member of stmt.members) {
        if (ts.isPropertyDeclaration(member)) {
          return member;
        }
      }
    }
  }

  throw new Error("No property declaration found in source");
}

/**
 * Counts how many qualifying raw-text tags TypeScript exposes on the node
 * via `ts.getJSDocTags` BEFORE `parseTSDocTags` has run.
 *
 * This is a white-box probe that measures what the TS compiler API finds —
 * i.e. the same population that `collectRawTextFallbacks` reads when it builds
 * the `rawTextFallbacks` map.  Because the count is taken before any consumption
 * by the unified parser, it tells you whether the TS JSDoc parser saw a given
 * `TAGS_REQUIRING_RAW_TEXT` tag at all, not how many entries remain after the
 * unified parser has processed the comment.
 */
function countRawTagsSeenByTypeScript(
  node: ts.Node,
  tagName: "pattern" | "enumOptions" | "defaultValue"
): number {
  const TAGS_REQUIRING_RAW_TEXT = new Set(["pattern", "enumOptions", "defaultValue"]);
  const tags = ts.getJSDocTags(node).filter(
    (t) =>
      TAGS_REQUIRING_RAW_TEXT.has(t.tagName.text.toLowerCase()) &&
      t.tagName.text.toLowerCase() === tagName
  );
  return tags.length;
}

// =============================================================================
// §9.3 #17 — Normal recovery through the unified parser (baseline)
// =============================================================================

describe("§9.3 #17 — orphaned raw-text-fallback path (tsdoc-parser.ts:1305-1331)", () => {
  describe("normal unified-parser recovery for @pattern (baseline, non-orphaned)", () => {
    it("recovers @pattern tag through the unified parser when comment is well-formed", () => {
      // current behavior: unified parser finds @pattern → produces PatternConstraintNode.
      // The TS compiler API fallback is populated AND consumed by the unified parser
      // (not orphaned).  This is the standard path that the orphan loop is a fallback for.
      const prop = getPropertyFromSource(`
        class Foo {
          /**
           * @pattern "abc"
           */
          x!: string;
        }
      `);

      const constraints = extractJSDocConstraintNodes(prop);

      expect(constraints).toHaveLength(1);
      // current behavior: raw-text extraction preserves the surrounding quotes in
      // `@pattern "abc"` — the stored pattern value is `"abc"` (with quotes).
      // Phase 1's typed parser must replicate this verbatim-preservation or
      // normalise the value (and update this assertion accordingly).
      expect(constraints[0]).toMatchObject({
        kind: "constraint",
        constraintKind: "pattern",
        pattern: '"abc"',
      });
    });

    it("recovers @pattern tag when the pattern contains regex special characters", () => {
      // Ensures the raw-text path (not TSDoc structural parse) is used for @pattern,
      // since TSDoc would mangle `@` and `{}` characters inside the payload.
      // current behavior: the raw text is stored verbatim (no unquoting).
      const prop = getPropertyFromSource(`
        class Foo {
          /**
           * @pattern ^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$
           */
          email!: string;
        }
      `);

      const constraints = extractJSDocConstraintNodes(prop);

      expect(constraints).toHaveLength(1);
      expect(constraints[0]).toMatchObject({
        kind: "constraint",
        constraintKind: "pattern",
        pattern: "^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$",
      });
    });

    it("recovers @pattern alongside other constraint tags", () => {
      // Verifies the aligned-consumption model: both @minimum and @pattern are
      // consumed by the unified-parser loop in order, leaving nothing in the
      // fallback map for the orphan loop to pick up.
      const prop = getPropertyFromSource(`
        class Foo {
          /**
           * @minimum 0
           * @pattern "abc"
           */
          x!: string;
        }
      `);

      const constraints = extractJSDocConstraintNodes(prop);

      const patternConstraint = constraints.find((c) => c.constraintKind === "pattern");
      expect(patternConstraint).toBeDefined();
      // current behavior: raw-text extraction preserves surrounding quotes (see above).
      expect(patternConstraint).toMatchObject({
        kind: "constraint",
        constraintKind: "pattern",
        pattern: '"abc"',
      });
    });
  });

  describe("TS compiler API fallback map — populated and consumed (not orphaned)", () => {
    it("ts.getJSDocTags finds the @pattern tag that the unified parser also finds", () => {
      // This confirms the TS compiler API and the regex parser agree: both find
      // @pattern in a standard /** ... */ comment.  The fallback entry IS built
      // but IS consumed by the unified parser before the orphan loop runs.
      //
      // current behavior: rawTextFallbacks has one @pattern entry before the
      // unified parser runs; that entry is consumed (.shift()) during the main loop.
      // The orphan loop at 1305-1331 sees an empty array and does nothing.
      const prop = getPropertyFromSource(`
        class Foo {
          /**
           * @pattern "abc"
           */
          x!: string;
        }
      `);

      const tsCount = countRawTagsSeenByTypeScript(prop, "pattern");
      const result = extractJSDocParseResult(prop);
      const patternConstraint = result.constraints.find((c) => c.constraintKind === "pattern");

      // TS compiler API found exactly one @pattern tag
      expect(tsCount).toBe(1);

      // Unified parser recovered it successfully — producing a constraint node.
      // current behavior: raw text preserves surrounding quotes (see baseline tests above).
      expect(patternConstraint).toMatchObject({
        kind: "constraint",
        constraintKind: "pattern",
        pattern: '"abc"',
      });
    });

    it("recovers @defaultValue through the same fallback+consumption model", () => {
      // @defaultValue is also in TAGS_REQUIRING_RAW_TEXT.  Pins baseline behavior.
      const prop = getPropertyFromSource(`
        class Foo {
          /**
           * @defaultValue "hello"
           */
          x!: string;
        }
      `);

      const result = parseTSDocTags(prop, "/test.ts");
      const defaultValueAnnotation = result.annotations.find(
        (a) => a.annotationKind === "defaultValue"
      );

      expect(defaultValueAnnotation).toBeDefined();
      expect(defaultValueAnnotation).toMatchObject({
        kind: "annotation",
        annotationKind: "defaultValue",
        value: "hello",
      });
    });
  });

  describe("orphaned fallback path isolation — not reachable under current pipeline", () => {
    it("orphan loop does not fire for a well-formed @pattern comment (fallback is consumed)", () => {
      // current behavior: the orphan path at 1305-1331 does NOT execute when the
      // unified parser successfully processes the comment.  This is the documented
      // baseline: the orphan loop is a defensive recovery path that the current
      // pipeline never exercises for standard /** ... */ comments.
      //
      // If Phase 1's typed parser removes the unified-parser consumption step, this
      // test (or its successor) must verify that the orphan loop (or its replacement)
      // still produces a PatternConstraintNode so no recovery is silently dropped.
      //
      // TODO(Phase 1): update or replace this test once the typed parser exists.
      // See docs/refactors/synthetic-checker-retirement.md §9.3 #17.
      const prop = getPropertyFromSource(`
        class Foo {
          /**
           * @pattern "abc"
           */
          x!: string;
        }
      `);

      // The output is the same regardless of which internal path produced it.
      // We assert the OBSERVABLE result, not the internal routing.
      const constraints = extractJSDocConstraintNodes(prop);
      const patternConstraint = constraints.find((c) => c.constraintKind === "pattern");

      // current behavior: @pattern "abc" IS recovered (through the unified parser
      // path, not the orphan path — but the caller cannot distinguish between them).
      // Raw text preserves surrounding quotes (see baseline tests above).
      expect(patternConstraint).toBeDefined();
      expect(patternConstraint).toMatchObject({
        kind: "constraint",
        constraintKind: "pattern",
        pattern: '"abc"',
      });
    });

    it("pattern missing from comment produces no constraint — orphan loop has nothing to recover", () => {
      // Negative case: confirms that a property with no @pattern tag produces no
      // PatternConstraintNode.  Both the unified parser and (if it ran) the orphan
      // loop would agree on this.
      const prop = getPropertyFromSource(`
        class Foo {
          /**
           * @minimum 0
           */
          x!: string;
        }
      `);

      const constraints = extractJSDocConstraintNodes(prop);
      const patternConstraint = constraints.find((c) => c.constraintKind === "pattern");

      expect(patternConstraint).toBeUndefined();
    });

    it("no TAGS_REQUIRING_RAW_TEXT entries left unconsumed after full parse of standard comment", () => {
      // Structural invariant: for a well-formed comment, the TS compiler API sees
      // the same tags as the unified parser.  After the unified parser consumes
      // them via .shift(), nothing is left for the orphan loop.
      //
      // Verified indirectly: if the orphan loop DID fire and produced a duplicate
      // PatternConstraintNode, this test would catch the duplicate.
      const prop = getPropertyFromSource(`
        class Foo {
          /**
           * @pattern "abc"
           */
          x!: string;
        }
      `);

      const constraints = extractJSDocConstraintNodes(prop);
      const patternConstraints = constraints.filter((c) => c.constraintKind === "pattern");

      // current behavior: exactly one PatternConstraintNode — not duplicated.
      // If the orphan loop fired AND produced a second node, this would fail.
      expect(patternConstraints).toHaveLength(1);
    });
  });
});
