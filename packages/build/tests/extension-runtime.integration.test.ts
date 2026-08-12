import { describe, expect, it } from "vitest";
import { buildFormSchemas, writeSchemas } from "../src/index.js";
import { createExtensionRegistry, generateJsonSchemaFromIR } from "../src/internals.js";
import {
  defineAnnotation,
  defineConstraint,
  defineConstraintTag,
  defineCustomType,
  defineExtension,
} from "@formspec/core";
import {
  IR_VERSION,
  type CustomAnnotationNode,
  type CustomConstraintNode,
  type FormIR,
  type CustomTypeNode,
  type FieldNode,
  type PrimitiveTypeNode,
  type TypeNode,
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
function makeIR(fields: readonly FieldNode[], typeRegistry: FormIR["typeRegistry"] = {}): FormIR {
  return {
    kind: "form-ir",
    irVersion: IR_VERSION,
    elements: fields,
    typeRegistry,
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

const arrayMarkerConstraint = defineConstraint({
  constraintName: "ArrayMarker",
  compositionRule: "override",
  applicableTypes: ["array"],
  toJsonSchema: (payload, vendorPrefix) => ({ [`${vendorPrefix}-array-marker`]: payload }),
});

const arrayMarkerTag = defineConstraintTag({
  tagName: "arrayMarker",
  constraintName: "ArrayMarker",
  parseValue: (raw) => raw,
});

const arrayMarkerExtension = defineExtension({
  extensionId: "x-test/array-marker",
  constraints: [arrayMarkerConstraint],
  constraintTags: [arrayMarkerTag],
});

const universalMarkerConstraint = defineConstraint({
  constraintName: "UniversalMarker",
  compositionRule: "override",
  applicableTypes: null,
  toJsonSchema: (payload, vendorPrefix) => ({ [`${vendorPrefix}-universal-marker`]: payload }),
});

const universalMarkerTag = defineConstraintTag({
  tagName: "universalMarker",
  constraintName: "UniversalMarker",
  parseValue: (raw) => raw,
});

const universalItemMarkerTag = defineConstraintTag({
  tagName: "universalItemMarker",
  constraintName: "UniversalMarker",
  parseValue: (raw) => raw,
  isApplicableToType: (type) => type.kind === "primitive",
});

const universalMarkerExtension = defineExtension({
  extensionId: "x-test/universal-marker",
  constraints: [universalMarkerConstraint],
  constraintTags: [universalMarkerTag, universalItemMarkerTag],
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

function arrayMarkerConstraintNode(
  payload: string,
  path?: readonly string[]
): CustomConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "custom",
    constraintId: "x-test/array-marker/ArrayMarker",
    payload,
    compositionRule: "override",
    provenance: { ...PROVENANCE, tagName: "@arrayMarker" },
    ...(path === undefined ? {} : { path: { segments: path } }),
  };
}

function universalMarkerConstraintNode(
  payload: string,
  tagName = "@universalMarker"
): CustomConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "custom",
    constraintId: "x-test/universal-marker/UniversalMarker",
    payload,
    compositionRule: "override",
    provenance: { ...PROVENANCE, tagName },
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

  it("emits custom constraints on array item schemas", () => {
    const registry = createExtensionRegistry([moneyExtension]);
    const schema = generateJsonSchemaFromIR(
      makeIR([
        makeField("currencyCodes", { kind: "array", items: STRING_TYPE }, [
          currencyConstraintNode("USD"),
        ]),
      ]),
      {
        extensionRegistry: registry,
        vendorPrefix: "x-stripe",
      }
    );

    expect(schema.properties?.["currencyCodes"]).toEqual({
      type: "array",
      items: { type: "string", "x-stripe-currency": "USD" },
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

  it("rejects vendor prefixes that cannot produce well-formed extension keys", () => {
    const registry = createExtensionRegistry([moneyExtension]);

    expect(() =>
      generateJsonSchemaFromIR(makeIR([makeField("amount", moneyTypeNode(2))]), {
        extensionRegistry: registry,
        vendorPrefix: "stripe",
      })
    ).toThrow(
      'Invalid vendorPrefix "stripe". Extension JSON Schema vendor prefixes must match /^x-[a-z0-9]+(-[a-z0-9]+)*$/.'
    );
    expect(() =>
      generateJsonSchemaFromIR(makeIR([makeField("amount", moneyTypeNode(2))]), {
        extensionRegistry: registry,
        vendorPrefix: "x-Stripe",
      })
    ).toThrow(
      'Invalid vendorPrefix "x-Stripe". Extension JSON Schema vendor prefixes must match /^x-[a-z0-9]+(-[a-z0-9]+)*$/.'
    );
  });

  it("accepts a multi-segment vendor prefix (#545 — x-stripe-billing style prefixes)", () => {
    const registry = createExtensionRegistry([moneyExtension]);

    const schema = generateJsonSchemaFromIR(makeIR([makeField("amount", moneyTypeNode(2))]), {
      extensionRegistry: registry,
      vendorPrefix: "x-stripe-billing",
    });

    expect(schema.properties?.["amount"]).toEqual({
      type: "string",
      "x-stripe-billing-money-scale": 2,
    });
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
  it("places an array-only custom constraint on the direct array container", () => {
    const registry = createExtensionRegistry([arrayMarkerExtension]);
    const schema = generateJsonSchemaFromIR(
      makeIR([
        makeField("values", { kind: "array", items: STRING_TYPE }, [
          arrayMarkerConstraintNode("yes"),
        ]),
      ]),
      { extensionRegistry: registry, vendorPrefix: "x-test" }
    );
    expect(schema.properties?.["values"]).toEqual({
      type: "array",
      items: { type: "string" },
      "x-test-array-marker": "yes",
    });
  });

  it("places a universally applicable custom constraint on the array container", () => {
    const registry = createExtensionRegistry([universalMarkerExtension]);
    const schema = generateJsonSchemaFromIR(
      makeIR([
        makeField("values", { kind: "array", items: STRING_TYPE }, [
          universalMarkerConstraintNode("yes"),
        ]),
      ]),
      { extensionRegistry: registry, vendorPrefix: "x-test" }
    );

    expect(schema.properties?.["values"]).toEqual({
      type: "array",
      items: { type: "string" },
      "x-test-universal-marker": "yes",
    });
  });

  it("normalizes the governing tag before placing an array constraint", () => {
    const registry = createExtensionRegistry([universalMarkerExtension]);
    const schema = generateJsonSchemaFromIR(
      makeIR([
        makeField("values", { kind: "array", items: STRING_TYPE }, [
          universalMarkerConstraintNode("yes", "@UniversalItemMarker"),
        ]),
      ]),
      { extensionRegistry: registry, vendorPrefix: "x-test" }
    );

    expect(schema.properties?.["values"]).toEqual({
      type: "array",
      items: { type: "string", "x-test-universal-marker": "yes" },
    });
  });

  it("places an array-only custom constraint on a path-targeted array property", () => {
    const registry = createExtensionRegistry([arrayMarkerExtension]);
    const objectType: TypeNode = {
      kind: "object",
      properties: [
        {
          optional: false,
          provenance: PROVENANCE,
          name: "values",
          type: { kind: "array", items: STRING_TYPE },
          constraints: [],
          annotations: [],
        },
      ],
    };
    const schema = generateJsonSchemaFromIR(
      makeIR([makeField("payload", objectType, [arrayMarkerConstraintNode("yes", ["values"])])]),
      { extensionRegistry: registry, vendorPrefix: "x-test" }
    );
    expect(schema.properties?.["payload"]?.properties?.["values"]).toEqual({
      type: "array",
      items: { type: "string" },
      "x-test-array-marker": "yes",
    });
  });
  it("routes a path constraint through referenced and nullable-referenced arrays into items", () => {
    const registry = createExtensionRegistry([arrayMarkerExtension]);
    const referencedArray: TypeNode = {
      kind: "array",
      items: {
        kind: "object",
        properties: [
          {
            name: "value",
            type: STRING_TYPE,
            optional: false,
            constraints: [],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
      },
    };
    const typeRegistry: FormIR["typeRegistry"] = {
      Values: { name: "Values", type: referencedArray, provenance: PROVENANCE },
    };
    const ref = { kind: "reference" as const, name: "Values", typeArguments: [] };
    const constraint = arrayMarkerConstraintNode("yes", ["value"]);
    const direct = generateJsonSchemaFromIR(
      makeIR([makeField("values", ref, [constraint])], typeRegistry),
      { extensionRegistry: registry, vendorPrefix: "x-test" }
    );
    expect(direct.properties?.["values"]).toMatchObject({
      $ref: "#/$defs/Values",
      items: { properties: { value: { "x-test-array-marker": "yes" } } },
    });

    const nullable: TypeNode = {
      kind: "union",
      members: [ref, { kind: "primitive", primitiveKind: "null" }],
    };
    const nullableSchema = generateJsonSchemaFromIR(
      makeIR([makeField("values", nullable, [constraint])], typeRegistry),
      { extensionRegistry: registry, vendorPrefix: "x-test" }
    );
    expect(nullableSchema.properties?.["values"]?.oneOf?.[0]).toMatchObject({
      items: { properties: { value: { "x-test-array-marker": "yes" } } },
    });
  });

  it("builds referenced array item refinements without regenerating custom item schemas", () => {
    let customTypeHookCalls = 0;
    const countedMoneyExtension = defineExtension({
      extensionId: "x-test/counted-money",
      types: [
        defineCustomType({
          typeName: "CountedMoney",
          toJsonSchema: (_payload, vendorPrefix) => {
            customTypeHookCalls += 1;
            return { type: "string", [`${vendorPrefix}-counted-money`]: true };
          },
        }),
      ],
      constraints: [currencyConstraint],
    });
    const countedMoneyType: CustomTypeNode = {
      kind: "custom",
      typeId: "x-test/counted-money/CountedMoney",
      payload: null,
    };
    const referencedArray: TypeNode = {
      kind: "array",
      items: {
        kind: "object",
        properties: [
          {
            name: "amount",
            type: countedMoneyType,
            optional: false,
            constraints: [],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
      },
    };
    const typeRegistry: FormIR["typeRegistry"] = {
      Values: { name: "Values", type: referencedArray, provenance: PROVENANCE },
    };
    const constraint: CustomConstraintNode = {
      kind: "constraint",
      constraintKind: "custom",
      constraintId: "x-test/counted-money/Currency",
      payload: "USD",
      compositionRule: "override",
      path: { segments: ["amount"] },
      provenance: PROVENANCE,
    };
    const schema = generateJsonSchemaFromIR(
      makeIR(
        [
          makeField("values", { kind: "reference", name: "Values", typeArguments: [] }, [
            constraint,
          ]),
        ],
        typeRegistry
      ),
      {
        extensionRegistry: createExtensionRegistry([countedMoneyExtension]),
        vendorPrefix: "x-test",
      }
    );

    expect(customTypeHookCalls).toBe(1);
    // Per design 003 §5.4, the `$ref` sibling contains only the use-site refinement.
    expect(schema.properties?.["values"]).toEqual({
      $ref: "#/$defs/Values",
      items: { properties: { amount: { "x-test-currency": "USD" } } },
    });
  });
});
