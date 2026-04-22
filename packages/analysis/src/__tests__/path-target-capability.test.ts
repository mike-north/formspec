/**
 * Phase 5C — path-target Role-B capability coverage.
 *
 * Slice A of Phase 5 wired a Role-B capability guard into the snapshot
 * consumer for direct-field tags. Slice C extends that guard to cover
 * path-targeted tags. Before the synthetic-program batch was retired,
 * path-target validation flowed through `checkSyntheticTagApplicationsDetailed`;
 * these tests exercise the new Role-B path-target code in
 * `file-snapshots.ts:buildTagDiagnostics` and pin the three intended outcomes:
 *
 *   1. A valid numeric path-target (e.g. `@minimum :amount 0` on an object
 *      whose `amount` property is `number`) produces no diagnostic.
 *   2. An invalid string-only path-target (e.g. `@pattern :amount` where the
 *      target property is `number`) produces a `TYPE_MISMATCH` Role-B reject.
 *   3. A bad argument on a valid path-target (e.g. `@minimum :amount "hello"`
 *      where the target property is `number`) produces an
 *      `INVALID_TAG_ARGUMENT` Role-C reject (Role B wins over Role C only when
 *      the subject type is wrong; here the type is right but the argument is
 *      malformed, so Role C fires).
 *
 * @see docs/refactors/synthetic-checker-retirement.md §4 Phase 5C
 */

import { describe, expect, it } from "vitest";
import { buildFormSpecAnalysisFileSnapshot } from "../internal.js";
import { createProgram } from "./helpers.js";

function collectDiagnostics(source: string) {
  const { checker, sourceFile } = createProgram(source, "/virtual/path-target-capability.ts");
  const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
  return snapshot.diagnostics;
}

describe("path-target Role-B capability (snapshot consumer)", () => {
  it("accepts a valid numeric path-target — `@minimum :amount 0` on `{ amount: number }`", () => {
    const source = `
      interface Money {
        amount: number;
        currency: string;
      }
      class Foo {
        /** @minimum :amount 0 */
        price!: Money;
      }
    `;
    const diagnostics = collectDiagnostics(source);
    // No diagnostics: `@minimum` requires `numeric-comparable`, the resolved
    // path target type is `number` which satisfies that, and `0` is a valid
    // numeric argument.
    expect(diagnostics).toEqual([]);
  });

  it("rejects a string-only constraint on a numeric path-target — `@pattern :amount ^...$` on `{ amount: number }`", () => {
    const source = `
      interface Money {
        amount: number;
        currency: string;
      }
      class Foo {
        /** @pattern :amount ^[A-Z]+$ */
        price!: Money;
      }
    `;
    const diagnostics = collectDiagnostics(source);
    // `@pattern` requires `string-like`; the path-target terminal type is
    // `number`, which does not satisfy that capability. Role B must reject
    // with TYPE_MISMATCH.
    const relevant = diagnostics.filter((d) => d.data["tagName"] === "pattern");
    expect(relevant).toHaveLength(1);
    expect(relevant[0]?.code).toBe("TYPE_MISMATCH");
    expect(relevant[0]?.message).toContain("pattern");
    // The diagnostic should reference the path target, not the whole field.
    expect(relevant[0]?.data["targetKind"]).toBe("path");
    // `targetText` is the raw text without the leading colon (see
    // `ParsedCommentTargetSpecifier.rawText` in comment-syntax.ts).
    expect(relevant[0]?.data["targetText"]).toBe("amount");
  });

  it('rejects an invalid argument on a valid path-target — `@minimum :amount "hello"` on `{ amount: number }`', () => {
    const source = `
      interface Money {
        amount: number;
        currency: string;
      }
      class Foo {
        /** @minimum :amount "hello" */
        price!: Money;
      }
    `;
    const diagnostics = collectDiagnostics(source);
    // Role B passes (number satisfies numeric-comparable). Role C rejects
    // because `"hello"` is not a valid numeric argument.
    const relevant = diagnostics.filter((d) => d.data["tagName"] === "minimum");
    expect(relevant).toHaveLength(1);
    expect(relevant[0]?.code).toBe("INVALID_TAG_ARGUMENT");
  });

  // Panel Fix #6: UNKNOWN_PATH_TARGET — path references a property that does not
  // exist on the declared subject type.
  it("emits UNKNOWN_PATH_TARGET when the path references a missing property — `@minimum :missing 0` on `{ amount: number }`", () => {
    const source = `
      interface Money {
        amount: number;
        currency: string;
      }
      class Foo {
        /** @minimum :missing 0 */
        price!: Money;
      }
    `;
    const diagnostics = collectDiagnostics(source);
    const relevant = diagnostics.filter((d) => d.data["tagName"] === "minimum");
    expect(relevant).toHaveLength(1);
    expect(relevant[0]?.code).toBe("UNKNOWN_PATH_TARGET");
    // The diagnostic should carry the missing segment name.
    expect(relevant[0]?.data["missingPathSegment"]).toBe("missing");
    expect(relevant[0]?.data["targetKind"]).toBe("path");
    expect(relevant[0]?.data["targetText"]).toBe("missing");
  });

  // Slice C Copilot regression: before Phase 5C the synthetic lowering would
  // reject a malformed path target (one whose text doesn't parse as valid
  // dot-separated identifiers, e.g. `:invalid-path-syntax`). After the
  // synthetic checker was retired the snapshot consumer silently accepted such
  // targets without emitting any diagnostic. This test pins the corrected
  // behaviour: INVALID_PATH_TARGET must be emitted.
  it("emits INVALID_PATH_TARGET for a malformed path target — `@minimum :invalid-path-syntax 0` (non-identifier segment)", () => {
    const source = `
      interface Money {
        amount: number;
        currency: string;
      }
      class Foo {
        /** @minimum :invalid-path-syntax 0 */
        price!: Money;
      }
    `;
    const diagnostics = collectDiagnostics(source);
    // The path text "invalid-path-syntax" fails the identifier-segment regex
    // inside extractPathTarget(), so tag.target.path is null. Before the fix
    // this escaped validation silently; now it must emit INVALID_PATH_TARGET.
    const relevant = diagnostics.filter((d) => d.data["tagName"] === "minimum");
    expect(relevant).toHaveLength(1);
    expect(relevant[0]?.code).toBe("INVALID_PATH_TARGET");
    expect(relevant[0]?.data["targetKind"]).toBe("path");
    expect(relevant[0]?.data["targetText"]).toBe("invalid-path-syntax");
  });

  // Panel Fix #6: TYPE_MISMATCH from an unresolvable intermediate — path traverses
  // through a non-object terminal type (e.g. `amount.nested` where `amount` is
  // `number`, so `.nested` is un-traversable).
  it("emits TYPE_MISMATCH when the path targets an unresolvable intermediate — `@minimum :amount.nested 0` on `{ amount: number }`", () => {
    const source = `
      interface Money {
        amount: number;
        currency: string;
      }
      class Foo {
        /** @minimum :amount.nested 0 */
        price!: Money;
      }
    `;
    const diagnostics = collectDiagnostics(source);
    const relevant = diagnostics.filter((d) => d.data["tagName"] === "minimum");
    expect(relevant).toHaveLength(1);
    // resolvePathTargetType returns { kind: "unresolvable" } when an
    // intermediate segment targets a primitive (non-traversable) type. The
    // snapshot consumer maps that to TYPE_MISMATCH (see file-snapshots.ts
    // ~lines 1438-1443).
    expect(relevant[0]?.code).toBe("TYPE_MISMATCH");
    expect(relevant[0]?.data["targetKind"]).toBe("path");
    expect(relevant[0]?.data["targetText"]).toBe("amount.nested");
  });
});
