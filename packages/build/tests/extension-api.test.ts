import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import {
  defineExtension,
  defineCustomType,
  defineConstraint,
  defineConstraintTag,
  defineMetadataSlot,
  IR_VERSION,
} from "@formspec/core/internals";
import type {
  ExtensionDefinition,
  CustomTypeRegistration,
  CustomConstraintRegistration,
  FormIR,
  FieldNode,
  Provenance,
  CustomTypeNode,
  CustomConstraintNode,
  PrimitiveTypeNode,
} from "@formspec/core/internals";
import { createExtensionRegistry } from "../src/extensions/index.js";
import { generateJsonSchemaFromIR } from "../src/json-schema/ir-generator.js";
import { validateIR } from "../src/validate/index.js";
import { generateSchemas } from "../src/generators/class-schema.js";

// =============================================================================
// HELPERS
// =============================================================================

const FILE = "/project/src/form.ts";

/** Minimal provenance for test readability. */
function prov(line: number, tagName?: string): Provenance {
  if (tagName !== undefined) {
    return { surface: "extension", file: FILE, line, column: 0, tagName };
  }
  return { surface: "extension", file: FILE, line, column: 0 };
}

const NUMBER_TYPE: PrimitiveTypeNode = { kind: "primitive", primitiveKind: "number" };
const STRING_TYPE: PrimitiveTypeNode = { kind: "primitive", primitiveKind: "string" };

/** Build a minimal FieldNode. */
function makeField(
  name: string,
  type: FieldNode["type"],
  constraints: FieldNode["constraints"] = []
): FieldNode {
  return {
    kind: "field",
    name,
    type,
    required: false,
    constraints,
    annotations: [],
    provenance: prov(1),
  };
}

/** Build a minimal FormIR. */
function makeIR(fields: readonly FieldNode[]): FormIR {
  return {
    kind: "form-ir",
    irVersion: IR_VERSION,
    elements: fields,
    typeRegistry: {},
    provenance: prov(1),
  };
}

// =============================================================================
// FIXTURE EXTENSIONS
// =============================================================================

const decimalType: CustomTypeRegistration = defineCustomType({
  typeName: "Decimal",
  toJsonSchema: (_payload, vendorPrefix) => ({
    type: "string",
    [`${vendorPrefix}-decimal`]: true,
  }),
});

const currencyConstraint: CustomConstraintRegistration = defineConstraint({
  constraintName: "Currency",
  compositionRule: "override",
  applicableTypes: ["primitive"],
  toJsonSchema: (payload, vendorPrefix) => ({
    [`${vendorPrefix}-currency`]: payload,
  }),
});

const numericOnlyConstraint: CustomConstraintRegistration = defineConstraint({
  constraintName: "Precision",
  compositionRule: "intersect",
  applicableTypes: ["primitive"],
  toJsonSchema: (payload, vendorPrefix) => ({
    [`${vendorPrefix}-precision`]: payload,
  }),
});

const anyTypeConstraint: CustomConstraintRegistration = defineConstraint({
  constraintName: "Auditable",
  compositionRule: "intersect",
  applicableTypes: null,
  toJsonSchema: (_payload, vendorPrefix) => ({
    [`${vendorPrefix}-auditable`]: true,
  }),
});

const monetaryExtension: ExtensionDefinition = defineExtension({
  extensionId: "x-stripe/monetary",
  types: [decimalType],
  constraints: [currencyConstraint, numericOnlyConstraint, anyTypeConstraint],
  annotations: [
    {
      annotationName: "DisplayCurrency",
      toJsonSchema: (value, vendorPrefix) => ({
        [`${vendorPrefix}-display-currency`]: value,
      }),
    },
  ],
  vocabularyKeywords: [
    {
      keyword: "decimal",
      schema: { type: "boolean" },
    },
  ],
});

const precisionTag = defineConstraintTag({
  tagName: "maxSigFig",
  constraintName: "Precision",
  parseValue: (raw) => Number(raw.trim()),
});

const broadenedDecimalType = defineCustomType({
  typeName: "MoneyDecimal",
  tsTypeNames: ["MoneyDecimal", "bigint"],
  builtinConstraintBroadenings: [
    {
      tagName: "minimum",
      constraintName: "Currency",
      parseValue: (raw) => raw.trim(),
    },
  ],
  toJsonSchema: (_payload, vendorPrefix) => ({
    type: "string",
    [`${vendorPrefix}-money-decimal`]: true,
  }),
});

// =============================================================================
// TESTS
// =============================================================================

describe("Extension API", () => {
  // ---------------------------------------------------------------------------
  // 1. Factory functions
  // ---------------------------------------------------------------------------

  describe("defineExtension", () => {
    it("returns the same definition object (identity function)", () => {
      const def: ExtensionDefinition = {
        extensionId: "test/ext",
        types: [],
        constraints: [],
      };
      expect(defineExtension(def)).toBe(def);
    });

    it("accepts a minimal definition with only extensionId", () => {
      const def = defineExtension({ extensionId: "test/minimal" });
      expect(def.extensionId).toBe("test/minimal");
      expect(def.types).toBeUndefined();
      expect(def.constraints).toBeUndefined();
      expect(def.annotations).toBeUndefined();
      expect(def.vocabularyKeywords).toBeUndefined();
    });
  });

  describe("defineCustomType", () => {
    it("returns the same registration object", () => {
      expect(defineCustomType(decimalType)).toBe(decimalType);
    });

    it("preserves the toJsonSchema function", () => {
      const result = decimalType.toJsonSchema(null, "x-test");
      expect(result).toEqual({
        type: "string",
        "x-test-decimal": true,
      });
    });
  });

  describe("defineConstraint", () => {
    it("returns the same registration object", () => {
      expect(defineConstraint(currencyConstraint)).toBe(currencyConstraint);
    });

    it("preserves the toJsonSchema function", () => {
      const result = currencyConstraint.toJsonSchema("USD", "x-test");
      expect(result).toEqual({
        "x-test-currency": "USD",
      });
    });
  });

  describe("defineConstraintTag", () => {
    it("returns the same registration object", () => {
      expect(defineConstraintTag(precisionTag)).toBe(precisionTag);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Extension registry creation
  // ---------------------------------------------------------------------------

  describe("createExtensionRegistry", () => {
    it("creates a registry from a list of extensions", () => {
      const registry = createExtensionRegistry([monetaryExtension]);
      expect(registry.extensions).toHaveLength(1);
      expect(registry.extensions[0]).toBe(monetaryExtension);
    });

    it("creates an empty registry from an empty list", () => {
      const registry = createExtensionRegistry([]);
      expect(registry.extensions).toHaveLength(0);
    });

    it("rejects metadata slots that disable bare syntax without qualifiers", () => {
      expect(() =>
        createExtensionRegistry([
          defineExtension({
            extensionId: "x-acme/metadata",
            metadataSlots: [
              defineMetadataSlot({
                slotId: "invoiceLabel",
                tagName: "InvoiceLabel",
                declarationKinds: ["field"],
                allowBare: false,
              }),
            ],
          }),
        ])
      ).toThrow(
        'Metadata tag "@invoiceLabel" must allow bare usage or declare at least one qualifier.'
      );
    });

    it("rejects leading-case collisions between metadata tags and constraint tags", () => {
      expect(() =>
        createExtensionRegistry([
          defineExtension({
            extensionId: "x-acme/metadata",
            constraintTags: [
              defineConstraintTag({
                tagName: "Currency",
                constraintName: "Currency",
                parseValue: (raw) => raw,
              }),
            ],
            metadataSlots: [
              defineMetadataSlot({
                slotId: "currencyLabel",
                tagName: "currency",
                declarationKinds: ["field"],
              }),
            ],
          }),
        ])
      ).toThrow('Metadata tag "@currency" conflicts with existing FormSpec tag "@currency".');
    });

    it("throws on duplicate type IDs across extensions", () => {
      const ext1 = defineExtension({
        extensionId: "x-acme/foo",
        types: [decimalType],
      });
      const ext2 = defineExtension({
        extensionId: "x-acme/foo",
        types: [decimalType],
      });
      expect(() => createExtensionRegistry([ext1, ext2])).toThrow(
        'Duplicate custom type ID: "x-acme/foo/Decimal"'
      );
    });

    it("throws on duplicate constraint IDs across extensions", () => {
      const ext1 = defineExtension({
        extensionId: "x-acme/bar",
        constraints: [currencyConstraint],
      });
      const ext2 = defineExtension({
        extensionId: "x-acme/bar",
        constraints: [currencyConstraint],
      });
      expect(() => createExtensionRegistry([ext1, ext2])).toThrow(
        'Duplicate custom constraint ID: "x-acme/bar/Currency"'
      );
    });

    it("throws on duplicate annotation IDs across extensions", () => {
      const annotation = { annotationName: "Foo" };
      const ext1 = defineExtension({
        extensionId: "x-acme/baz",
        annotations: [annotation],
      });
      const ext2 = defineExtension({
        extensionId: "x-acme/baz",
        annotations: [annotation],
      });
      expect(() => createExtensionRegistry([ext1, ext2])).toThrow(
        'Duplicate custom annotation ID: "x-acme/baz/Foo"'
      );
    });

    it("allows the same type name across different extensions when TS source names do not collide", () => {
      const ext1 = defineExtension({
        extensionId: "x-acme/one",
        types: [defineCustomType({ ...decimalType, tsTypeNames: ["AcmeDecimalOne"] })],
      });
      const ext2 = defineExtension({
        extensionId: "x-acme/two",
        types: [defineCustomType({ ...decimalType, tsTypeNames: ["AcmeDecimalTwo"] })],
      });
      expect(() => createExtensionRegistry([ext1, ext2])).not.toThrow();
    });

    it("indexes extension-defined constraint tags and built-in broadenings", () => {
      const registry = createExtensionRegistry([
        defineExtension({
          extensionId: "x-acme/numeric",
          types: [broadenedDecimalType],
          constraints: [currencyConstraint, numericOnlyConstraint],
          constraintTags: [precisionTag],
        }),
      ]);

      expect(registry.findTypeByName("MoneyDecimal")).toEqual({
        extensionId: "x-acme/numeric",
        registration: broadenedDecimalType,
      });
      expect(registry.findTypeByName("bigint")).toEqual({
        extensionId: "x-acme/numeric",
        registration: broadenedDecimalType,
      });
      expect(registry.findConstraintTag("maxSigFig")).toEqual({
        extensionId: "x-acme/numeric",
        registration: precisionTag,
      });
      expect(
        registry.findBuiltinConstraintBroadening("x-acme/numeric/MoneyDecimal", "minimum")
      ).toEqual({
        extensionId: "x-acme/numeric",
        registration: broadenedDecimalType.builtinConstraintBroadenings?.[0],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Registry lookup
  // ---------------------------------------------------------------------------

  describe("registry lookup", () => {
    const registry = createExtensionRegistry([monetaryExtension]);

    describe("findType", () => {
      it("returns the registration for a known type ID", () => {
        const result = registry.findType("x-stripe/monetary/Decimal");
        expect(result).toBeDefined();
        expect(result?.typeName).toBe("Decimal");
      });

      it("returns undefined for an unknown type ID", () => {
        expect(registry.findType("x-stripe/monetary/Unknown")).toBeUndefined();
      });

      it("returns undefined for a completely unregistered prefix", () => {
        expect(registry.findType("x-other/pkg/Type")).toBeUndefined();
      });
    });

    describe("findConstraint", () => {
      it("returns the registration for a known constraint ID", () => {
        const result = registry.findConstraint("x-stripe/monetary/Currency");
        expect(result).toBeDefined();
        expect(result?.constraintName).toBe("Currency");
        expect(result?.compositionRule).toBe("override");
      });

      it("returns undefined for an unknown constraint ID", () => {
        expect(registry.findConstraint("x-stripe/monetary/Unknown")).toBeUndefined();
      });
    });

    describe("findAnnotation", () => {
      it("returns the registration for a known annotation ID", () => {
        const result = registry.findAnnotation("x-stripe/monetary/DisplayCurrency");
        expect(result).toBeDefined();
        expect(result?.annotationName).toBe("DisplayCurrency");
      });

      it("returns undefined for an unknown annotation ID", () => {
        expect(registry.findAnnotation("x-stripe/monetary/Unknown")).toBeUndefined();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. JSON Schema generation via custom type toJsonSchema
  // ---------------------------------------------------------------------------

  describe("custom type toJsonSchema", () => {
    it("generates JSON Schema from a custom type registration", () => {
      const registry = createExtensionRegistry([monetaryExtension]);
      const typeReg = registry.findType("x-stripe/monetary/Decimal");

      const schema = decimalType.toJsonSchema({ precision: 2 }, "x-stripe");
      expect(schema).toEqual({
        type: "string",
        "x-stripe-decimal": true,
      });

      // Verify the registry returns the same registration
      expect(typeReg).toBe(decimalType);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. JSON Schema generation via custom constraint toJsonSchema
  // ---------------------------------------------------------------------------

  describe("custom constraint toJsonSchema", () => {
    it("generates JSON Schema keywords from a custom constraint registration", () => {
      const registry = createExtensionRegistry([monetaryExtension]);
      const constraintReg = registry.findConstraint("x-stripe/monetary/Currency");

      const keywords = currencyConstraint.toJsonSchema("USD", "x-stripe");
      expect(keywords).toEqual({
        "x-stripe-currency": "USD",
      });

      // Verify the registry returns the same registration
      expect(constraintReg).toBe(currencyConstraint);
    });

    it("rejects non-vendor-prefixed JSON Schema keys from extension constraint hooks", () => {
      const unsafeConstraint = defineConstraint({
        constraintName: "UnsafeConstraint",
        compositionRule: "intersect",
        applicableTypes: ["primitive"],
        toJsonSchema: () => ({
          type: "number",
        }),
      });
      const registry = createExtensionRegistry([
        defineExtension({
          extensionId: "x-test/unsafe",
          constraints: [unsafeConstraint],
        }),
      ]);

      const customCon: CustomConstraintNode = {
        kind: "constraint",
        constraintKind: "custom",
        constraintId: "x-test/unsafe/UnsafeConstraint",
        payload: null,
        compositionRule: "intersect",
        provenance: prov(1, "UnsafeConstraint"),
      };

      const ir = makeIR([makeField("amount", NUMBER_TYPE, [customCon])]);

      expect(() =>
        generateJsonSchemaFromIR(ir, {
          extensionRegistry: registry,
          vendorPrefix: "x-test",
        })
      ).toThrow(/may only emit "x-test-\*" JSON Schema keywords/);
    });

    it("allows non-prefixed keywords when emitsVocabularyKeywords is true", () => {
      const vocabConstraint = defineConstraint({
        constraintName: "DecimalMinimum",
        compositionRule: "intersect",
        applicableTypes: ["custom"],
        emitsVocabularyKeywords: true,
        toJsonSchema: (payload) => ({
          decimalMinimum: payload,
        }),
      });
      const registry = createExtensionRegistry([
        defineExtension({
          extensionId: "x-test/decimal",
          types: [decimalType],
          constraints: [vocabConstraint],
        }),
      ]);

      const customType: CustomTypeNode = {
        kind: "custom",
        typeId: "x-test/decimal/Decimal",
        payload: null,
      };
      const customCon: CustomConstraintNode = {
        kind: "constraint",
        constraintKind: "custom",
        constraintId: "x-test/decimal/DecimalMinimum",
        payload: "0.01",
        compositionRule: "intersect",
        provenance: prov(1, "DecimalMinimum"),
      };

      const ir = makeIR([makeField("amount", customType, [customCon])]);
      const result = generateJsonSchemaFromIR(ir, {
        extensionRegistry: registry,
        vendorPrefix: "x-test",
      });

      const props = result.properties ?? {};
      expect(props["amount"]).toMatchObject({
        type: "string",
        "x-test-decimal": true,
        decimalMinimum: "0.01",
      });
    });

    it("still rejects non-prefixed keywords when emitsVocabularyKeywords is not set", () => {
      const nonVocabConstraint = defineConstraint({
        constraintName: "BadConstraint",
        compositionRule: "intersect",
        applicableTypes: ["primitive"],
        // no emitsVocabularyKeywords
        toJsonSchema: () => ({
          decimalMinimum: "0.01",
        }),
      });
      const registry = createExtensionRegistry([
        defineExtension({
          extensionId: "x-test/bad",
          constraints: [nonVocabConstraint],
        }),
      ]);

      const customCon: CustomConstraintNode = {
        kind: "constraint",
        constraintKind: "custom",
        constraintId: "x-test/bad/BadConstraint",
        payload: null,
        compositionRule: "intersect",
        provenance: prov(1, "BadConstraint"),
      };

      const ir = makeIR([makeField("amount", NUMBER_TYPE, [customCon])]);

      expect(() =>
        generateJsonSchemaFromIR(ir, {
          extensionRegistry: registry,
          vendorPrefix: "x-test",
        })
      ).toThrow(/may only emit "x-test-\*" JSON Schema keywords/);
    });

    it("rejects vocabulary constraints that emit standard numeric keywords", () => {
      const integerMinimum = defineConstraint({
        constraintName: "integerMinimum",
        compositionRule: "intersect",
        applicableTypes: ["custom"],
        emitsVocabularyKeywords: true,
        toJsonSchema: (payload) => ({ minimum: payload }),
      });
      const registry = createExtensionRegistry([
        defineExtension({
          extensionId: "x-test/integer",
          types: [decimalType],
          constraints: [integerMinimum],
        }),
      ]);

      const customType: CustomTypeNode = {
        kind: "custom",
        typeId: "x-test/integer/Decimal",
        payload: null,
      };
      const customCon: CustomConstraintNode = {
        kind: "constraint",
        constraintKind: "custom",
        constraintId: "x-test/integer/integerMinimum",
        payload: 0,
        compositionRule: "intersect",
        provenance: prov(1, "integerMinimum"),
      };

      const ir = makeIR([makeField("count", customType, [customCon])]);
      expect(() =>
        generateJsonSchemaFromIR(ir, {
          extensionRegistry: registry,
          vendorPrefix: "x-test",
        })
      ).toThrow(/must not overwrite standard JSON Schema keyword "minimum"/);
    });

    it("rejects vocabulary constraints that overwrite standard JSON Schema keywords", () => {
      const collidingConstraint = defineConstraint({
        constraintName: "Collider",
        compositionRule: "intersect",
        applicableTypes: ["custom"],
        emitsVocabularyKeywords: true,
        toJsonSchema: () => ({
          type: "number", // collides with the base schema's type: "string"
        }),
      });
      const registry = createExtensionRegistry([
        defineExtension({
          extensionId: "x-test/collide",
          types: [decimalType],
          constraints: [collidingConstraint],
        }),
      ]);

      const customType: CustomTypeNode = {
        kind: "custom",
        typeId: "x-test/collide/Decimal",
        payload: null,
      };
      const customCon: CustomConstraintNode = {
        kind: "constraint",
        constraintKind: "custom",
        constraintId: "x-test/collide/Collider",
        payload: null,
        compositionRule: "intersect",
        provenance: prov(1, "Collider"),
      };

      const ir = makeIR([makeField("amount", customType, [customCon])]);

      expect(() =>
        generateJsonSchemaFromIR(ir, {
          extensionRegistry: registry,
          vendorPrefix: "x-test",
        })
      ).toThrow(/must not overwrite standard JSON Schema keyword "type"/);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Validation with custom constraints
  // ---------------------------------------------------------------------------

  describe("validation with custom constraints", () => {
    it("passes validation when no extension registry is provided (custom constraints ignored)", () => {
      const customCon: CustomConstraintNode = {
        kind: "constraint",
        constraintKind: "custom",
        constraintId: "x-stripe/monetary/Currency",
        payload: "USD",
        compositionRule: "override",
        provenance: prov(1, "Currency"),
      };

      const ir = makeIR([makeField("amount", NUMBER_TYPE, [customCon])]);
      const result = validateIR(ir);

      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it("passes validation when custom constraint is applicable to the field type", () => {
      const registry = createExtensionRegistry([monetaryExtension]);

      const customCon: CustomConstraintNode = {
        kind: "constraint",
        constraintKind: "custom",
        constraintId: "x-stripe/monetary/Currency",
        payload: "USD",
        compositionRule: "override",
        provenance: prov(1, "Currency"),
      };

      const ir = makeIR([makeField("amount", NUMBER_TYPE, [customCon])]);
      const result = validateIR(ir, { extensionRegistry: registry });

      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it("emits TYPE_MISMATCH when custom constraint is not applicable to the field type", () => {
      // Create a constraint that only applies to array types
      const arrayOnlyConstraint = defineConstraint({
        constraintName: "ArrayOnly",
        compositionRule: "intersect",
        applicableTypes: ["array"],
        toJsonSchema: () => ({}),
      });

      const extWithArrayConstraint = defineExtension({
        extensionId: "x-test/arr",
        constraints: [arrayOnlyConstraint],
      });

      const regWithArray = createExtensionRegistry([extWithArrayConstraint]);

      const customCon: CustomConstraintNode = {
        kind: "constraint",
        constraintKind: "custom",
        constraintId: "x-test/arr/ArrayOnly",
        payload: null,
        compositionRule: "intersect",
        provenance: prov(1, "ArrayOnly"),
      };

      const ir = makeIR([makeField("name", STRING_TYPE, [customCon])]);
      const result = validateIR(ir, { extensionRegistry: regWithArray });

      expect(result.valid).toBe(false);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.code).toBe("TYPE_MISMATCH");
      expect(result.diagnostics[0]?.message).toContain("ArrayOnly");
      expect(result.diagnostics[0]?.message).toContain("string");
    });

    it("passes validation when custom constraint has applicableTypes: null (any type)", () => {
      const registry = createExtensionRegistry([monetaryExtension]);

      const customCon: CustomConstraintNode = {
        kind: "constraint",
        constraintKind: "custom",
        constraintId: "x-stripe/monetary/Auditable",
        payload: null,
        compositionRule: "intersect",
        provenance: prov(1, "Auditable"),
      };

      // Auditable has applicableTypes: null, so any type should work
      const customType: CustomTypeNode = {
        kind: "custom",
        typeId: "x-stripe/monetary/Decimal",
        payload: null,
      };

      const ir = makeIR([makeField("value", customType, [customCon])]);
      const result = validateIR(ir, { extensionRegistry: registry });

      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it("emits UNKNOWN_EXTENSION warning when constraintId is not in the registry", () => {
      const registry = createExtensionRegistry([monetaryExtension]);

      const customCon: CustomConstraintNode = {
        kind: "constraint",
        constraintKind: "custom",
        constraintId: "x-unknown/ext/UnknownConstraint",
        payload: null,
        compositionRule: "intersect",
        provenance: prov(1, "UnknownConstraint"),
      };

      const ir = makeIR([makeField("data", STRING_TYPE, [customCon])]);
      const result = validateIR(ir, { extensionRegistry: registry });

      expect(result.valid).toBe(true); // warning, not error
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.code).toBe("UNKNOWN_EXTENSION");
      expect(result.diagnostics[0]?.severity).toBe("warning");
    });

    it("silently skips custom constraints when no registry is provided", () => {
      const customCon: CustomConstraintNode = {
        kind: "constraint",
        constraintKind: "custom",
        constraintId: "x-unknown/ext/UnknownConstraint",
        payload: null,
        compositionRule: "intersect",
        provenance: prov(1, "UnknownConstraint"),
      };

      const ir = makeIR([makeField("data", STRING_TYPE, [customCon])]);
      const result = validateIR(ir);

      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Multiple extensions
  // ---------------------------------------------------------------------------

  describe("multiple extensions", () => {
    it("registers types from multiple extensions", () => {
      const ext1 = defineExtension({
        extensionId: "x-acme/ext1",
        types: [
          defineCustomType({
            typeName: "DateOnly",
            toJsonSchema: () => ({ type: "string", format: "date" }),
          }),
        ],
      });

      const ext2 = defineExtension({
        extensionId: "x-acme/ext2",
        types: [
          defineCustomType({
            typeName: "TimeOnly",
            toJsonSchema: () => ({ type: "string", format: "time" }),
          }),
        ],
      });

      const registry = createExtensionRegistry([ext1, ext2]);

      expect(registry.findType("x-acme/ext1/DateOnly")).toBeDefined();
      expect(registry.findType("x-acme/ext2/TimeOnly")).toBeDefined();
      expect(registry.findType("x-acme/ext1/TimeOnly")).toBeUndefined();
    });

    it("registers constraints from multiple extensions independently", () => {
      const ext1 = defineExtension({
        extensionId: "x-acme/ext1",
        constraints: [currencyConstraint],
      });

      const ext2 = defineExtension({
        extensionId: "x-acme/ext2",
        constraints: [numericOnlyConstraint],
      });

      const registry = createExtensionRegistry([ext1, ext2]);

      expect(registry.findConstraint("x-acme/ext1/Currency")).toBeDefined();
      expect(registry.findConstraint("x-acme/ext2/Precision")).toBeDefined();
      expect(registry.findConstraint("x-acme/ext1/Precision")).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Custom annotation toJsonSchema
  // ---------------------------------------------------------------------------

  describe("custom annotation toJsonSchema", () => {
    it("generates JSON Schema keywords from an annotation with toJsonSchema", () => {
      const registry = createExtensionRegistry([monetaryExtension]);
      const annotationReg = registry.findAnnotation("x-stripe/monetary/DisplayCurrency");
      expect(annotationReg).toBeDefined();
      expect(annotationReg?.toJsonSchema).toBeDefined();

      // Access toJsonSchema from the original extension definition to avoid non-null assertion
      const displayCurrencyAnnotation = monetaryExtension.annotations?.find(
        (a) => a.annotationName === "DisplayCurrency"
      );
      expect(displayCurrencyAnnotation?.toJsonSchema).toBeDefined();

      const keywords = displayCurrencyAnnotation?.toJsonSchema?.("USD", "x-stripe");
      expect(keywords).toEqual({
        "x-stripe-display-currency": "USD",
      });
    });

    it("handles annotations without toJsonSchema (UI-only)", () => {
      const uiOnlyExtension = defineExtension({
        extensionId: "x-test/ui",
        annotations: [{ annotationName: "UiHint" }],
      });

      const registry = createExtensionRegistry([uiOnlyExtension]);
      const annotationReg = registry.findAnnotation("x-test/ui/UiHint");
      expect(annotationReg).toBeDefined();
      expect(annotationReg?.toJsonSchema).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Vendor prefix passthrough
  // ---------------------------------------------------------------------------

  describe("vendor prefix passthrough", () => {
    it("passes vendor prefix through to type toJsonSchema", () => {
      const result = decimalType.toJsonSchema(null, "x-acme");
      expect(result).toEqual({
        type: "string",
        "x-acme-decimal": true,
      });
    });

    it("passes vendor prefix through to constraint toJsonSchema", () => {
      const result = currencyConstraint.toJsonSchema("EUR", "x-acme");
      expect(result).toEqual({
        "x-acme-currency": "EUR",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Brand-based type registration and detection
  // ---------------------------------------------------------------------------

  describe("brand-based type registration", () => {
    // -------------------------------------------------------------------------
    // 10a. Registry lookup by brand
    // -------------------------------------------------------------------------
    describe("findTypeByBrand", () => {
      it("returns the registration for a known brand", () => {
        const brandedType = defineCustomType({
          typeName: "Decimal",
          brand: "__decimalBrand",
          toJsonSchema: (_payload, vendorPrefix) => ({
            type: "string",
            [`${vendorPrefix}-decimal`]: true,
          }),
        });
        const registry = createExtensionRegistry([
          defineExtension({ extensionId: "x-test/branded", types: [brandedType] }),
        ]);

        // brand: "__decimalBrand" → registered under that identifier
        const result = registry.findTypeByBrand("__decimalBrand");
        expect(result).toBeDefined();
        expect(result?.extensionId).toBe("x-test/branded");
        expect(result?.registration).toBe(brandedType);
      });

      it("returns undefined for an unknown brand", () => {
        const registry = createExtensionRegistry([monetaryExtension]);
        // monetaryExtension has no brand registrations
        expect(registry.findTypeByBrand("__unknownBrand")).toBeUndefined();
      });

      it("returns undefined when no types are registered with brands", () => {
        const registry = createExtensionRegistry([]);
        expect(registry.findTypeByBrand("__anyBrand")).toBeUndefined();
      });
    });

    // -------------------------------------------------------------------------
    // 10b. Duplicate brand detection
    // -------------------------------------------------------------------------
    describe("duplicate brand", () => {
      it("throws when two types within the same extension share a brand", () => {
        const typeA = defineCustomType({
          typeName: "TypeA",
          brand: "__sharedBrand",
          toJsonSchema: () => ({ type: "string" }),
        });
        const typeB = defineCustomType({
          typeName: "TypeB",
          brand: "__sharedBrand",
          toJsonSchema: () => ({ type: "number" }),
        });
        expect(() =>
          createExtensionRegistry([
            defineExtension({ extensionId: "x-test/dup", types: [typeA, typeB] }),
          ])
        ).toThrow('Duplicate custom type brand: "__sharedBrand"');
      });

      it("throws when two types across different extensions share a brand", () => {
        const typeA = defineCustomType({
          typeName: "TypeA",
          brand: "__sharedBrand",
          toJsonSchema: () => ({ type: "string" }),
        });
        const typeB = defineCustomType({
          typeName: "TypeB",
          brand: "__sharedBrand",
          toJsonSchema: () => ({ type: "number" }),
        });
        expect(() =>
          createExtensionRegistry([
            defineExtension({ extensionId: "x-test/ext1", types: [typeA] }),
            defineExtension({ extensionId: "x-test/ext2", types: [typeB] }),
          ])
        ).toThrow('Duplicate custom type brand: "__sharedBrand"');
      });
    });

    it("rejects the reserved __integerBrand", () => {
      const integerType = defineCustomType({
        typeName: "MyInteger",
        brand: "__integerBrand",
        toJsonSchema: () => ({ type: "integer" }),
      });
      expect(() =>
        createExtensionRegistry([
          defineExtension({ extensionId: "x-test/reserved", types: [integerType] }),
        ])
      ).toThrow(/reserved for the builtin Integer type/);
    });

    // -------------------------------------------------------------------------
    // 10c. Brand-based schema generation (integration test with real TS program)
    //
    // The fixture defines a `unique symbol` brand and uses it as a computed
    // property key in a branded intersection type. The extension registers the
    // type with `brand: "__testBrand"`. The class-analyzer must detect the brand
    // structurally (via property declarations) and resolve the field to the
    // correct custom type, emitting `{ type: "string", format: "test" }`.
    // -------------------------------------------------------------------------
    describe("brand detection in schema generation", () => {
      let tmpDir: string;
      let fixturePath: string;

      beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-brand-detection-"));

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

        const fixtureSource = [
          "declare const __testBrand: unique symbol;",
          "type TestBranded = string & { readonly [__testBrand]: true };",
          "",
          "export interface Config {",
          "  field: TestBranded;",
          "}",
        ].join("\n");

        fixturePath = path.join(tmpDir, "fixture.ts");
        fs.writeFileSync(fixturePath, fixtureSource);
      });

      afterAll(() => {
        if (fs.existsSync(tmpDir)) {
          fs.rmSync(tmpDir, { recursive: true });
        }
      });

      it("resolves a brand-registered custom type to its JSON Schema via brand detection", () => {
        // Register the type using the brand identifier that matches the unique symbol
        // declared in the fixture source. The brand-based resolver checks for a
        // computed property named `__testBrand` on the intersection type.
        // spec: class-analyzer §resolveBrandedCustomType → custom type IR node
        const testBrandedType = defineCustomType({
          typeName: "TestBranded",
          brand: "__testBrand",
          toJsonSchema: () => ({ type: "string", format: "test" }),
        });
        const registry = createExtensionRegistry([
          defineExtension({ extensionId: "x-test/branded", types: [testBrandedType] }),
        ]);

        const result = generateSchemas({
          filePath: fixturePath,
          typeName: "Config",
          errorReporting: "throw",
          extensionRegistry: registry,
          vendorPrefix: "x-test",
        });

        // The field `field: TestBranded` must resolve via brand detection to
        // the registered custom type, which emits `{ type: "string", format: "test" }`.
        const properties = result.jsonSchema.properties as Record<string, unknown>;
        expect(properties["field"]).toMatchObject({
          type: "string", // per toJsonSchema above
          format: "test", // per toJsonSchema above
        });
      });

      it("falls back to name-based detection when the brand is unregistered", () => {
        // The fixture type is still structurally branded, but this registration
        // only exposes a TS-facing type name. Resolution must still succeed via
        // `tsTypeNames` even though there is no brand registration.
        const nameOnlyType = defineCustomType({
          typeName: "RegisteredByName",
          tsTypeNames: ["TestBranded"],
          toJsonSchema: () => ({ type: "string", format: "name-fallback" }),
        });
        const registry = createExtensionRegistry([
          defineExtension({ extensionId: "x-test/name-only", types: [nameOnlyType] }),
        ]);

        const result = generateSchemas({
          filePath: fixturePath,
          typeName: "Config",
          errorReporting: "throw",
          extensionRegistry: registry,
          vendorPrefix: "x-test",
        });

        const properties = result.jsonSchema.properties as Record<string, unknown>;
        expect(properties["field"]).toMatchObject({
          type: "string",
          format: "name-fallback",
        });
      });
    });

    // -------------------------------------------------------------------------
    // 10d. Brand takes priority over name when name doesn't match
    //
    // Register a type with `brand` only (no `tsTypeNames`). Import it under an
    // alias so the name-based lookup would fail. Verify brand detection succeeds.
    // -------------------------------------------------------------------------
    describe("brand detection works regardless of import alias", () => {
      let tmpDir: string;
      let fixturePath: string;

      beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-brand-alias-"));

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

        fs.writeFileSync(
          path.join(tmpDir, "branded-types.ts"),
          [
            "declare const __aliasBrand: unique symbol;",
            "export type SourceBranded = string & { readonly [__aliasBrand]: true };",
          ].join("\n")
        );

        // The consuming file imports the branded type under an alias that does
        // not match the registered type name. Name-based lookup would fail.
        const fixtureSource = [
          'import type { SourceBranded as AliasedBranded } from "./branded-types.js";',
          "",
          "export interface AliasConfig {",
          "  field: AliasedBranded;",
          "}",
        ].join("\n");

        fixturePath = path.join(tmpDir, "fixture.ts");
        fs.writeFileSync(fixturePath, fixtureSource);
      });

      afterAll(() => {
        if (fs.existsSync(tmpDir)) {
          fs.rmSync(tmpDir, { recursive: true });
        }
      });

      it("detects brand through an imported alias when the registered typeName differs", () => {
        // "RegisteredBranded" does not match the imported alias "AliasedBranded",
        // so the new brand-based path must succeed for the field to resolve.
        // spec: class-analyzer §resolveBrandedCustomType → works with aliased imports
        const registeredType = defineCustomType({
          typeName: "RegisteredBranded",
          brand: "__aliasBrand",
          toJsonSchema: () => ({ type: "string", format: "alias-test" }),
        });
        const registry = createExtensionRegistry([
          defineExtension({ extensionId: "x-test/alias", types: [registeredType] }),
        ]);

        const result = generateSchemas({
          filePath: fixturePath,
          typeName: "AliasConfig",
          errorReporting: "throw",
          extensionRegistry: registry,
          vendorPrefix: "x-test",
        });

        const properties = result.jsonSchema.properties as Record<string, unknown>;
        // Brand detection resolves to "RegisteredBranded" via the __aliasBrand symbol,
        // which emits { type: "string", format: "alias-test" }.
        expect(properties["field"]).toMatchObject({
          type: "string",
          format: "alias-test",
        });
      });
    });

    // -------------------------------------------------------------------------
    // 10e. Type without brand still works via tsTypeNames
    // -------------------------------------------------------------------------
    describe("name-based fallback still works when no brand is provided", () => {
      it("resolves a type without brand via tsTypeNames", () => {
        // decimalType has no brand; it should still be findable by name
        const registry = createExtensionRegistry([monetaryExtension]);

        // Name-based lookup must still work — brand field is undefined
        const result = registry.findTypeByName("Decimal");
        expect(result).toBeDefined();
        expect(result?.extensionId).toBe("x-stripe/monetary");
        expect(result?.registration).toBe(decimalType);

        // Brand lookup for a name the type was not registered with must return undefined
        expect(registry.findTypeByBrand("Decimal")).toBeUndefined();
      });
    });

    // -------------------------------------------------------------------------
    // 10f. Edge cases for brand detection robustness
    // -------------------------------------------------------------------------
    describe("brand detection edge cases", () => {
      it("does not match a string-keyed property with the same name as a registered brand", () => {
        // If someone writes `type Bad = string & { __testBrand: true }` (string key,
        // not [__testBrand] computed key), brand detection must NOT fire.
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-string-key-"));

        try {
          const fixturePath = path.join(tmpDir, "string-key-brand.ts");
          fs.writeFileSync(
            fixturePath,
            [
              "// String-keyed property — NOT a computed symbol key",
              "type FakeBranded = string & { __fakeBrand: true };",
              "",
              "export interface FakeConfig {",
              "  field: FakeBranded;",
              "}",
            ].join("\n")
          );

          const fakeType = defineCustomType({
            typeName: "Fake",
            brand: "__fakeBrand",
            toJsonSchema: () => ({ type: "string", format: "fake" }),
          });
          const registry = createExtensionRegistry([
            defineExtension({ extensionId: "x-test/fake", types: [fakeType] }),
          ]);

          const result = generateSchemas({
            filePath: fixturePath,
            typeName: "FakeConfig",
            errorReporting: "throw",
            extensionRegistry: registry,
            vendorPrefix: "x-test",
          });

          const properties = result.jsonSchema.properties as Record<string, unknown>;
          // String-keyed __fakeBrand is NOT a computed property name,
          // so brand detection must not fire
          expect(properties["field"]).not.toMatchObject({ format: "fake" });
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      });

      it("keeps scanning computed symbol keys until it finds a registered brand", () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-multiple-symbols-"));

        try {
          const fixturePath = path.join(tmpDir, "multiple-symbol-brands.ts");
          fs.writeFileSync(
            fixturePath,
            [
              "declare const __otherBrand: unique symbol;",
              "declare const __realBrand: unique symbol;",
              "type MultiBranded = string & { readonly [__otherBrand]: true; readonly [__realBrand]: true };",
              "",
              "export interface MultiBrandConfig {",
              "  field: MultiBranded;",
              "}",
            ].join("\n")
          );

          const registeredType = defineCustomType({
            typeName: "RegisteredBranded",
            brand: "__realBrand",
            toJsonSchema: () => ({ type: "string", format: "multi-brand" }),
          });
          const registry = createExtensionRegistry([
            defineExtension({ extensionId: "x-test/multi-brand", types: [registeredType] }),
          ]);

          const result = generateSchemas({
            filePath: fixturePath,
            typeName: "MultiBrandConfig",
            errorReporting: "throw",
            extensionRegistry: registry,
            vendorPrefix: "x-test",
          });

          const properties = result.jsonSchema.properties as Record<string, unknown>;
          expect(properties["field"]).toMatchObject({
            type: "string",
            format: "multi-brand",
          });
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      });

      it("prefers the name-based registration when name and brand could both match", () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-dual-"));

        try {
          const fixturePath = path.join(tmpDir, "dual-registration.ts");
          fs.writeFileSync(
            fixturePath,
            [
              "declare const __dualBrand: unique symbol;",
              "type DualType = string & { readonly [__dualBrand]: true };",
              "",
              "export interface DualConfig {",
              "  field: DualType;",
              "}",
            ].join("\n")
          );

          const nameMatchedType = defineCustomType({
            typeName: "NameMatchedType",
            tsTypeNames: ["DualType"],
            toJsonSchema: () => ({ type: "string", format: "name-wins" }),
          });
          const brandMatchedType = defineCustomType({
            typeName: "BrandMatchedType",
            brand: "__dualBrand",
            toJsonSchema: () => ({ type: "string", format: "brand-wins" }),
          });
          const registry = createExtensionRegistry([
            defineExtension({
              extensionId: "x-test/dual",
              types: [nameMatchedType, brandMatchedType],
            }),
          ]);

          const result = generateSchemas({
            filePath: fixturePath,
            typeName: "DualConfig",
            errorReporting: "throw",
            extensionRegistry: registry,
            vendorPrefix: "x-test",
          });

          const properties = result.jsonSchema.properties as Record<string, unknown>;
          // If brand resolution ran first, this would emit `brand-wins` instead.
          expect(properties["field"]).toMatchObject({
            type: "string",
            format: "name-wins",
          });
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      });
    });
  });
});
