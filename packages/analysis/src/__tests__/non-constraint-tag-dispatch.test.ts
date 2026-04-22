/**
 * End-to-end dispatch tests for non-constraint tags and unknown tags through
 * `buildFormSpecAnalysisFileSnapshot`.
 *
 * Guards the invariant that the deleted `compiler-signatures.test.ts` and
 * `tag-capability-applicability.test.ts` previously covered: non-constraint
 * tags must pass through the snapshot pipeline without emitting diagnostics
 * regardless of field type. Also covers unknown-tag silent-ignore behavior
 * and the nullable-intermediate path traversal path.
 *
 * @see packages/analysis/src/tag-registry.ts — tag category and placement definitions
 * @see packages/analysis/src/file-snapshots.ts — buildTagDiagnostics loop
 */

import { describe, expect, it } from "vitest";
import { buildFormSpecAnalysisFileSnapshot } from "../internal.js";
import { createProgram } from "./helpers.js";

// ---------------------------------------------------------------------------
// Non-constraint tag dispatch: zero diagnostics across field type shapes
// ---------------------------------------------------------------------------

/**
 * Non-constraint tags that are valid on field-level placements
 * (class-field, interface-field, type-alias-field, variable, etc.).
 *
 * These tags have `capabilities: []` — the snapshot consumer must not emit
 * TYPE_MISMATCH or INVALID_TAG_PLACEMENT for them on any valid field type.
 *
 * `@discriminator` is intentionally excluded: it has type-placement-only
 * semantics (`TYPE_PLACEMENTS`) and its own dedicated diagnostics path.
 * `@group`, `@showWhen`, `@hideWhen`, `@enableWhen`, `@disableWhen` are
 * included — they are valid on fields and must produce zero diagnostics.
 */
const NON_CONSTRAINT_FIELD_TAGS: ReadonlyArray<{
  readonly tagName: string;
  /** Tag argument text, omit for no-argument tags like @deprecated. */
  readonly tagArg?: string;
}> = [
  // annotation tags
  { tagName: "displayName", tagArg: '"My Field"' },
  { tagName: "description", tagArg: "A description" },
  { tagName: "format", tagArg: "email" },
  { tagName: "placeholder", tagArg: "Enter a value" },
  { tagName: "order", tagArg: "1" },
  { tagName: "apiName", tagArg: "my_field" },
  // structure tags
  { tagName: "group", tagArg: "contact" },
  { tagName: "showWhen", tagArg: 'status === "active"' },
  { tagName: "hideWhen", tagArg: 'status === "hidden"' },
  { tagName: "enableWhen", tagArg: 'tier === "pro"' },
  { tagName: "disableWhen", tagArg: 'locked === true' },
  // ecosystem tags
  { tagName: "defaultValue", tagArg: '"default"' },
  { tagName: "deprecated" },
  { tagName: "example", tagArg: '"example"' },
  { tagName: "remarks", tagArg: "Some remarks." },
  { tagName: "see", tagArg: "https://example.com" },
];

/**
 * Field type shapes covering the cross product required by the migration
 * acceptance criteria: string, number, boolean, string[], string | null,
 * optional string (via `?` modifier which TypeScript expands to string | undefined).
 */
const FIELD_TYPE_SHAPES: ReadonlyArray<{
  readonly label: string;
  /** TypeScript type expression for the field declaration. */
  readonly typeExpr: string;
  /** When true, use the `?` optional modifier instead of `!`. */
  readonly optional?: boolean;
}> = [
  { label: "string", typeExpr: "string" },
  { label: "number", typeExpr: "number" },
  { label: "boolean", typeExpr: "boolean" },
  { label: "string[]", typeExpr: "string[]" },
  { label: "string | null", typeExpr: "string | null" },
  { label: "optional string", typeExpr: "string", optional: true },
];

/**
 * Generates an in-memory TypeScript source that places the given tag on a
 * class field of the given type.
 */
function generateNonConstraintSource(
  tagName: string,
  tagArg: string | undefined,
  typeExpr: string,
  optional: boolean
): string {
  const tagLine = tagArg !== undefined ? `@${tagName} ${tagArg}` : `@${tagName}`;
  const fieldDecl = optional
    ? `  /** ${tagLine} */\n  field?: ${typeExpr};`
    : `  /** ${tagLine} */\n  field!: ${typeExpr};`;
  return `class TestClass {\n${fieldDecl}\n}\n`;
}

describe("non-constraint tag dispatch", () => {
  describe("emits zero diagnostics for all non-constraint field tags across all field type shapes", () => {
    it.each(
      NON_CONSTRAINT_FIELD_TAGS.flatMap((tag) =>
        FIELD_TYPE_SHAPES.map((shape) => ({
          label: `@${tag.tagName} on ${shape.label}`,
          tagName: tag.tagName,
          tagArg: tag.tagArg,
          typeExpr: shape.typeExpr,
          optional: shape.optional ?? false,
        }))
      )
    )("$label", ({ tagName, tagArg, typeExpr, optional }) => {
      const source = generateNonConstraintSource(tagName, tagArg, typeExpr, optional);
      const { checker, sourceFile } = createProgram(source);
      const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

      expect(snapshot.diagnostics).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Unknown-tag silent-ignore behavior
  // -------------------------------------------------------------------------

  describe("unknown tag behavior", () => {
    it("silently ignores an unknown tag with an argument — emits no diagnostics", () => {
      // Both consumers (build and snapshot) skip tags that are not in the
      // registry. `@doesNotExist` is not a registered FormSpec tag, so no
      // diagnostic should be emitted regardless of the field type.
      const source = `
        class TestClass {
          /** @doesNotExist "foo" */
          field!: string;
        }
      `;
      const { checker, sourceFile } = createProgram(source);
      const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

      expect(snapshot.diagnostics).toHaveLength(0);
    });

    it("silently ignores multiple unknown tags on a field with a valid constraint", () => {
      // Verifies that unknown tags don't interfere with diagnostics from
      // recognized tags: the valid @minimum 0 should still be processed
      // correctly while @unknownTagA and @unknownTagB are silently dropped.
      const source = `
        class TestClass {
          /**
           * @unknownTagA bar
           * @minimum 0
           * @unknownTagB baz
           */
          field!: number;
        }
      `;
      const { checker, sourceFile } = createProgram(source);
      const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

      // Zero diagnostics: @minimum 0 on number is valid, unknowns are ignored.
      expect(snapshot.diagnostics).toHaveLength(0);
    });

    it("silently ignores unknown tags on incompatible types — does not emit spurious TYPE_MISMATCH", () => {
      // Unknown tags have no registered capabilities, so they must not trigger
      // the Role-B capability guard on incompatible field types. This test
      // guards against a regression where an unrecognized tag might accidentally
      // be routed through the constraint validation pipeline.
      const source = `
        class TestClass {
          /** @doesNotExist 42 */
          field!: string;
        }
      `;
      const { checker, sourceFile } = createProgram(source);
      const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

      expect(snapshot.diagnostics).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Nullable-intermediate path-target traversal
  // -------------------------------------------------------------------------

  describe("nullable-intermediate path target", () => {
    it("emits TYPE_MISMATCH with 'cannot be traversed' for path traversal through a nullable primitive intermediate", () => {
      // The path `:money.amount` traverses:
      //   field: { money: Money | null }
      //   1. money → Money | null → stripNullishUnion → Money (= number)
      //   2. amount → number has no properties → resolvePathTargetType returns
      //      { kind: "unresolvable", type: number }
      //
      // Expected: TYPE_MISMATCH with "cannot be traversed" message — NOT a
      // capability TYPE_MISMATCH (wrong type for @minimum). The distinction
      // matters: the unresolvable path emits a traversal-failure message while
      // a capability mismatch emits "only valid on numeric-comparable targets".
      //
      // §5 Phase 5C: this path now goes through the Role-B path-target check
      // in buildTagDiagnostics (file-snapshots.ts) instead of the retired
      // synthetic checker.
      const source = `
        type Money = number;

        class Checkout {
          /** @minimum :money.amount 0 */
          discount!: { money: Money | null };
        }
      `;
      const { checker, sourceFile } = createProgram(source);
      const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

      const diagnostic = snapshot.diagnostics.find((d) => d.code === "TYPE_MISMATCH");
      expect(diagnostic).toBeDefined();
      expect(diagnostic?.message).toContain("cannot be traversed");
      // Should NOT be a capability TYPE_MISMATCH about the field type itself.
      expect(diagnostic?.message).not.toContain("only valid on");
      expect(diagnostic?.data["tagName"]).toBe("minimum");
      expect(diagnostic?.data["targetKind"]).toBe("path");
    });

    it("does NOT emit unresolvable for a nullable object intermediate — traversal continues after null strip", () => {
      // When the intermediate type is an object union with null (e.g.
      // `{ amount: number } | null`), stripNullishUnion should reduce it to the
      // object type, allowing traversal to continue normally.
      //
      // Expected: zero diagnostics — @minimum 0 on number is valid after
      // stripping the null wrapper off the intermediate Money type.
      const source = `
        interface Money {
          amount: number;
        }

        class Checkout {
          /** @minimum :money.amount 0 */
          discount!: { money: Money | null };
        }
      `;
      const { checker, sourceFile } = createProgram(source);
      const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

      expect(snapshot.diagnostics).toHaveLength(0);
    });
  });
});
