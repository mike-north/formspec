/**
 * Tests that a `Ref<T>`-shaped type produces the correct JSON Schema.
 *
 * The fixture mirrors the SDK's `Ref<T>` type:
 * - Intersection of `{ type, id }` with a branded phantom object
 * - `@discriminator :type T` tag for type-parameter-driven discrimination
 * - `ExtractObjectTag<T>` conditional helper for the discriminator field
 * - Symbol-keyed `[__brand]` (excluded by computed property filter)
 * - String-keyed `__type?: T` (excluded by `__` prefix filter)
 *
 * @see packages/build/src/analyzer/class-analyzer.ts — shouldEmitResolvedObjectProperty
 * @see packages/build/src/analyzer/class-analyzer.ts — applyDeclarationDiscriminatorToFields
 * @see https://json-schema.org/draft/2020-12/json-schema-core — authoritative spec for $ref/enum/oneOf/const semantics
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSchemas, type GenerateSchemasOptions } from "../src/generators/class-schema.js";

function generateSchemasOrThrow(options: Omit<GenerateSchemasOptions, "errorReporting">) {
  return generateSchemas({ ...options, errorReporting: "throw" });
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const FIXTURE_SOURCE = `
type ExtractObjectTag<T> = T extends { readonly object: infer O }
  ? O extends string ? O : never
  : never;

declare const __brand: unique symbol;

/**
 * Typed reference to another API resource.
 * @discriminator :type T
 */
type Ref<T extends { readonly object: string } = { readonly object: string }> = {
  type: ExtractObjectTag<T>;
  id: string;
} & {
  readonly [__brand]: 'Ref';
  readonly __type?: T;
};

// --- Target types for Ref<T> instantiation ---

interface Customer {
  readonly object: 'customer';
  name: string;
  email: string;
}

interface Invoice {
  readonly object: 'invoice';
  amount: number;
  currency: string;
  customer: Ref<Customer>;
}

/** @apiName custom_loyalty */
interface LoyaltyProgram {
  readonly object: string;
  points: number;
}

// --- Form definitions using Ref<T> ---

export interface SingleRefForm {
  customer: Ref<Customer>;
}

export interface CustomObjectRefForm {
  loyalty: Ref<LoyaltyProgram>;
}

export interface MixedRefForm {
  // Literal object property — prefix does NOT apply.
  customer: Ref<Customer>;
  // Metadata-derived (apiName) value — prefix DOES apply.
  loyalty: Ref<LoyaltyProgram>;
}

export interface MultiRefForm {
  customer: Ref<Customer>;
  invoice: Ref<Invoice>;
}

export interface OptionalRefForm {
  customer?: Ref<Customer>;
}

export interface NestedRefForm {
  /** Invoice whose customer field is itself a Ref<Customer>. */
  invoice: Ref<Invoice>;
}
`.trimStart();

let fixturePath: string;
let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-ref-type-"));
  fs.writeFileSync(
    path.join(tmpDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "nodenext",
          strict: true,
          skipLibCheck: true,
        },
      },
      null,
      2
    )
  );
  fixturePath = path.join(tmpDir, "fixture.ts");
  fs.writeFileSync(fixturePath, FIXTURE_SOURCE);
});

afterAll(() => {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${message}: expected object, got ${typeof value}`);
  }
  return value as Record<string, unknown>;
}

function resolveRef(
  schema: unknown,
  root: Record<string, unknown>
): Record<string, unknown> {
  // Fail fast if `schema` isn't an object — silently casting `undefined` here
  // produces confusing downstream errors (e.g. "cannot read properties of
  // undefined") that mask missing fields in the test setup.
  const record = expectRecord(schema, "Expected schema object for resolveRef");
  const ref = record["$ref"];
  if (typeof ref !== "string" || !ref.startsWith("#/$defs/")) {
    return record;
  }
  const defName = ref.replace(/^#\/\$defs\//u, "");
  const defs = (root["$defs"] ?? {}) as Record<string, unknown>;
  return expectRecord(defs[defName], `Missing $defs/${defName}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Ref<T> JSON Schema serialization", () => {
  describe("single Ref<Customer> field", () => {
    it("produces an object with only 'type' and 'id' properties (phantom properties excluded)", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "SingleRefForm",
      });

      const props = result.jsonSchema.properties as Record<string, unknown>;
      expect(props).toHaveProperty("customer");

      // Resolve through $ref if the Ref type is hoisted to $defs
      const refSchema = resolveRef(props["customer"], result.jsonSchema as Record<string, unknown>);
      const refProps = expectRecord(refSchema["properties"], "Missing Ref properties");
      const keys = Object.keys(refProps).sort();

      // Only type + id — no __type, no __brand, no phantom properties
      expect(keys).toEqual(["id", "type"]);
    });

    it("discriminator specializes 'type' to enum ['customer']", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "SingleRefForm",
      });

      const props = result.jsonSchema.properties as Record<string, unknown>;
      const refSchema = resolveRef(props["customer"], result.jsonSchema as Record<string, unknown>);
      const refProps = expectRecord(refSchema["properties"], "Missing Ref properties");
      const typeSchema = expectRecord(refProps["type"], "Missing type property");

      // @discriminator :type T with T=Customer → Customer.object is 'customer'
      expect(typeSchema["enum"]).toEqual(["customer"]);
    });

    it("'id' property is type: string", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "SingleRefForm",
      });

      const props = result.jsonSchema.properties as Record<string, unknown>;
      const refSchema = resolveRef(props["customer"], result.jsonSchema as Record<string, unknown>);
      const refProps = expectRecord(refSchema["properties"], "Missing Ref properties");
      const idSchema = expectRecord(refProps["id"], "Missing id property");

      expect(idSchema["type"]).toBe("string");
    });
  });

  describe("multiple Ref fields with different type arguments", () => {
    it("each Ref field gets its own discriminator value", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "MultiRefForm",
      });

      const props = result.jsonSchema.properties as Record<string, unknown>;
      const root = result.jsonSchema as Record<string, unknown>;

      const customerRef = resolveRef(props["customer"], root);
      const customerProps = expectRecord(customerRef["properties"], "Missing customer Ref props");
      const customerType = expectRecord(customerProps["type"], "Missing customer type");
      expect(customerType["enum"]).toEqual(["customer"]);

      const invoiceRef = resolveRef(props["invoice"], root);
      const invoiceProps = expectRecord(invoiceRef["properties"], "Missing invoice Ref props");
      const invoiceType = expectRecord(invoiceProps["type"], "Missing invoice type");
      expect(invoiceType["enum"]).toEqual(["invoice"]);
    });

    it("both Ref schemas have only 'type' and 'id' properties", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "MultiRefForm",
      });

      const props = result.jsonSchema.properties as Record<string, unknown>;
      const root = result.jsonSchema as Record<string, unknown>;

      for (const fieldName of ["customer", "invoice"]) {
        const refSchema = resolveRef(props[fieldName], root);
        const refProps = expectRecord(refSchema["properties"], `Missing ${fieldName} Ref props`);
        expect(Object.keys(refProps).sort()).toEqual(["id", "type"]);
      }
    });
  });

  describe("optional Ref field", () => {
    it("optional Ref<Customer> is not in required array", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "OptionalRefForm",
      });

      const required = result.jsonSchema.required ?? [];
      expect(required).not.toContain("customer");
    });

    it("optional Ref<Customer> still has correct discriminator", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "OptionalRefForm",
      });

      const props = result.jsonSchema.properties as Record<string, unknown>;
      const root = result.jsonSchema as Record<string, unknown>;

      // May be wrapped in a nullable schema — find the Ref properties
      const customerSchema = props["customer"] as Record<string, unknown>;
      // Try direct resolution first, then check oneOf/anyOf for nullable
      const refSchema = customerSchema["$ref"] !== undefined
        ? resolveRef(customerSchema, root)
        : (() => {
            const oneOf = customerSchema["oneOf"] as unknown[] | undefined;
            const anyOf = customerSchema["anyOf"] as unknown[] | undefined;
            const members = oneOf ?? anyOf ?? [customerSchema];
            const nonNull = members.find(
              (m) => typeof m === "object" && m !== null && (m as Record<string, unknown>)["type"] !== "null"
            );
            return nonNull !== undefined
              ? resolveRef(nonNull, root)
              : customerSchema;
          })();

      // Assert properties are emitted unconditionally — a regression that drops
      // the Ref body on optional fields must fail this test, not silently pass.
      const refProps = expectRecord(
        refSchema["properties"],
        "Optional Ref<Customer> is missing its properties (discriminator would be lost)"
      );
      const typeSchema = expectRecord(refProps["type"], "Missing type property");
      expect(typeSchema["enum"]).toEqual(["customer"]);
    });
  });

  describe("Ref<T> where T itself contains a Ref field", () => {
    it("Invoice.customer (a Ref<Customer> inside Invoice) does not appear in the Ref<Invoice> schema", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "NestedRefForm",
      });

      // The form has invoice: Ref<Invoice>.
      // Ref<Invoice> should have {type, id} — not the full Invoice body.
      const props = result.jsonSchema.properties as Record<string, unknown>;
      const root = result.jsonSchema as Record<string, unknown>;
      const invoiceRef = resolveRef(props["invoice"], root);
      const invoiceRefProps = expectRecord(invoiceRef["properties"], "Missing Ref<Invoice> props");

      // Only type + id — Invoice's internal fields (amount, currency, customer) are NOT here
      expect(Object.keys(invoiceRefProps).sort()).toEqual(["id", "type"]);
    });

    it("Ref<Invoice> discriminator is 'invoice'", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "NestedRefForm",
      });

      const props = result.jsonSchema.properties as Record<string, unknown>;
      const root = result.jsonSchema as Record<string, unknown>;
      const invoiceRef = resolveRef(props["invoice"], root);
      const invoiceRefProps = expectRecord(invoiceRef["properties"], "Missing Ref<Invoice> props");
      const typeSchema = expectRecord(invoiceRefProps["type"], "Missing type property");
      expect(typeSchema["enum"]).toEqual(["invoice"]);
    });
  });

  describe("enumSerialization: 'oneOf'", () => {
    it("discriminator 'type' uses oneOf with const/title instead of enum", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "SingleRefForm",
        enumSerialization: "oneOf",
      });

      const props = result.jsonSchema.properties as Record<string, unknown>;
      const refSchema = resolveRef(props["customer"], result.jsonSchema as Record<string, unknown>);
      const refProps = expectRecord(refSchema["properties"], "Missing Ref properties");
      const typeSchema = expectRecord(refProps["type"], "Missing type property");

      // oneOf serialization: singleton enum → oneOf with const only (no title when
      // displayName equals the value; #310 — omit redundant title).
      expect(typeSchema).not.toHaveProperty("enum");
      const oneOf = typeSchema["oneOf"] as unknown[];
      expect(oneOf).toBeDefined();
      expect(oneOf).toHaveLength(1);
      const member = oneOf[0] as Record<string, unknown>;
      expect(member["const"]).toBe("customer");
      expect(member).not.toHaveProperty("title");
    });

    it("multiple Ref fields each get oneOf discriminators with correct const values", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "MultiRefForm",
        enumSerialization: "oneOf",
      });

      const props = result.jsonSchema.properties as Record<string, unknown>;
      const root = result.jsonSchema as Record<string, unknown>;

      const customerRef = resolveRef(props["customer"], root);
      const customerProps = expectRecord(customerRef["properties"], "Missing customer Ref props");
      const customerType = expectRecord(customerProps["type"], "Missing customer type");
      const customerOneOf = customerType["oneOf"] as Record<string, unknown>[];
      expect(customerOneOf).toHaveLength(1);
      const [customerFirst] = customerOneOf;
      if (!customerFirst) throw new Error("customer oneOf[0] missing");
      expect(customerFirst["const"]).toBe("customer");

      const invoiceRef = resolveRef(props["invoice"], root);
      const invoiceProps = expectRecord(invoiceRef["properties"], "Missing invoice Ref props");
      const invoiceType = expectRecord(invoiceProps["type"], "Missing invoice type");
      const invoiceOneOf = invoiceType["oneOf"] as Record<string, unknown>[];
      expect(invoiceOneOf).toHaveLength(1);
      const [invoiceFirst] = invoiceOneOf;
      if (!invoiceFirst) throw new Error("invoice oneOf[0] missing");
      expect(invoiceFirst["const"]).toBe("invoice");
    });

    it("id and property structure unchanged with oneOf serialization", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "SingleRefForm",
        enumSerialization: "oneOf",
      });

      const props = result.jsonSchema.properties as Record<string, unknown>;
      const refSchema = resolveRef(props["customer"], result.jsonSchema as Record<string, unknown>);
      const refProps = expectRecord(refSchema["properties"], "Missing Ref properties");

      // Still only type + id
      expect(Object.keys(refProps).sort()).toEqual(["id", "type"]);

      // id is still type: string
      const idSchema = expectRecord(refProps["id"], "Missing id property");
      expect(idSchema["type"]).toBe("string");
    });
  });

  describe("discriminator with apiNamePrefix", () => {
    it("literal object property value is NOT prefixed", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "SingleRefForm",
        discriminator: { apiNamePrefix: "v2.extend.objects." },
      });

      const props = result.jsonSchema.properties as Record<string, unknown>;
      const refSchema = resolveRef(props["customer"], result.jsonSchema as Record<string, unknown>);
      const refProps = expectRecord(refSchema["properties"], "Missing Ref properties");
      const typeSchema = expectRecord(refProps["type"], "Missing type property");

      // Customer has readonly object: 'customer' — a literal property value.
      // Prefix only applies to metadata-derived values, not literals.
      expect(typeSchema["enum"]).toEqual(["customer"]);
    });

    it("multiple literal discriminators are NOT prefixed even with apiNamePrefix set", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "MultiRefForm",
        discriminator: { apiNamePrefix: "v2.extend.objects." },
      });

      const props = result.jsonSchema.properties as Record<string, unknown>;
      const root = result.jsonSchema as Record<string, unknown>;

      // Both Customer and Invoice have literal object properties — no prefix
      const customerRef = resolveRef(props["customer"], root);
      const customerProps = expectRecord(customerRef["properties"], "Missing customer Ref props");
      const customerType = expectRecord(customerProps["type"], "Missing customer type");
      expect(customerType["enum"]).toEqual(["customer"]);

      const invoiceRef = resolveRef(props["invoice"], root);
      const invoiceProps = expectRecord(invoiceRef["properties"], "Missing invoice Ref props");
      const invoiceType = expectRecord(invoiceProps["type"], "Missing invoice type");
      expect(invoiceType["enum"]).toEqual(["invoice"]);
    });

    it("literal discriminator NOT prefixed with oneOf serialization", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "SingleRefForm",
        discriminator: { apiNamePrefix: "v2.extend.objects." },
        enumSerialization: "oneOf",
      });

      const props = result.jsonSchema.properties as Record<string, unknown>;
      const refSchema = resolveRef(props["customer"], result.jsonSchema as Record<string, unknown>);
      const refProps = expectRecord(refSchema["properties"], "Missing Ref properties");
      const typeSchema = expectRecord(refProps["type"], "Missing type property");

      // Literal value, no prefix, oneOf format
      const oneOf = typeSchema["oneOf"] as Record<string, unknown>[];
      expect(oneOf).toHaveLength(1);
      const [firstOneOf] = oneOf;
      if (!firstOneOf) throw new Error("oneOf[0] missing");
      expect(firstOneOf["const"]).toBe("customer");
    });

    it("@apiName-derived value IS prefixed", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "CustomObjectRefForm",
        discriminator: { apiNamePrefix: "v2.extend.objects." },
      });

      const props = result.jsonSchema.properties as Record<string, unknown>;
      const refSchema = resolveRef(props["loyalty"], result.jsonSchema as Record<string, unknown>);
      const refProps = expectRecord(refSchema["properties"], "Missing Ref properties");
      const typeSchema = expectRecord(refProps["type"], "Missing type property");

      // LoyaltyProgram has @apiName custom_loyalty — metadata-derived, so prefix applies.
      expect(typeSchema["enum"]).toEqual(["v2.extend.objects.custom_loyalty"]);
    });

    it("mixed form: literal and @apiName-derived Refs coexist with correct prefixing", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "MixedRefForm",
        discriminator: { apiNamePrefix: "v2.extend.objects." },
      });

      const props = result.jsonSchema.properties as Record<string, unknown>;
      const root = result.jsonSchema as Record<string, unknown>;

      // customer: Ref<Customer> — Customer has literal `object: 'customer'`, so NOT prefixed.
      const customerRef = resolveRef(props["customer"], root);
      const customerProps = expectRecord(customerRef["properties"], "Missing customer Ref props");
      const customerType = expectRecord(customerProps["type"], "Missing customer type");
      expect(customerType["enum"]).toEqual(["customer"]);

      // loyalty: Ref<LoyaltyProgram> — LoyaltyProgram has @apiName custom_loyalty, so IS prefixed.
      const loyaltyRef = resolveRef(props["loyalty"], root);
      const loyaltyProps = expectRecord(loyaltyRef["properties"], "Missing loyalty Ref props");
      const loyaltyType = expectRecord(loyaltyProps["type"], "Missing loyalty type");
      expect(loyaltyType["enum"]).toEqual(["v2.extend.objects.custom_loyalty"]);
    });
  });
});
