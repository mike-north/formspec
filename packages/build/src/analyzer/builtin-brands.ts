/**
 * Re-exports {@link isIntegerBrandedType} from the shared
 * `@formspec/analysis` implementation.
 *
 * The detection logic was extracted to `@formspec/analysis` (Phase 4A of the
 * synthetic-checker retirement) so that both the build consumer
 * (`tsdoc-parser.ts`) and the snapshot consumer (`file-snapshots.ts`) can use
 * the same bypass check.
 *
 * Callers inside `@formspec/build` continue to import from this module — no
 * import-site changes required in `class-analyzer.ts` or `tsdoc-parser.ts`.
 *
 * @internal
 */
export { isIntegerBrandedType } from "@formspec/analysis/internal";
