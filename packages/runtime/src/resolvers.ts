/**
 * Resolver helpers for dynamic FormSpec data.
 *
 * Resolvers are functions that fetch options for dynamic enum fields
 * at runtime. This module provides type-safe utilities for defining
 * and using resolvers.
 */

import type {
  DataSourceRegistry,
  FetchOptionsResponse,
  FormElement,
  FormSpec,
  DynamicEnumField,
  Group,
  Conditional,
  LoggerLike,
} from "@formspec/core";
import { noopLogger } from "@formspec/core";

/**
 * A resolver function that fetches options for a data source.
 *
 * @typeParam Source - The data source key from DataSourceRegistry
 * @typeParam T - The data type for options (from DataSourceRegistry)
 *
 * @public
 */
export type Resolver<Source extends keyof DataSourceRegistry, T = DataSourceRegistry[Source]> = (
  params?: Record<string, unknown>
) => Promise<FetchOptionsResponse<T>>;

/**
 * Extracts dynamic data-source names referenced by a single FormSpec element.
 *
 * @public
 */
export type ExtractDynamicSources<E> =
  E extends DynamicEnumField<string, infer S>
    ? S
    : E extends Group<infer Elements>
      ? ExtractDynamicSourcesFromArray<Elements>
      : E extends Conditional<string, unknown, infer Elements>
        ? ExtractDynamicSourcesFromArray<Elements>
        : never;

/**
 * Extracts dynamic data-source names referenced anywhere in an element array.
 *
 * @public
 */
export type ExtractDynamicSourcesFromArray<Elements> = Elements extends readonly [
  infer First,
  ...infer Rest,
]
  ? ExtractDynamicSources<First> | ExtractDynamicSourcesFromArray<Rest>
  : never;

/**
 * Derives the resolver source-key union for a FormSpec element array.
 *
 * @public
 */
export type ResolverSourcesForForm<E extends readonly FormElement[]> =
  ExtractDynamicSourcesFromArray<E> & string;

/**
 * Map of resolver functions for a form's dynamic data sources.
 *
 * @public
 */
export type ResolverMap<Sources extends string> = {
  [S in Sources]: S extends keyof DataSourceRegistry
    ? Resolver<S>
    : (params?: Record<string, unknown>) => Promise<FetchOptionsResponse>;
};

/**
 * A resolver registry that provides type-safe access to resolvers.
 *
 * @public
 */
export interface ResolverRegistry<Sources extends string> {
  /**
   * Gets a resolver by data source name.
   */
  get<S extends Sources>(
    source: S
  ): S extends keyof DataSourceRegistry
    ? Resolver<S>
    : (params?: Record<string, unknown>) => Promise<FetchOptionsResponse>;

  /**
   * Checks if a resolver exists for a data source.
   */
  has(source: string): boolean;

  /**
   * Gets all registered data source names.
   */
  sources(): Sources[];
}

/**
 * Extracts all dynamic enum field sources from form elements.
 */
function extractSources(elements: readonly FormElement[]): Set<string> {
  const sources = new Set<string>();

  function visit(el: FormElement): void {
    if (el._type === "field" && el._field === "dynamic_enum") {
      // After checking _field, we know this is a DynamicEnumField
      const dynamicField: DynamicEnumField<string, string> = el;
      sources.add(dynamicField.source);
    } else if (el._type === "group") {
      (el as Group<readonly FormElement[]>).elements.forEach(visit);
    } else if (el._type === "conditional") {
      (el as Conditional<string, unknown, readonly FormElement[]>).elements.forEach(visit);
    }
  }

  elements.forEach(visit);
  return sources;
}

/**
 * Options for `defineResolvers`.
 *
 * @public
 */
export interface DefineResolversOptions {
  /**
   * Optional logger for diagnostic output. Defaults to a no-op logger so
   * existing callers produce no output.
   */
  readonly logger?: LoggerLike | undefined;
}

/**
 * Defines resolvers for a form's dynamic data sources.
 *
 * This function provides type-safe resolver definitions that match
 * the form's dynamic enum fields.
 *
 * @example
 * ```typescript
 * declare module "@formspec/core" {
 *   interface DataSourceRegistry {
 *     countries: { id: string; code: string; name: string };
 *   }
 * }
 *
 * const form = formspec(
 *   field.dynamicEnum("country", "countries", { label: "Country" }),
 * );
 *
 * const resolvers = defineResolvers(form, {
 *   countries: async () => ({
 *     options: [
 *       { value: "us", label: "United States", data: { id: "us", code: "US", name: "United States" } },
 *       { value: "ca", label: "Canada", data: { id: "ca", code: "CA", name: "Canada" } },
 *     ],
 *     validity: "valid",
 *   }),
 * });
 *
 * // Use the resolver
 * const result = await resolvers.get("countries")();
 * ```
 *
 * @param form - The FormSpec containing dynamic enum fields
 * @param resolvers - Map of resolver functions for each data source
 * @param options - Optional options including a logger
 * @returns A ResolverRegistry for type-safe access to resolvers
 *
 * @public
 */
export function defineResolvers<
  E extends readonly FormElement[],
  Sources extends string = ResolverSourcesForForm<E>,
>(
  form: FormSpec<E>,
  resolvers: ResolverMap<Sources>,
  options?: DefineResolversOptions
): ResolverRegistry<Sources> {
  const logger = (options?.logger ?? noopLogger).child({ stage: "runtime" });
  const sourceSet = extractSources(form.elements);
  const resolverMap = new Map<string, Resolver<keyof DataSourceRegistry>>(
    Object.entries(resolvers) as [string, Resolver<keyof DataSourceRegistry>][]
  );

  // Validate that all sources have resolvers
  for (const source of sourceSet) {
    if (!resolverMap.has(source)) {
      console.warn(`Missing resolver for data source: ${source}`);
    }
  }

  return {
    get<S extends Sources>(source: S) {
      const resolver = resolverMap.get(source);
      if (resolver === undefined) {
        const err = new Error(`No resolver found for data source: ${source}`);
        logger.error(err.message, { source });
        throw err;
      }
      logger.debug("resolver requested", { source });
      return resolver as S extends keyof DataSourceRegistry
        ? Resolver<S>
        : (params?: Record<string, unknown>) => Promise<FetchOptionsResponse>;
    },

    has(source: string): boolean {
      return resolverMap.has(source);
    },

    sources(): Sources[] {
      return Array.from(resolverMap.keys()) as Sources[];
    },
  };
}
