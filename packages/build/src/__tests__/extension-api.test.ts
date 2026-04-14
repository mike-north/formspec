import { describe, it, expect } from "vitest";
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
import { createExtensionRegistry } from "../extensions/index.js";
import { generateJsonSchemaFromIR } from "../json-schema/ir-generator.js";
import { validateIR } from "../validate/index.js";

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
      expect(props.amount).toMatchObject({
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
});
