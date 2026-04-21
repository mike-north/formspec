/**
 * Regression tests for GitHub issue #358: `@defaultValue` literals on
 * custom-type fields are emitted as-is, producing JSON Schema whose `default`
 * keyword does not conform to the schema's `type`.
 *
 * Example of the pre-fix bug:
 *
 * ```ts
 * /**
 *  * @defaultValue 9.99
 *  *\/
 * price: Decimal;
 * ```
 *
 * produced `{ type: "string", ..., default: 9.99 }` — a numeric `default` on a
 * string-typed schema. The fix coerces the parsed literal through the
 * custom-type registration (explicit `serializeDefault` hook when present,
 * inferred from `toJsonSchema`'s output `type` otherwise).
 *
 * @see https://github.com/mike-north/formspec/issues/358
 */

import { describe, expect, it } from "vitest";
import type {
  FormIR,
  FieldNode,
  AnnotationNode,
  Provenance,
  CustomTypeRegistration,
  ObjectProperty,
  TypeDefinition,
} from "@formspec/core/internals";
import { IR_VERSION, defineCustomType, defineExtension } from "@formspec/core/internals";
import { generateJsonSchemaFromIR } from "../json-schema/ir-generator.js";
import { createExtensionRegistry } from "../extensions/index.js";

// =============================================================================
// HELPERS
// =============================================================================

const PROVENANCE: Provenance = {
  surface: "chain-dsl",
  file: "/test.ts",
  line: 1,
  column: 0,
};

const EXTENSION_ID = "x-test/numeric";
const DECIMAL_TYPE_ID = `${EXTENSION_ID}/Decimal`;

const defaultValueAnnotation = (value: unknown): AnnotationNode => ({
  kind: "annotation",
  annotationKind: "defaultValue",
  value,
  provenance: PROVENANCE,
});

function makeDecimalField(name: string, annotations: readonly AnnotationNode[]): FieldNode {
  return {
    kind: "field",
    name,
    type: {
      kind: "custom",
      typeId: DECIMAL_TYPE_ID,
      payload: null,
    },
    required: false,
    constraints: [],
    annotations,
    provenance: PROVENANCE,
  };
}

function makeIR(fields: FieldNode[]): FormIR {
  return {
    kind: "form-ir",
    irVersion: IR_VERSION,
    elements: fields,
    typeRegistry: {},
    provenance: PROVENANCE,
  };
}

/**
 * A Decimal-like custom type that emits `{ type: "string" }` — mirrors the
 * real-world extension described in issue #358. Uses inference (no
 * `serializeDefault` hook) so the test also exercises the fallback path.
 */
const inferredDecimalType: CustomTypeRegistration = defineCustomType({
  typeName: "Decimal",
  toJsonSchema: (_payload, vendorPrefix) => ({
    type: "string",
    format: "decimal",
    [`${vendorPrefix}-decimal`]: true,
  }),
});

/**
 * A Decimal-like custom type with an explicit `serializeDefault` hook that
 * formats numbers with a trailing `.00` — used to verify the hook takes
 * precedence over inference.
 */
const explicitDecimalType: CustomTypeRegistration = defineCustomType({
  typeName: "Decimal",
  toJsonSchema: (_payload, vendorPrefix) => ({
    type: "string",
    [`${vendorPrefix}-decimal`]: true,
  }),
  serializeDefault: (parsed) => {
    if (typeof parsed === "number") {
      return parsed.toFixed(2);
    }
    if (typeof parsed === "string") {
      return parsed;
    }
    throw new Error(`Unsupported @defaultValue literal for Decimal: ${String(parsed)}`);
  },
});

function registryWith(type: CustomTypeRegistration) {
  return createExtensionRegistry([defineExtension({ extensionId: EXTENSION_ID, types: [type] })]);
}

// =============================================================================
// TESTS
// =============================================================================

describe("issue #358: @defaultValue coercion for custom-type fields", () => {
  describe("inference fallback (no serializeDefault hook)", () => {
    it("stringifies a numeric @defaultValue when the custom type emits type: 'string'", () => {
      // BUG #358: produced `default: 9.99` (number) on a string-typed schema.
      // FIX: coerce to the string "9.99" so default conforms to the schema.
      const ir = makeIR([makeDecimalField("price", [defaultValueAnnotation(9.99)])]);
      const schema = generateJsonSchemaFromIR(ir, {
        extensionRegistry: registryWith(inferredDecimalType),
      });
      const prop = (schema.properties as Record<string, unknown>)["price"] as Record<
        string,
        unknown
      >;

      expect(prop["type"]).toBe("string");
      expect(prop["default"]).toBe("9.99");
      // Regression guard: never emit a raw number default on a string-typed schema.
      expect(typeof prop["default"]).toBe("string");
    });

    it("stringifies a boolean @defaultValue when the custom type emits type: 'string'", () => {
      const ir = makeIR([makeDecimalField("flag", [defaultValueAnnotation(true)])]);
      const schema = generateJsonSchemaFromIR(ir, {
        extensionRegistry: registryWith(inferredDecimalType),
      });
      const prop = (schema.properties as Record<string, unknown>)["flag"] as Record<
        string,
        unknown
      >;

      expect(prop["default"]).toBe("true");
    });

    it("leaves string @defaultValue unchanged when the custom type already emits type: 'string'", () => {
      const ir = makeIR([makeDecimalField("price", [defaultValueAnnotation("9.99")])]);
      const schema = generateJsonSchemaFromIR(ir, {
        extensionRegistry: registryWith(inferredDecimalType),
      });
      const prop = (schema.properties as Record<string, unknown>)["price"] as Record<
        string,
        unknown
      >;

      expect(prop["default"]).toBe("9.99");
    });

    it("passes null @defaultValue through unchanged even for string-typed custom types", () => {
      // null is a distinct JSON value; coercion into "null" would be wrong.
      const ir = makeIR([makeDecimalField("price", [defaultValueAnnotation(null)])]);
      const schema = generateJsonSchemaFromIR(ir, {
        extensionRegistry: registryWith(inferredDecimalType),
      });
      const prop = (schema.properties as Record<string, unknown>)["price"] as Record<
        string,
        unknown
      >;

      expect(prop["default"]).toBeNull();
    });

    it("stringifies a bigint @defaultValue when the custom type emits type: 'string'", () => {
      // Covers the `typeof value === "bigint"` branch of the inference fallback.
      const ir = makeIR([makeDecimalField("price", [defaultValueAnnotation(9n)])]);
      const schema = generateJsonSchemaFromIR(ir, {
        extensionRegistry: registryWith(inferredDecimalType),
      });
      const prop = (schema.properties as Record<string, unknown>)["price"] as Record<
        string,
        unknown
      >;

      expect(prop["default"]).toBe("9");
    });

    it.each([
      ["NaN", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
      ["-Infinity", Number.NEGATIVE_INFINITY],
    ])("passes non-finite number %s through unchanged (no String() coercion)", (_label, value) => {
      // JSON cannot represent NaN/Infinity; stringifying to "NaN"/"Infinity"
      // would silently mask an authoring mistake. Pass through so downstream
      // validation surfaces the issue.
      const ir = makeIR([makeDecimalField("price", [defaultValueAnnotation(value)])]);
      const schema = generateJsonSchemaFromIR(ir, {
        extensionRegistry: registryWith(inferredDecimalType),
      });
      const prop = (schema.properties as Record<string, unknown>)["price"] as Record<
        string,
        unknown
      >;

      expect(prop["default"]).toBe(value);
      expect(typeof prop["default"]).toBe("number");
    });

    it("coerces @defaultValue on a custom-typed property inside field.object()", () => {
      // Exercises the `generatePropertySchema` code path (ObjectProperty
      // annotations flow through the same `applyAnnotations` → coerceDefaultValue
      // pipeline as top-level fields).
      const priceProperty: ObjectProperty = {
        name: "price",
        type: { kind: "custom", typeId: DECIMAL_TYPE_ID, payload: null },
        optional: false,
        constraints: [],
        annotations: [defaultValueAnnotation(9.99)],
        provenance: PROVENANCE,
      };
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          {
            kind: "field",
            name: "line",
            type: {
              kind: "object",
              properties: [priceProperty],
              additionalProperties: true,
            },
            required: false,
            constraints: [],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        typeRegistry: {},
        provenance: PROVENANCE,
      };
      const schema = generateJsonSchemaFromIR(ir, {
        extensionRegistry: registryWith(inferredDecimalType),
      });
      const lineProp = (schema.properties as Record<string, unknown>)["line"] as {
        properties: Record<string, Record<string, unknown>>;
      };
      const price = lineProp.properties["price"];

      expect(price?.["type"]).toBe("string");
      expect(price?.["default"]).toBe("9.99");
    });

    it("coerces @defaultValue on a named type registered in typeRegistry", () => {
      // Exercises the typeDef path in generateJsonSchemaFromIR where
      // applyAnnotations is invoked against the registered $defs entry.
      const typeDef: TypeDefinition = {
        name: "Price",
        type: { kind: "custom", typeId: DECIMAL_TYPE_ID, payload: null },
        annotations: [defaultValueAnnotation(9.99)],
        provenance: PROVENANCE,
      };
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [],
        typeRegistry: { Price: typeDef },
        provenance: PROVENANCE,
      };
      const schema = generateJsonSchemaFromIR(ir, {
        extensionRegistry: registryWith(inferredDecimalType),
      });
      const defs = schema.$defs as Record<string, Record<string, unknown>>;

      expect(defs["Price"]?.["type"]).toBe("string");
      expect(defs["Price"]?.["default"]).toBe("9.99");
    });
  });

  describe("explicit serializeDefault hook", () => {
    it("delegates coercion to the custom type's serializeDefault hook when present", () => {
      const ir = makeIR([makeDecimalField("price", [defaultValueAnnotation(9.5)])]);
      const schema = generateJsonSchemaFromIR(ir, {
        extensionRegistry: registryWith(explicitDecimalType),
      });
      const prop = (schema.properties as Record<string, unknown>)["price"] as Record<
        string,
        unknown
      >;

      // The hook formats to 2 decimal places — inference would only produce
      // "9.5", proving the hook runs and takes precedence.
      expect(prop["default"]).toBe("9.50");
    });
  });

  describe("non-custom types", () => {
    it("does not coerce @defaultValue on primitive fields", () => {
      // Sanity: pre-existing behavior for plain primitives is preserved —
      // a numeric default on a number-typed field remains a number.
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          {
            kind: "field",
            name: "count",
            type: { kind: "primitive", primitiveKind: "number" },
            required: false,
            constraints: [],
            annotations: [defaultValueAnnotation(42)],
            provenance: PROVENANCE,
          },
        ],
        typeRegistry: {},
        provenance: PROVENANCE,
      };
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["count"] as Record<
        string,
        unknown
      >;

      expect(prop["default"]).toBe(42);
    });
  });
});
