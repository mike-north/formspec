/**
 * Re-exports {@link _isIntegerBrandedType} from the shared
 * `@formspec/analysis` implementation.
 *
 * The detection logic lives in `@formspec/analysis` so that both the build
 * consumer (`tsdoc-parser.ts`) and the snapshot consumer (`file-snapshots.ts`)
 * can use the same branded-type check.
 *
 * Callers inside `@formspec/build` continue to import from this module — no
 * import-site changes required in `class-analyzer.ts` or `tsdoc-parser.ts`.
 *
 * @internal
 */
export { _isIntegerBrandedType } from "@formspec/analysis/internal";
