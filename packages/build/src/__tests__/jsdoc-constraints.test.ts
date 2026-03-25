/**
 * Legacy constraint extraction tests have been removed.
 *
 * `extractJSDocConstraints` and `extractJSDocFieldMetadata` were deleted as
 * part of the decorator-era cleanup. Equivalent coverage exists in:
 * - ir-jsdoc-constraints.test.ts (tests extractJSDocConstraintNodes / extractJSDocAnnotationNodes)
 */

import { describe, it } from "vitest";

describe("legacy jsdoc-constraints (removed)", () => {
  it.skip("extractJSDocConstraints and extractJSDocFieldMetadata have been removed — see ir-jsdoc-constraints.test.ts", () => {
    // These legacy functions were deleted in the decorator-era cleanup.
  });
});
