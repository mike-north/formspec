/**
 * Schema validation roundtrip tests.
 *
 * These tests prove that FormSpec-generated schemas are semantically correct by
 * validating sample data against them using `@formspec/validator`. A schema can
 * be structurally well-formed yet silently accept invalid data or reject valid
 * data — this suite catches those bugs.
 *
 * Strategy:
 *  1. Generate a schema via the CLI (same path as production).
 *  2. Feed the schema to `createFormSpecValidator`.
 *  3. Assert valid data passes and invalid data fails with appropriate errors.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createFormSpecValidator } from "@formspec/validator";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadGeneratedSchema(tempDir: string): Record<string, unknown> {
  const schemaFile = findSchemaFile(tempDir, "schema.json");
  if (!schemaFile) throw new Error(`schema.json not found in ${tempDir}`);
  return JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
}

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `formspec-roundtrip-${prefix}-`));
}

// ---------------------------------------------------------------------------
// ConstrainedForm — @minimum, @maximum, @minLength, @maxLength, @pattern,
//                  @minItems, @maxItems
// ---------------------------------------------------------------------------

describe("ConstrainedForm roundtrip", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;

  beforeAll(() => {
    tempDir = makeTempDir("constrained");
    const fixture = resolveFixture("tsdoc-class", "constrained-form.ts");
    const result = runCli(["generate", fixture, "ConstrainedForm", "-o", tempDir]);
    expect(result.exitCode).toBe(0);
    schema = loadGeneratedSchema(tempDir);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
  });

  const validData = {
    name: "John Doe",
    age: 25,
    email: "john@example.com",
    tags: ["alpha"],
  };

  it("accepts fully valid data", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate(validData).valid).toBe(true);
  });

  it("accepts valid data with optional legacyField present", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate({ ...validData, legacyField: "old" }).valid).toBe(true);
  });

  it("rejects missing required field", () => {
    const v = createFormSpecValidator(schema);
    const { name: _name, ...withoutName } = validData;
    expect(v.validate(withoutName).valid).toBe(false);
  });

  describe("age — @minimum 0 @maximum 150", () => {
    it("rejects age below minimum", () => {
      const v = createFormSpecValidator(schema);
      const result = v.validate({ ...validData, age: -1 });
      expect(result.valid).toBe(false);
    });

    it("rejects age above maximum", () => {
      const v = createFormSpecValidator(schema);
      const result = v.validate({ ...validData, age: 151 });
      expect(result.valid).toBe(false);
    });

    it("accepts age at minimum boundary (0)", () => {
      const v = createFormSpecValidator(schema);
      expect(v.validate({ ...validData, age: 0 }).valid).toBe(true);
    });

    it("accepts age at maximum boundary (150)", () => {
      const v = createFormSpecValidator(schema);
      expect(v.validate({ ...validData, age: 150 }).valid).toBe(true);
    });
  });

  describe("email — @minLength 5 @maxLength 100 @pattern ^[^@]+@[^@]+$", () => {
    it("rejects email shorter than minLength", () => {
      const v = createFormSpecValidator(schema);
      // "a@b" is 3 chars — below minLength 5
      expect(v.validate({ ...validData, email: "a@b" }).valid).toBe(false);
    });

    it("rejects email not matching pattern", () => {
      const v = createFormSpecValidator(schema);
      expect(v.validate({ ...validData, email: "notanemail" }).valid).toBe(false);
    });

    it("rejects email longer than maxLength", () => {
      const v = createFormSpecValidator(schema);
      const longEmail = `${"a".repeat(95)}@b.com`; // 101 chars
      expect(v.validate({ ...validData, email: longEmail }).valid).toBe(false);
    });

    it("accepts email at minLength boundary (5 chars, valid pattern)", () => {
      const v = createFormSpecValidator(schema);
      // "a@b.c" is 5 chars and matches the pattern
      expect(v.validate({ ...validData, email: "a@b.c" }).valid).toBe(true);
    });
  });

  describe("tags — @minItems 1 @maxItems 10", () => {
    it("rejects tags array with fewer than minItems", () => {
      const v = createFormSpecValidator(schema);
      expect(v.validate({ ...validData, tags: [] }).valid).toBe(false);
    });

    it("rejects tags array with more than maxItems", () => {
      const v = createFormSpecValidator(schema);
      const tooManyTags = Array.from({ length: 11 }, (_, i) => `tag${String(i)}`);
      expect(v.validate({ ...validData, tags: tooManyTags }).valid).toBe(false);
    });

    it("accepts tags array at maxItems boundary (10)", () => {
      const v = createFormSpecValidator(schema);
      const tenTags = Array.from({ length: 10 }, (_, i) => `tag${String(i)}`);
      expect(v.validate({ ...validData, tags: tenTags }).valid).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// NullableForm — nullable types accept null; non-nullable types reject null
// ---------------------------------------------------------------------------

describe("NullableForm roundtrip", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;

  beforeAll(() => {
    tempDir = makeTempDir("nullable");
    const fixture = resolveFixture("tsdoc-class", "nullable-types.ts");
    const result = runCli(["generate", fixture, "NullableForm", "-o", tempDir]);
    expect(result.exitCode).toBe(0);
    schema = loadGeneratedSchema(tempDir);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
  });

  const validData = {
    name: "Alice",
    nickname: "Ali",
    score: 42,
    status: "active" as const,
  };

  it("accepts fully valid data", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate(validData).valid).toBe(true);
  });

  it("accepts null for nullable field (nickname: string | null)", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate({ ...validData, nickname: null }).valid).toBe(true);
  });

  it("accepts null for nullable field (score: number | null)", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate({ ...validData, score: null }).valid).toBe(true);
  });

  it("rejects null for non-nullable required field (name: string)", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate({ ...validData, name: null }).valid).toBe(false);
  });

  it("accepts valid enum value for status", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate({ ...validData, status: "inactive" }).valid).toBe(true);
  });

  it("rejects invalid enum value for status", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate({ ...validData, status: "unknown" }).valid).toBe(false);
  });

  it("accepts optional age field being absent", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate(validData).valid).toBe(true);
  });

  it("accepts optional tags field being absent", () => {
    const v = createFormSpecValidator(schema);
    // Do not include the key at all — passing `{ tags: undefined }` would
    // create an explicit `undefined`-valued property that @cfworker/json-schema
    // cannot handle. Absent keys are the correct way to represent optional fields.
    expect(v.validate(validData).valid).toBe(true);
  });

  it("accepts optional tags field as array of strings", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate({ ...validData, tags: ["a", "b"] }).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MetricsForm — inherited constraints propagate correctly
// ---------------------------------------------------------------------------

describe("MetricsForm (inherited constraints) roundtrip", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;

  beforeAll(() => {
    tempDir = makeTempDir("inherited");
    const fixture = resolveFixture("tsdoc-class", "inherited-constraints.ts");
    const result = runCli(["generate", fixture, "MetricsForm", "-o", tempDir]);
    expect(result.exitCode).toBe(0);
    schema = loadGeneratedSchema(tempDir);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
  });

  const validData = { cpuUsage: 50, memoryUsage: 75 };

  it("accepts fully valid data", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate(validData).valid).toBe(true);
  });

  it("rejects missing required cpuUsage", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate({ memoryUsage: 50 }).valid).toBe(false);
  });

  describe("cpuUsage — @minimum 10 (overrides base @minimum 0) @maximum 100 @multipleOf 1", () => {
    it("rejects value below field-level minimum (10)", () => {
      const v = createFormSpecValidator(schema);
      expect(v.validate({ ...validData, cpuUsage: 9 }).valid).toBe(false);
    });

    it("accepts value at field-level minimum boundary (10)", () => {
      const v = createFormSpecValidator(schema);
      expect(v.validate({ ...validData, cpuUsage: 10 }).valid).toBe(true);
    });

    it("rejects value above inherited maximum (100)", () => {
      const v = createFormSpecValidator(schema);
      expect(v.validate({ ...validData, cpuUsage: 101 }).valid).toBe(false);
    });
  });

  describe("memoryUsage — @minimum 0 @maximum 100 (inherited from Percentage)", () => {
    it("rejects value below inherited minimum (0)", () => {
      const v = createFormSpecValidator(schema);
      expect(v.validate({ ...validData, memoryUsage: -1 }).valid).toBe(false);
    });

    it("rejects value above inherited maximum (100)", () => {
      const v = createFormSpecValidator(schema);
      expect(v.validate({ ...validData, memoryUsage: 101 }).valid).toBe(false);
    });

    it("accepts value at minimum boundary (0)", () => {
      const v = createFormSpecValidator(schema);
      expect(v.validate({ ...validData, memoryUsage: 0 }).valid).toBe(true);
    });

    it("accepts value at maximum boundary (100)", () => {
      const v = createFormSpecValidator(schema);
      expect(v.validate({ ...validData, memoryUsage: 100 }).valid).toBe(true);
    });
  });

  describe("diskUsage — optional, same constraints as Percentage", () => {
    it("accepts valid optional diskUsage", () => {
      const v = createFormSpecValidator(schema);
      expect(v.validate({ ...validData, diskUsage: 60 }).valid).toBe(true);
    });

    it("accepts absent optional diskUsage", () => {
      const v = createFormSpecValidator(schema);
      expect(v.validate(validData).valid).toBe(true);
    });

    it("rejects diskUsage above inherited maximum (100)", () => {
      const v = createFormSpecValidator(schema);
      expect(v.validate({ ...validData, diskUsage: 101 }).valid).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// OrderWithNesting — nested objects with additionalProperties: false
// ---------------------------------------------------------------------------

describe("OrderWithNesting roundtrip", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;

  beforeAll(() => {
    tempDir = makeTempDir("nested");
    const fixture = resolveFixture("tsdoc-class", "nested-objects.ts");
    const result = runCli(["generate", fixture, "OrderWithNesting", "-o", tempDir]);
    expect(result.exitCode).toBe(0);
    schema = loadGeneratedSchema(tempDir);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
  });

  const validData = {
    orderId: "order-123",
    customer: { name: "Bob", email: "bob@example.com" },
    items: [{ productId: "prod-1", quantity: 2 }],
  };

  it("accepts fully valid data", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate(validData).valid).toBe(true);
  });

  it("accepts valid data with optional nested address", () => {
    const v = createFormSpecValidator(schema);
    const withAddress = {
      ...validData,
      customer: {
        ...validData.customer,
        address: { street: "123 Main St", city: "Springfield", country: "US" },
      },
    };
    expect(v.validate(withAddress).valid).toBe(true);
  });

  it("rejects missing required orderId", () => {
    const v = createFormSpecValidator(schema);
    const { orderId: _orderId, ...withoutOrderId } = validData;
    expect(v.validate(withoutOrderId).valid).toBe(false);
  });

  it("rejects missing required customer", () => {
    const v = createFormSpecValidator(schema);
    const { customer: _customer, ...withoutCustomer } = validData;
    expect(v.validate(withoutCustomer).valid).toBe(false);
  });

  it("rejects customer missing required email", () => {
    const v = createFormSpecValidator(schema);
    const result = v.validate({
      ...validData,
      customer: { name: "Bob" },
    });
    expect(result.valid).toBe(false);
  });

  it("rejects extra properties on nested customer object (additionalProperties: false)", () => {
    const v = createFormSpecValidator(schema);
    const result = v.validate({
      ...validData,
      customer: { ...validData.customer, unknownField: "surprise" },
    });
    expect(result.valid).toBe(false);
  });

  it("rejects nested address missing required street", () => {
    const v = createFormSpecValidator(schema);
    const result = v.validate({
      ...validData,
      customer: {
        ...validData.customer,
        address: { city: "Springfield", country: "US" }, // no street
      },
    });
    expect(result.valid).toBe(false);
  });

  it("rejects items array item missing required quantity", () => {
    const v = createFormSpecValidator(schema);
    const result = v.validate({
      ...validData,
      items: [{ productId: "prod-1" }], // no quantity
    });
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ProductForm — basic types, enum, optional fields, $ref (Record type)
// ---------------------------------------------------------------------------

describe("ProductForm roundtrip", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;

  beforeAll(() => {
    tempDir = makeTempDir("product");
    const fixture = resolveFixture("tsdoc-class", "product-form.ts");
    const result = runCli(["generate", fixture, "ProductForm", "-o", tempDir]);
    expect(result.exitCode).toBe(0);
    schema = loadGeneratedSchema(tempDir);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
  });

  const validData = {
    name: "Widget",
    price: 9.99,
    currency: "usd" as const,
    active: true,
  };

  it("accepts fully valid data", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate(validData).valid).toBe(true);
  });

  it("accepts valid data with all optional fields present", () => {
    const v = createFormSpecValidator(schema);
    expect(
      v.validate({
        ...validData,
        description: "A widget",
        tags: ["sale"],
        metadata: {},
      }).valid
    ).toBe(true);
  });

  it("rejects missing required name", () => {
    const v = createFormSpecValidator(schema);
    const { name: _name, ...withoutName } = validData;
    expect(v.validate(withoutName).valid).toBe(false);
  });

  it("rejects missing required price", () => {
    const v = createFormSpecValidator(schema);
    const { price: _price, ...withoutPrice } = validData;
    expect(v.validate(withoutPrice).valid).toBe(false);
  });

  it("rejects missing required active", () => {
    const v = createFormSpecValidator(schema);
    const { active: _active, ...withoutActive } = validData;
    expect(v.validate(withoutActive).valid).toBe(false);
  });

  it("rejects invalid currency value (not in enum)", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate({ ...validData, currency: "jpy" }).valid).toBe(false);
  });

  it("rejects non-boolean active", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate({ ...validData, active: "yes" }).valid).toBe(false);
  });

  it("rejects non-number price", () => {
    const v = createFormSpecValidator(schema);
    expect(v.validate({ ...validData, price: "9.99" }).valid).toBe(false);
  });

  describe("error shape on failure", () => {
    it("returns valid: false and non-empty errors array", () => {
      const v = createFormSpecValidator(schema, { shortCircuit: false });
      const result = v.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("each error has keyword, keywordLocation, and instanceLocation", () => {
      const v = createFormSpecValidator(schema, { shortCircuit: false });
      const result = v.validate({});
      expect(result.valid).toBe(false);
      const err = result.errors[0];
      expect(err).toBeDefined();
      if (!err) return;
      expect(err).toHaveProperty("keyword");
      expect(err).toHaveProperty("keywordLocation");
      expect(err).toHaveProperty("instanceLocation");
    });
  });
});
