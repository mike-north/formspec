import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { field, formspec } from "@formspec/dsl";
import { buildMixedAuthoringSchemas } from "../src/generators/mixed-authoring.js";
import { createNumericExtensionRegistry } from "./fixtures/example-numeric-extension.js";
import {
  constrainedShippingAddressOverlays,
  duplicateShippingAddressOverlays,
  incompatibleShippingAddressOverlays,
  nestedShippingAddressOverlays,
  requiredCountryShippingAddressOverlays,
  requiredShippingAddressOverlays,
  shippingAddressOverlays,
  unknownShippingAddressOverlays,
} from "./fixtures/mixed-authoring-shipping-address.js";

const fixturesDir = path.join(import.meta.dirname, "fixtures");
const shippingAddressFixture = path.join(fixturesDir, "mixed-authoring-shipping-address.ts");

function writeTempSource(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-mixed-authoring-"));
  const filePath = path.join(dir, "model.ts");
  fs.writeFileSync(filePath, source);
  return filePath;
}

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
      description: "Static shipping-address model for mixed-authoring composition tests.",
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
      required: ["city", "country"],
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

  it("rejects overlay-defined constraints so static constraints stay authoritative", () => {
    expect(() =>
      buildMixedAuthoringSchemas({
        filePath: shippingAddressFixture,
        typeName: "ShippingAddressModel",
        overlays: constrainedShippingAddressOverlays,
      })
    ).toThrow(/cannot define constraints/);
  });

  it("rejects overlay-defined requiredness so the static model remains authoritative", () => {
    expect(() =>
      buildMixedAuthoringSchemas({
        filePath: shippingAddressFixture,
        typeName: "ShippingAddressModel",
        overlays: requiredShippingAddressOverlays,
      })
    ).toThrow(/cannot change requiredness/);
  });

  it("allows overlays to repeat already-required fields without changing requiredness", () => {
    const result = buildMixedAuthoringSchemas({
      filePath: shippingAddressFixture,
      typeName: "ShippingAddressModel",
      overlays: requiredCountryShippingAddressOverlays,
    });

    expect(result.jsonSchema.required).toEqual(["city", "country"]);
    expect(result.jsonSchema.properties?.["country"]).toEqual({
      type: "string",
      title: "Country",
    });
  });

  it("forwards the extension registry into mixed-authoring analysis", () => {
    const filePath = writeTempSource(`
      export type Decimal = string;

      export interface InvoiceModel {
        /** @displayName Invoice Amount @maxDecimalPlaces 2 */
        amount: Decimal;
      }
    `);
    try {
      const result = buildMixedAuthoringSchemas({
        filePath,
        typeName: "InvoiceModel",
        overlays: formspec(),
        extensionRegistry: createNumericExtensionRegistry(),
        vendorPrefix: "x-formspec",
      });

      expect(result.jsonSchema.properties?.["amount"]).toEqual({
        type: "string",
        title: "Invoice Amount",
        "x-formspec-decimal": true,
        "x-formspec-max-decimal-places": 2,
      });
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });

  it("keeps explicit static display names over inferred overlay metadata", () => {
    const filePath = writeTempSource(`
      export interface AddressModel {
        /** @displayName Postal Code */
        postalCode: string;
      }
    `);
    try {
      const result = buildMixedAuthoringSchemas({
        filePath,
        typeName: "AddressModel",
        overlays: formspec(field.text("postalCode")),
        metadata: {
          field: {
            displayName: {
              mode: "infer-if-missing",
              infer: ({ logicalName }) => `Overlay ${logicalName}`,
            },
          },
        },
      });

      expect(result.uiSchema.elements[0]).toEqual({
        type: "Control",
        scope: "#/properties/postalCode",
        label: "Postal Code",
      });
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });

  it("lets explicit overlay metadata rename fields without breaking logical matching", () => {
    const filePath = writeTempSource(`
      export interface AddressModel {
        postalCode: string;
      }
    `);

    try {
      const result = buildMixedAuthoringSchemas({
        filePath,
        typeName: "AddressModel",
        overlays: formspec(
          field.text("postalCode", {
            apiName: "postal_code",
            displayName: "Postal Code",
          })
        ),
      });

      expect(result.jsonSchema.properties).toEqual({
        postal_code: {
          type: "string",
          title: "Postal Code",
        },
      });
      expect(result.jsonSchema.required).toEqual(["postal_code"]);
      expect(result.uiSchema.elements[0]).toEqual({
        type: "Control",
        scope: "#/properties/postal_code",
        label: "Postal Code",
      });
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });
});
