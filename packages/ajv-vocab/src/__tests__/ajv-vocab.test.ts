import { describe, it, expect } from "vitest";
import { Ajv } from "ajv";
import { registerFormSpecVocabulary } from "../index.js";

// Helper: create a fresh Ajv instance in strict mode for each test scenario.
function makeAjv(): Ajv {
  return new Ajv({ strict: true });
}

describe("registerFormSpecVocabulary", () => {
  describe("default prefix (formspec)", () => {
    it("allows a schema with x-formspec-source after registration", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv);

      const validate = ajv.compile({
        type: "string",
        "x-formspec-source": "countries",
      });

      expect(validate("anything")).toBe(true);
      expect(validate.errors).toBeNull();
    });

    it("throws in strict mode when x-formspec-source is present without registration", () => {
      const ajv = makeAjv();

      expect(() =>
        ajv.compile({
          type: "string",
          "x-formspec-source": "countries",
        })
      ).toThrow();
    });

    it("allows a schema with x-formspec-params after registration", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv);

      const validate = ajv.compile({
        type: "string",
        "x-formspec-params": ["merchantId", "regionId"],
      });

      expect(validate("anything")).toBe(true);
      expect(validate.errors).toBeNull();
    });

    it("throws in strict mode when x-formspec-params is present without registration", () => {
      const ajv = makeAjv();

      expect(() =>
        ajv.compile({
          type: "string",
          "x-formspec-params": ["merchantId"],
        })
      ).toThrow();
    });

    it("allows an empty x-formspec-params array", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv);

      const validate = ajv.compile({
        type: "string",
        "x-formspec-params": [],
      });

      expect(validate("anything")).toBe(true);
    });

    it("allows a schema with x-formspec-schemaSource after registration", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv);

      const validate = ajv.compile({
        type: "object",
        "x-formspec-schemaSource": "MyFormClass",
      });

      expect(validate({})).toBe(true);
      expect(validate.errors).toBeNull();
    });

    it("throws in strict mode when x-formspec-schemaSource is present without registration", () => {
      const ajv = makeAjv();

      expect(() =>
        ajv.compile({
          type: "object",
          "x-formspec-schemaSource": "MyFormClass",
        })
      ).toThrow();
    });

    it("allows all three x-formspec-* keywords together after registration", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv);

      const validate = ajv.compile({
        type: "object",
        "x-formspec-schemaSource": "OrderForm",
        properties: {
          status: {
            type: "string",
            "x-formspec-source": "statuses",
            "x-formspec-params": ["merchantId"],
          },
        },
      });

      expect(validate({ status: "active" })).toBe(true);
    });
  });

  describe("annotation-only behavior", () => {
    it("keywords do not affect validation outcome — valid data still passes", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv);

      const validate = ajv.compile({
        type: "object",
        properties: {
          country: {
            type: "string",
            "x-formspec-source": "countries",
            "x-formspec-params": ["region"],
          },
        },
        "x-formspec-schemaSource": "ShippingForm",
      });

      expect(validate({ country: "US" })).toBe(true);
    });

    it("keywords do not affect validation outcome — invalid data still fails", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv);

      const validate = ajv.compile({
        type: "object",
        properties: {
          country: {
            type: "string",
            "x-formspec-source": "countries",
          },
        },
        required: ["country"],
      });

      // Missing required property should still fail
      expect(validate({})).toBe(false);
      expect(validate.errors).not.toBeNull();
      expect(validate.errors).toHaveLength(1);
    });
  });

  describe("idempotence", () => {
    it("can be called multiple times on the same instance without throwing", () => {
      const ajv = makeAjv();

      expect(() => {
        registerFormSpecVocabulary(ajv);
        registerFormSpecVocabulary(ajv);
        registerFormSpecVocabulary(ajv);
      }).not.toThrow();
    });

    it("schemas compile correctly after repeated registration calls", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv);
      registerFormSpecVocabulary(ajv);

      const validate = ajv.compile({
        type: "string",
        "x-formspec-source": "countries",
      });

      expect(validate("US")).toBe(true);
    });
  });

  describe("custom vendor prefix", () => {
    it("registers keywords under the custom prefix", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv, { vendorPrefix: "myapp" });

      const validate = ajv.compile({
        type: "string",
        "x-myapp-source": "countries",
      });

      expect(validate("anything")).toBe(true);
    });

    it("throws in strict mode for default prefix when custom prefix is used", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv, { vendorPrefix: "myapp" });

      // Default x-formspec-source is NOT registered when a custom prefix is used
      expect(() =>
        ajv.compile({
          type: "string",
          "x-formspec-source": "countries",
        })
      ).toThrow();
    });

    it("registers all three built-in keyword suffixes under the custom prefix", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv, { vendorPrefix: "acme" });

      const validate = ajv.compile({
        type: "object",
        "x-acme-schemaSource": "OrderForm",
        properties: {
          status: {
            type: "string",
            "x-acme-source": "statuses",
            "x-acme-params": ["merchantId"],
          },
        },
      });

      expect(validate({ status: "active" })).toBe(true);
    });

    it("idempotent with custom prefix", () => {
      const ajv = makeAjv();

      expect(() => {
        registerFormSpecVocabulary(ajv, { vendorPrefix: "acme" });
        registerFormSpecVocabulary(ajv, { vendorPrefix: "acme" });
      }).not.toThrow();
    });
  });

  describe("extension hook (additionalKeywords)", () => {
    it("registers an additional keyword so strict mode does not reject it", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv, {
        additionalKeywords: ["x-myext-customField"],
      });

      const validate = ajv.compile({
        type: "string",
        "x-myext-customField": "some-value",
      });

      expect(validate("anything")).toBe(true);
    });

    it("throws in strict mode when additional keyword is absent from registration", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv);

      expect(() =>
        ajv.compile({
          type: "string",
          "x-myext-customField": "some-value",
        })
      ).toThrow();
    });

    it("registers multiple additional keywords", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv, {
        additionalKeywords: ["x-ext-alpha", "x-ext-beta", "x-ext-gamma"],
      });

      const validate = ajv.compile({
        type: "object",
        "x-ext-alpha": "a",
        "x-ext-beta": 2,
        "x-ext-gamma": true,
      });

      expect(validate({})).toBe(true);
    });

    it("additional keywords are annotation-only — do not affect validation outcome", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv, {
        additionalKeywords: ["x-myext-label"],
      });

      const validate = ajv.compile({
        type: "object",
        required: ["name"],
        "x-myext-label": "Contact Form",
        properties: { name: { type: "string" } },
      });

      expect(validate({ name: "Alice" })).toBe(true);
      expect(validate({})).toBe(false);
    });

    it("additional keywords combined with default prefix built-ins", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv, {
        additionalKeywords: ["x-myext-resolver"],
      });

      const validate = ajv.compile({
        type: "string",
        "x-formspec-source": "countries",
        "x-myext-resolver": "my-custom-resolver",
      });

      expect(validate("US")).toBe(true);
    });

    it("additional keywords combined with custom vendor prefix", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv, {
        vendorPrefix: "acme",
        additionalKeywords: ["x-myext-resolver"],
      });

      const validate = ajv.compile({
        type: "string",
        "x-acme-source": "countries",
        "x-myext-resolver": "my-custom-resolver",
      });

      expect(validate("US")).toBe(true);
    });

    it("empty additionalKeywords array is treated as no extra keywords", () => {
      const ajv = makeAjv();
      registerFormSpecVocabulary(ajv, { additionalKeywords: [] });

      // Default keywords still registered
      const validate = ajv.compile({
        type: "string",
        "x-formspec-source": "countries",
      });

      expect(validate("US")).toBe(true);
    });

    it("idempotent with additional keywords", () => {
      const ajv = makeAjv();

      expect(() => {
        registerFormSpecVocabulary(ajv, {
          additionalKeywords: ["x-ext-one"],
        });
        registerFormSpecVocabulary(ajv, {
          additionalKeywords: ["x-ext-one"],
        });
      }).not.toThrow();
    });
  });
});
