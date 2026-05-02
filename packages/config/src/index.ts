/**
 * \@formspec/config
 *
 * Unified configuration for FormSpec: schemas, extensions, serialization,
 * metadata policy, pipeline settings, and the TypeScript
 * `formspec.config.ts` loading convention. This is the single entry point
 * authors and downstream tools use to describe how a project consumes
 * FormSpec.
 *
 * DSL-policy validation logic (the policy that narrows which FormSpec
 * authoring features a project may use) is implemented in the private
 * `@formspec/dsl-policy` workspace package and re-exported here as the public
 * compatibility surface for consumers.
 *
 * "Constraint" is overloaded in FormSpec; the project distinguishes data
 * constraints from DSL policy:
 *
 * - Data constraints narrow valid values of a field (TSDoc tags such as
 *   `@minimum`, IR `ConstraintNode`, JSON Schema validation keywords).
 * - DSL policy narrows which FormSpec features a project may author, using
 *   `FieldTypeConstraints`, `LayoutConstraints`, and related config shapes.
 *
 * @example
 * ```ts
 * import { loadFormSpecConfig, validateFormSpecElements } from '@formspec/config';
 * import { formspec, field } from '@formspec/dsl';
 *
 * const result = await loadFormSpecConfig();
 * const config = result.found ? result.config.constraints : undefined;
 *
 * const form = formspec(
 *   field.text("name"),
 *   field.dynamicEnum("country", "countries"),
 * );
 *
 * const validation = validateFormSpecElements(form.elements, { constraints: config });
 *
 * if (!validation.valid) {
 *   console.error('Validation failed:', validation.issues);
 * }
 * ```
 *
 * @packageDocumentation
 */

// DSL-policy facade, defaults, validators, config factory, and types.
export * from "./application/index.js";

export type {
  AnyField,
  ArrayField,
  BooleanField,
  Conditional,
  DynamicEnumField,
  DynamicSchemaField,
  EnumOption,
  EnumOptionValue,
  FormElement,
  FormSpec,
  Group,
  NumberField,
  ObjectField,
  StaticEnumField,
  TextField,
} from "@formspec/core";

// Logger contract (re-exported so LoadConfigOptions.logger resolves in the API surface)
export type { LoggerLike } from "@formspec/core";

// Config loading.
export {
  loadFormSpecConfig,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- backward-compatible re-export
  loadConfig,
  type FileSystem,
  type LoadConfigOptions,
  type LoadConfigResult,
  type LoadConfigFoundResult,
  type LoadConfigNotFoundResult,
} from "./loading/index.js";

// Config resolution is implemented in the loading-side context but remains
// part of the package-root public surface for compatibility.
export { resolveConfigForFile, type ResolvedFormSpecConfig } from "./loading/index.js";
