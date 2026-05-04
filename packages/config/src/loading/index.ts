/**
 * Loading-side responsibility area for @formspec/config.
 *
 * Concerns: where config bytes come from, how the TS module is evaluated,
 * path resolution, and package-override resolution. The `FileSystem` adapter
 * pattern lives here, as does the lazy Node-style filesystem implementation.
 *
 * `resolve.ts` lives here because its core operation is path manipulation
 * against package overrides: input is a file path, and output is a config
 * shape derived by walking the override map. It produces an
 * application-shaped result, but the operation itself is loader-domain.
 *
 * Internal barrel for loading-side exports.
 */
export type { FileSystem } from "./file-system.js";
export {
  loadFormSpecConfig,
  type LoadConfigFoundResult,
  type LoadConfigNotFoundResult,
  type LoadConfigOptions,
  type LoadConfigResult,
} from "./loader.js";
// eslint-disable-next-line @typescript-eslint/no-deprecated -- backward-compatible re-export
export { loadConfig } from "./loader.js";
export { resolveConfigForFile, type ResolvedFormSpecConfig } from "./resolve.js";
