import { describe, it, expect } from "vitest";
import { createFormSpecValidator, Validator } from "../index.js";

describe("createFormSpecValidator", () => {
  describe("basic type validation", () => {
    it("validates a string value", () => {
      const v = createFormSpecValidator({ type: "string" });
      expect(v.validate("hello").valid).toBe(true);
      expect(v.validate(42).valid).toBe(false);
    });

    it("validates a number value", () => {
      const v = createFormSpecValidator({ type: "number" });
      expect(v.validate(42).valid).toBe(true);
      expect(v.validate("hello").valid).toBe(false);
    });

    it("validates an object with required properties", () => {
      const v = createFormSpecValidator({
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
      });

      expect(v.validate({ name: "Alice", age: 30 }).valid).toBe(true);
      expect(v.validate({ name: "Alice" }).valid).toBe(true);
      expect(v.validate({}).valid).toBe(false);
      expect(v.validate({ name: 42 }).valid).toBe(false);
    });

    it("validates an array with item types", () => {
      const v = createFormSpecValidator({
        type: "array",
        items: { type: "string" },
      });

      expect(v.validate(["a", "b"]).valid).toBe(true);
      expect(v.validate([1, 2]).valid).toBe(false);
    });

    it("validates a boolean value", () => {
      const v = createFormSpecValidator({ type: "boolean" });
      expect(v.validate(true).valid).toBe(true);
      expect(v.validate("true").valid).toBe(false);
    });

    it("rejects null for non-nullable types", () => {
      const v = createFormSpecValidator({ type: "string" });
      expect(v.validate(null).valid).toBe(false);
    });
  });

  describe("x-formspec-* extension keywords", () => {
    it("ignores x-formspec-source without errors", () => {
      const v = createFormSpecValidator({
        type: "string",
        "x-formspec-source": "countries",
      });

      expect(v.validate("US").valid).toBe(true);
    });

    it("ignores x-formspec-params without errors", () => {
      const v = createFormSpecValidator({
        type: "string",
        "x-formspec-params": ["merchantId", "regionId"],
      });

      expect(v.validate("anything").valid).toBe(true);
    });

    it("ignores x-formspec-schemaSource without errors", () => {
      const v = createFormSpecValidator({
        type: "object",
        "x-formspec-schemaSource": "MyFormClass",
      });

      expect(v.validate({}).valid).toBe(true);
    });

    it("ignores all x-formspec-* keywords together", () => {
      const v = createFormSpecValidator({
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

      expect(v.validate({ status: "active" }).valid).toBe(true);
    });

    it("extension keywords do not affect validation — invalid data still fails", () => {
      const v = createFormSpecValidator({
        type: "object",
        required: ["country"],
        properties: {
          country: {
            type: "string",
            "x-formspec-source": "countries",
          },
        },
      });

      expect(v.validate({}).valid).toBe(false);
    });

    it("ignores arbitrary unknown extension keywords", () => {
      const v = createFormSpecValidator({
        type: "string",
        "x-myext-customField": "some-value",
        "x-another-ext": true,
      });

      expect(v.validate("anything").valid).toBe(true);
    });
  });

  describe("JSON Schema 2020-12 features", () => {
    it("supports $defs and $ref", () => {
      const v = createFormSpecValidator({
        type: "object",
        properties: {
          address: { $ref: "#/$defs/Address" },
        },
        $defs: {
          Address: {
            type: "object",
            required: ["street"],
            properties: {
              street: { type: "string" },
              city: { type: "string" },
            },
          },
        },
      });

      expect(v.validate({ address: { street: "123 Main" } }).valid).toBe(true);
      expect(v.validate({ address: {} }).valid).toBe(false);
    });

    it("supports anyOf", () => {
      const v = createFormSpecValidator({
        anyOf: [{ type: "string" }, { type: "number" }],
      });

      expect(v.validate("hello").valid).toBe(true);
      expect(v.validate(42).valid).toBe(true);
      expect(v.validate(true).valid).toBe(false);
    });

    it("supports const", () => {
      const v = createFormSpecValidator({ const: "fixed" });

      expect(v.validate("fixed").valid).toBe(true);
      expect(v.validate("other").valid).toBe(false);
    });

    it("supports if/then/else", () => {
      const v = createFormSpecValidator({
        type: "object",
        properties: {
          kind: { type: "string" },
          value: {},
        },
        if: {
          properties: { kind: { const: "number" } },
          required: ["kind"],
        },
        then: {
          properties: { value: { type: "number" } },
        },
        else: {
          properties: { value: { type: "string" } },
        },
      });

      expect(v.validate({ kind: "number", value: 42 }).valid).toBe(true);
      expect(v.validate({ kind: "text", value: "hello" }).valid).toBe(true);
      expect(v.validate({ kind: "number", value: "hello" }).valid).toBe(false);
    });

    it("supports enum keyword", () => {
      const v = createFormSpecValidator({
        type: "string",
        enum: ["draft", "sent", "paid"],
      });

      expect(v.validate("draft").valid).toBe(true);
      expect(v.validate("unknown").valid).toBe(false);
    });
  });

  describe("error shape", () => {
    it("returns valid: true and empty errors on success", () => {
      const v = createFormSpecValidator({ type: "string" });
      const result = v.validate("hello");

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("returns valid: false with errors containing keyword and instanceLocation", () => {
      const v = createFormSpecValidator({
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } },
      });

      const result = v.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const err = result.errors[0];
      expect(err).toBeDefined();
      expect(err).toHaveProperty("keyword");
      expect(err).toHaveProperty("keywordLocation");
      expect(err).toHaveProperty("instanceLocation");
      expect(err).toHaveProperty("error");
    });
  });

  describe("shortCircuit option", () => {
    it("collects all errors when shortCircuit is false", () => {
      const v = createFormSpecValidator(
        {
          type: "object",
          required: ["name", "age"],
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
        },
        { shortCircuit: false },
      );

      const result = v.validate({});
      expect(result.valid).toBe(false);
      // With two missing required fields and shortCircuit off, multiple errors
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it("short-circuits by default (fewer errors than shortCircuit: false)", () => {
      // Use a schema with multiple independent violations to produce divergent error counts
      const schema = {
        type: "object",
        required: ["a", "b", "c"],
        properties: {
          a: { type: "string" },
          b: { type: "number" },
          c: { type: "boolean" },
        },
        additionalProperties: false,
      };
      const invalidInput = { a: 1, b: "wrong", c: "also-wrong", extra: true };

      const shortCircuitResult = createFormSpecValidator(schema).validate(invalidInput);
      const allErrorsResult = createFormSpecValidator(schema, {
        shortCircuit: false,
      }).validate(invalidInput);

      expect(shortCircuitResult.valid).toBe(false);
      expect(allErrorsResult.valid).toBe(false);
      expect(allErrorsResult.errors.length).toBeGreaterThan(shortCircuitResult.errors.length);
    });
  });

  describe("format validation", () => {
    it("validates date-time format", () => {
      const v = createFormSpecValidator({
        type: "string",
        format: "date-time",
      });

      expect(v.validate("2024-01-15T10:30:00Z").valid).toBe(true);
      expect(v.validate("not-a-date").valid).toBe(false);
    });

    it("validates email format", () => {
      const v = createFormSpecValidator({
        type: "string",
        format: "email",
      });

      expect(v.validate("user@example.com").valid).toBe(true);
      expect(v.validate("not-an-email").valid).toBe(false);
    });

    it("validates uri format", () => {
      const v = createFormSpecValidator({
        type: "string",
        format: "uri",
      });

      expect(v.validate("https://example.com").valid).toBe(true);
      expect(v.validate("not a uri").valid).toBe(false);
    });
  });

  describe("draft option", () => {
    it("defaults to 2020-12", () => {
      // Verify it works with 2020-12 features like $defs
      const v = createFormSpecValidator({
        $defs: { Str: { type: "string" } },
        $ref: "#/$defs/Str",
      });

      expect(v.validate("hello").valid).toBe(true);
    });

    it("accepts draft 7", () => {
      const v = createFormSpecValidator(
        {
          definitions: { Str: { type: "string" } },
          $ref: "#/definitions/Str",
        },
        { draft: "7" },
      );

      expect(v.validate("hello").valid).toBe(true);
    });
  });

  describe("re-exports", () => {
    it("exports the Validator class for advanced use", () => {
      expect(Validator).toBeDefined();
      const v = new Validator({ type: "string" }, "2020-12", true);
      expect(v.validate("hello").valid).toBe(true);
    });
  });
});
