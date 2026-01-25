import { describe, it, expect } from "vitest";
import { defineResolvers } from "../index.js";
import { formspec, field, group, when } from "@formspec/dsl";

// Note: In real usage, you would augment DataSourceRegistry.
// For tests, we work with the generic types.

describe("defineResolvers", () => {
  it("should create a resolver registry", () => {
    const form = formspec(
      field.dynamicEnum("country", "countries", { label: "Country" }),
    );

    const resolvers = defineResolvers(form, {
      countries: async () => ({
        options: [
          { value: "us", label: "United States" },
          { value: "ca", label: "Canada" },
        ],
        validity: "valid" as const,
      }),
    });

    expect(resolvers.has("countries")).toBe(true);
    expect(resolvers.sources()).toEqual(["countries"]);
  });

  it("should fetch options from resolver", async () => {
    const form = formspec(
      field.dynamicEnum("country", "countries"),
    );

    const resolvers = defineResolvers(form, {
      countries: async () => ({
        options: [
          { value: "us", label: "United States" },
        ],
        validity: "valid" as const,
      }),
    });

    const result = await resolvers.get("countries")();

    expect(result.validity).toBe("valid");
    expect(result.options).toHaveLength(1);
    expect(result.options[0]?.value).toBe("us");
  });

  it("should extract sources from nested groups", () => {
    const form = formspec(
      group("Location",
        field.dynamicEnum("country", "countries"),
        field.dynamicEnum("city", "cities"),
      ),
    );

    const resolvers = defineResolvers(form, {
      countries: async () => ({ options: [], validity: "valid" as const }),
      cities: async () => ({ options: [], validity: "valid" as const }),
    });

    expect(resolvers.sources().sort()).toEqual(["cities", "countries"]);
  });

  it("should extract sources from conditionals", () => {
    const form = formspec(
      field.enum("type", ["a", "b"] as const),
      when("type", "a",
        field.dynamicEnum("extra", "extras"),
      ),
    );

    const resolvers = defineResolvers(form, {
      extras: async () => ({ options: [], validity: "valid" as const }),
    });

    expect(resolvers.has("extras")).toBe(true);
  });

  it("should throw when getting unknown resolver", () => {
    const form = formspec(
      field.dynamicEnum("country", "countries"),
    );

    const resolvers = defineResolvers(form, {
      countries: async () => ({ options: [], validity: "valid" as const }),
    });

    expect(() => resolvers.get("unknown" as "countries")).toThrow(
      "No resolver found for data source: unknown"
    );
  });

  it("should pass params to resolver", async () => {
    const form = formspec(
      field.dynamicEnum("product", "products", { params: ["merchantId"] }),
    );

    let receivedParams: Record<string, unknown> | undefined;

    const resolvers = defineResolvers(form, {
      products: async (params) => {
        receivedParams = params;
        return { options: [], validity: "valid" as const };
      },
    });

    await resolvers.get("products")({ merchantId: "123" });

    expect(receivedParams).toEqual({ merchantId: "123" });
  });
});
