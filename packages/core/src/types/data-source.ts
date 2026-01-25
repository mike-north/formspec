/**
 * Registry for dynamic data sources.
 *
 * Extend this interface via module augmentation to register your data sources:
 *
 * @example
 * ```typescript
 * declare module "@formspec/core" {
 *   interface DataSourceRegistry {
 *     countries: { id: string; code: string; name: string };
 *     templates: { id: string; name: string; category: string };
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DataSourceRegistry {
  // Extended by consumers via module augmentation
}

/**
 * A single option returned by a data source resolver.
 *
 * @typeParam T - The data type for additional option metadata
 */
export interface DataSourceOption<T = unknown> {
  /** The value stored when this option is selected */
  readonly value: string;

  /** The display label for this option */
  readonly label: string;

  /** Optional additional data associated with this option */
  readonly data?: T;
}

/**
 * Response from a data source resolver function.
 *
 * @typeParam T - The data type for option metadata
 */
export interface FetchOptionsResponse<T = unknown> {
  /** The available options */
  readonly options: readonly DataSourceOption<T>[];

  /** Validity state of the fetch operation */
  readonly validity: "valid" | "invalid" | "unknown";

  /** Optional message (e.g., error description) */
  readonly message?: string;
}

/**
 * Gets the value type for a registered data source.
 *
 * If the source has an `id` property, that becomes the value type.
 * Otherwise, defaults to `string`.
 */
export type DataSourceValueType<Source extends string> =
  Source extends keyof DataSourceRegistry
    ? DataSourceRegistry[Source] extends { id: infer ID }
      ? ID
      : string
    : string;
