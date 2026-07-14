import { describe, it, expect, vi, afterEach } from "vitest";
import { defineResolvers } from "../src/index.js";
import { formspec, field, group, when, is } from "@formspec/dsl";
import { makeCapturingLogger } from "./helpers.js";

// Note: In real usage, you would augment DataSourceRegistry.
// For tests, we work with the generic types.

describe("defineResolvers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create a resolver registry", () => {
    const form = formspec(field.dynamicEnum("country", "countries", { label: "Country" }));

    const resolvers = defineResolvers(form, {
      countries: async () => {
        await Promise.resolve(); // Needed for async interface compliance
        return {
          options: [
            { value: "us", label: "United States" },
            { value: "ca", label: "Canada" },
          ],
          validity: "valid" as const,
        };
      },
    });

    expect(resolvers.has("countries")).toBe(true);
    expect(resolvers.sources()).toEqual(["countries"]);
  });

  it("should fetch options from resolver", async () => {
    const form = formspec(field.dynamicEnum("country", "countries"));

    const resolvers = defineResolvers(form, {
      countries: async () => {
        await Promise.resolve(); // Needed for async interface compliance
        return {
          options: [{ value: "us", label: "United States" }],
          validity: "valid" as const,
        };
      },
    });

    const result = await resolvers.get("countries")();

    expect(result.validity).toBe("valid");
    expect(result.options).toHaveLength(1);
    expect(result.options[0]?.value).toBe("us");
  });

  it("should extract sources from nested groups", () => {
    const form = formspec(
      group(
        "Location",
        field.dynamicEnum("country", "countries"),
        field.dynamicEnum("city", "cities")
      )
    );

    const resolvers = defineResolvers(form, {
      countries: async () => {
        await Promise.resolve(); // Needed for async interface compliance
        return { options: [], validity: "valid" as const };
      },
      cities: async () => {
        await Promise.resolve(); // Needed for async interface compliance
        return { options: [], validity: "valid" as const };
      },
    });

    expect(resolvers.sources().sort()).toEqual(["cities", "countries"]);
  });

  it("should extract sources from conditionals", () => {
    const form = formspec(
      field.enum("type", ["a", "b"] as const),
      when(is("type", "a"), field.dynamicEnum("extra", "extras"))
    );

    const resolvers = defineResolvers(form, {
      extras: async () => {
        await Promise.resolve(); // Needed for async interface compliance
        return { options: [], validity: "valid" as const };
      },
    });

    expect(resolvers.has("extras")).toBe(true);
  });

  it("should throw when getting unknown resolver", () => {
    const form = formspec(field.dynamicEnum("country", "countries"));

    const resolvers = defineResolvers(form, {
      countries: async () => {
        await Promise.resolve(); // Needed for async interface compliance
        return { options: [], validity: "valid" as const };
      },
    });

    expect(() => resolvers.get("unknown" as "countries")).toThrow(
      "No resolver found for data source: unknown"
    );
  });

  // Regression tests for issue #516: source extraction must recurse into
  // field.array() items and field.object() properties, not only groups and
  // conditionals. A dynamic enum nested in an array or object was previously
  // invisible to `extractSources`, so `defineResolvers` neither required a
  // resolver at the type level nor emitted the construction-time
  // "Missing resolver" warning. The warning is the observable signal that a
  // source was extracted (`has`/`sources` only reflect the passed-in resolver
  // map), so these tests assert on it directly via an injected capturing
  // logger (see issue #540: the warning is routed through the logger, not
  // `console.warn` — logger-routing coverage lives in logger.test.ts).
  it("should warn for a dynamic enum nested inside an array (#516)", () => {
    const { logger, records } = makeCapturingLogger();
    const form = formspec(field.array("lineItems", field.dynamicEnum("product", "products")));

    // @ts-expect-error resolver for the nested "products" source is intentionally omitted
    defineResolvers(form, {}, { logger });

    expect(records).toContainEqual(
      expect.objectContaining({ level: "warn", msg: "Missing resolver for data source: products" })
    );
  });

  it("should warn for a dynamic enum nested inside an object (#516)", () => {
    const { logger, records } = makeCapturingLogger();
    const form = formspec(field.object("shipping", field.dynamicEnum("country", "countries")));

    // @ts-expect-error resolver for the nested "countries" source is intentionally omitted
    defineResolvers(form, {}, { logger });

    expect(records).toContainEqual(
      expect.objectContaining({ level: "warn", msg: "Missing resolver for data source: countries" })
    );
  });

  it("should warn for a dynamic enum nested inside an object-inside-array (#516)", () => {
    const { logger, records } = makeCapturingLogger();
    const form = formspec(
      field.array("lineItems", field.object("detail", field.dynamicEnum("product", "products")))
    );

    // @ts-expect-error resolver for the deeply-nested "products" source is intentionally omitted
    defineResolvers(form, {}, { logger });

    expect(records).toContainEqual(
      expect.objectContaining({ level: "warn", msg: "Missing resolver for data source: products" })
    );
  });

  it("should warn for a dynamic enum nested through arrays, objects, groups, and conditionals combined (#516)", () => {
    const { logger, records } = makeCapturingLogger();
    const form = formspec(
      field.enum("type", ["a", "b"] as const),
      group(
        "Order",
        when(
          is("type", "a"),
          field.array("lineItems", field.object("detail", field.dynamicEnum("product", "products")))
        )
      )
    );

    // @ts-expect-error resolver for the deeply-nested "products" source is intentionally omitted
    defineResolvers(form, {}, { logger });

    expect(records).toContainEqual(
      expect.objectContaining({ level: "warn", msg: "Missing resolver for data source: products" })
    );
  });

  it("should not warn when a nested source's resolver is provided (#516)", () => {
    const { logger, records } = makeCapturingLogger();
    const form = formspec(field.array("lineItems", field.dynamicEnum("product", "products")));

    defineResolvers(
      form,
      {
        products: async () => {
          await Promise.resolve(); // Needed for async interface compliance
          return { options: [], validity: "valid" as const };
        },
      },
      { logger }
    );

    expect(records.some((r) => r.level === "warn")).toBe(false);
  });

  it("should pass params to resolver", async () => {
    const form = formspec(field.dynamicEnum("product", "products", { params: ["merchantId"] }));

    let receivedParams: Record<string, unknown> | undefined;

    const resolvers = defineResolvers(form, {
      products: async (params) => {
        await Promise.resolve(); // Needed for async interface compliance
        receivedParams = params;
        return { options: [], validity: "valid" as const };
      },
    });

    await resolvers.get("products")({ merchantId: "123" });

    expect(receivedParams).toEqual({ merchantId: "123" });
  });

  // Regression tests for issue #540: `sources()` was typed as `Sources[]`
  // (the form's *required* data sources) but its implementation returned
  // `resolverMap.keys()` (the *registered* resolver names). The two sets
  // differ in both directions: a required source with no resolver was absent
  // from the old result, and a registered resolver beyond what the form
  // requires was present. `sources()` must match its documented/typed
  // meaning: the form's required set.
  describe("sources() contract (#540)", () => {
    it("includes a required source even when no resolver was registered for it", () => {
      const form = formspec(field.dynamicEnum("country", "countries"));

      // @ts-expect-error resolver for "countries" is intentionally omitted
      const resolvers = defineResolvers(form, {});

      expect(resolvers.sources()).toEqual(["countries"]);
      expect(resolvers.has("countries")).toBe(false);
    });

    it("excludes a resolver registered beyond what the form requires", () => {
      const form = formspec(field.dynamicEnum("country", "countries"));

      // `Sources` is explicitly widened beyond the form-derived default so
      // "extra" can be registered without an unsafe cast — this is exactly
      // the "registered a resolver the form doesn't require" scenario.
      const resolvers = defineResolvers<typeof form.elements, "countries" | "extra">(form, {
        countries: async () => {
          await Promise.resolve(); // Needed for async interface compliance
          return { options: [], validity: "valid" as const };
        },
        extra: async () => {
          await Promise.resolve(); // Needed for async interface compliance
          return { options: [], validity: "valid" as const };
        },
      });

      expect(resolvers.sources()).toEqual(["countries"]);
      expect(resolvers.has("extra")).toBe(true);
    });
  });
});
