import { describe, expect, it } from "vitest";
import { buildFormSchemas, writeSchemas } from "../src/index.js";
import { createExtensionRegistry, generateJsonSchemaFromIR } from "../src/internals.js";
import {
  defineAnnotation,
  defineConstraint,
  defineCustomType,
  defineExtension,
  IR_VERSION,
  type CustomAnnotationNode,
  type CustomConstraintNode,
  type CustomTypeNode,
  type FieldNode,
  type FormIR,
  type PrimitiveTypeNode,
  type Provenance,
} from "@formspec/core/internals";
import { field, formspec } from "@formspec/dsl";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const PROVENANCE: Provenance = {
  surface: "extension",
  file: "/project/src/extensions.ts",
  line: 1,
  column: 0,
};

const STRING_TYPE: PrimitiveTypeNode = {
  kind: "primitive",
  primitiveKind: "string",
};

function makeField(
  name: string,
  type: FieldNode["type"],
  constraints: FieldNode["constraints"] = [],
  annotations: FieldNode["annotations"] = []
): FieldNode {
  return {
    kind: "field",
    name,
    type,
    required: false,
    constraints,
    annotations,
    provenance: PROVENANCE,
  };
}

function makeIR(fields: readonly FieldNode[]): FormIR {
  return {
    kind: "form-ir",
    irVersion: IR_VERSION,
    elements: fields,
    typeRegistry: {},
    provenance: PROVENANCE,
  };
}

const moneyType = defineCustomType({
  typeName: "Money",
  toJsonSchema: (payload, vendorPrefix) => ({
    type: "string",
    [`${vendorPrefix}-money-scale`]: payload,
  }),
});

const currencyConstraint = defineConstraint({
  constraintName: "Currency",
  compositionRule: "override",
  applicableTypes: ["primitive", "custom"],
  toJsonSchema: (payload, vendorPrefix) => ({
    [`${vendorPrefix}-currency`]: payload,
  }),
});

const displayCurrencyAnnotation = defineAnnotation({
  annotationName: "DisplayCurrency",
  toJsonSchema: (value, vendorPrefix) => ({
    [`${vendorPrefix}-display-currency`]: value,
  }),
});

const uiOnlyAnnotation = defineAnnotation({
  annotationName: "UiHint",
});

const moneyExtension = defineExtension({
  extensionId: "x-stripe/money",
  types: [moneyType],
  constraints: [currencyConstraint],
  annotations: [displayCurrencyAnnotation, uiOnlyAnnotation],
});

function moneyTypeNode(payload: number): CustomTypeNode {
  return {
    kind: "custom",
    typeId: "x-stripe/money/Money",
    payload,
  };
}

function currencyConstraintNode(payload: string): CustomConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "custom",
    constraintId: "x-stripe/money/Currency",
    payload,
    compositionRule: "override",
    provenance: PROVENANCE,
  };
}

function displayCurrencyAnnotationNode(value: string): CustomAnnotationNode {
  return {
    kind: "annotation",
    annotationKind: "custom",
    annotationId: "x-stripe/money/DisplayCurrency",
    value,
    provenance: PROVENANCE,
  };
}

function uiOnlyAnnotationNode(value: string): CustomAnnotationNode {
  return {
    kind: "annotation",
    annotationKind: "custom",
    annotationId: "x-stripe/money/UiHint",
    value,
    provenance: PROVENANCE,
  };
}

describe("extension runtime integration", () => {
  it("emits custom types, constraints, and annotations through the public IR generator", () => {
    const registry = createExtensionRegistry([moneyExtension]);
    const schema = generateJsonSchemaFromIR(
      makeIR([
        makeField(
          "amount",
          moneyTypeNode(2),
          [currencyConstraintNode("USD")],
          [displayCurrencyAnnotationNode("USD")]
        ),
      ]),
      {
        extensionRegistry: registry,
        vendorPrefix: "x-stripe",
      }
    );

    expect(schema.properties?.["amount"]).toEqual({
      type: "string",
      "x-stripe-money-scale": 2,
      "x-stripe-currency": "USD",
      "x-stripe-display-currency": "USD",
    });
  });

  it("ignores custom annotations that do not define a JSON Schema representation", () => {
    const registry = createExtensionRegistry([moneyExtension]);
    const schema = generateJsonSchemaFromIR(
      makeIR([makeField("amount", moneyTypeNode(2), [], [uiOnlyAnnotationNode("money-input")])]),
      {
        extensionRegistry: registry,
        vendorPrefix: "x-stripe",
      }
    );

    expect(schema.properties?.["amount"]).toEqual({
      type: "string",
      "x-stripe-money-scale": 2,
    });
  });

  it("fails loudly when a custom type is generated without a matching extension registration", () => {
    expect(() => generateJsonSchemaFromIR(makeIR([makeField("amount", moneyTypeNode(2))]))).toThrow(
      'Cannot generate JSON Schema for custom type "x-stripe/money/Money" without a matching extension registration'
    );
  });

  it("fails loudly when a custom constraint is generated without a matching extension registration", () => {
    expect(() =>
      generateJsonSchemaFromIR(
        makeIR([makeField("currencyCode", STRING_TYPE, [currencyConstraintNode("USD")])])
      )
    ).toThrow(
      'Cannot generate JSON Schema for custom constraint "x-stripe/money/Currency" without a matching extension registration'
    );
  });

  it("fails loudly when a custom annotation is generated without a matching extension registration", () => {
    expect(() =>
      generateJsonSchemaFromIR(
        makeIR([makeField("currencyCode", STRING_TYPE, [], [displayCurrencyAnnotationNode("USD")])])
      )
    ).toThrow(
      'Cannot generate JSON Schema for custom annotation "x-stripe/money/DisplayCurrency" without a matching extension registration'
    );
  });

  it('defaults extension keyword prefixes to "x-formspec"', () => {
    const registry = createExtensionRegistry([moneyExtension]);
    const schema = generateJsonSchemaFromIR(makeIR([makeField("amount", moneyTypeNode(2))]), {
      extensionRegistry: registry,
    });

    expect(schema.properties?.["amount"]).toEqual({
      type: "string",
      "x-formspec-money-scale": 2,
    });
  });

  it('rejects vendor prefixes that do not start with "x-"', () => {
    const registry = createExtensionRegistry([moneyExtension]);

    expect(() =>
      generateJsonSchemaFromIR(makeIR([makeField("amount", moneyTypeNode(2))]), {
        extensionRegistry: registry,
        vendorPrefix: "stripe",
      })
    ).toThrow(
      'Invalid vendorPrefix "stripe". Extension JSON Schema keywords must start with "x-".'
    );
  });

  it("keeps buildFormSchemas usable for ordinary forms when public options are present", () => {
    const options = {
      vendorPrefix: "x-stripe",
    };
    const form = formspec(field.text("name", { label: "Name", required: true }));

    const { jsonSchema, uiSchema } = buildFormSchemas(form, options);

    expect(jsonSchema.properties?.["name"]).toEqual({
      type: "string",
      title: "Name",
    });
    expect(jsonSchema.required).toEqual(["name"]);
    expect(uiSchema.elements[0]).toEqual({
      type: "Control",
      scope: "#/properties/name",
      label: "Name",
    });
  });

  it("exports the extension registry surface from @formspec/build", () => {
    const registry = createExtensionRegistry([moneyExtension]);

    expect(registry.findType("x-stripe/money/Money")).toBe(moneyType);
    expect(registry.findConstraint("x-stripe/money/Currency")).toBe(currencyConstraint);
    expect(registry.findAnnotation("x-stripe/money/DisplayCurrency")).toBe(
      displayCurrencyAnnotation
    );
  });

  it("supports custom constraints on ordinary primitive fields through the public generator", () => {
    const registry = createExtensionRegistry([moneyExtension]);
    const schema = generateJsonSchemaFromIR(
      makeIR([makeField("currencyCode", STRING_TYPE, [currencyConstraintNode("USD")])]),
      {
        extensionRegistry: registry,
        vendorPrefix: "x-stripe",
      }
    );

    expect(schema.properties?.["currencyCode"]).toEqual({
      type: "string",
      "x-stripe-currency": "USD",
    });
  });

  it("passes public JSON Schema options through writeSchemas", () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-build-ext-"));

    try {
      const { jsonSchemaPath, uiSchemaPath } = writeSchemas(
        formspec(field.text("name", { label: "Name", required: true })),
        {
          outDir,
          name: "customer",
          vendorPrefix: "x-stripe",
        }
      );

      expect(path.basename(jsonSchemaPath)).toBe("customer-schema.json");
      expect(path.basename(uiSchemaPath)).toBe("customer-uischema.json");
      expect(fs.existsSync(jsonSchemaPath)).toBe(true);
      expect(fs.existsSync(uiSchemaPath)).toBe(true);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
