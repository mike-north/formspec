import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { buildMixedAuthoringSchemas } from "../index.js";
import {
  duplicateShippingAddressOverlays,
  incompatibleShippingAddressOverlays,
  nestedShippingAddressOverlays,
  shippingAddressOverlays,
  unknownShippingAddressOverlays,
} from "./fixtures/mixed-authoring-shipping-address.js";

const fixturesDir = path.join(import.meta.dirname, "fixtures");
const shippingAddressFixture = path.join(fixturesDir, "mixed-authoring-shipping-address.ts");

describe("buildMixedAuthoringSchemas", () => {
  it("composes a TSDoc-derived model with ChainDSL field overlays", () => {
    const result = buildMixedAuthoringSchemas({
      filePath: shippingAddressFixture,
      typeName: "ShippingAddressModel",
      overlays: shippingAddressOverlays,
    });

    expect(result.jsonSchema).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        country: { type: "string", title: "Country" },
        city: {
          type: "string",
          title: "City",
          "x-formspec-source": "cities",
          "x-formspec-params": ["country"],
        },
        postalCode: { type: "string", title: "Postal Code" },
      },
      required: ["country", "city"],
    });

    expect(result.uiSchema).toEqual({
      type: "VerticalLayout",
      elements: [
        { type: "Control", scope: "#/properties/country", label: "Country" },
        { type: "Control", scope: "#/properties/city", label: "City" },
        { type: "Control", scope: "#/properties/postalCode", label: "Postal Code" },
      ],
    });
  });

  it("rejects overlays whose dynamic type conflicts with the static field type", () => {
    expect(() =>
      buildMixedAuthoringSchemas({
        filePath: shippingAddressFixture,
        typeName: "NumericShippingAddressModel",
        overlays: incompatibleShippingAddressOverlays,
      })
    ).toThrow(/incompatible with the static field type/);
  });

  it("rejects nested object overlays until mixed-authoring supports them explicitly", () => {
    expect(() =>
      buildMixedAuthoringSchemas({
        filePath: shippingAddressFixture,
        typeName: "NestedShippingAddressModel",
        overlays: nestedShippingAddressOverlays,
      })
    ).toThrow(/do not support nested object or array overlays/);
  });

  it("rejects overlays that reference fields missing from the static model", () => {
    expect(() =>
      buildMixedAuthoringSchemas({
        filePath: shippingAddressFixture,
        typeName: "ShippingAddressModel",
        overlays: unknownShippingAddressOverlays,
      })
    ).toThrow(/not present in the static model/);
  });

  it("rejects duplicate overlay field definitions", () => {
    expect(() =>
      buildMixedAuthoringSchemas({
        filePath: shippingAddressFixture,
        typeName: "ShippingAddressModel",
        overlays: duplicateShippingAddressOverlays,
      })
    ).toThrow(/define "city" more than once/);
  });

  it("fails loudly when the target type does not exist", () => {
    expect(() =>
      buildMixedAuthoringSchemas({
        filePath: shippingAddressFixture,
        typeName: "MissingShippingAddressModel",
        overlays: shippingAddressOverlays,
      })
    ).toThrow(/not found as a class, interface, or type alias/);
  });
});
