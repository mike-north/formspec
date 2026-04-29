import { describe, expect, it } from "vitest";
import { defineCustomType, defineExtension, IR_VERSION } from "@formspec/core/internals";
import type { FieldNode, FormIR, Provenance } from "@formspec/core/internals";
import { createExtensionRegistry } from "../../src/extensions/index.js";
import { generateJsonSchemaFromIR } from "../../src/json-schema/ir-generator.js";
import { JsonSchema2020Writer } from "../../src/serialization/json-schema-2020-writer.js";
import {
  assertUniqueKebabNames,
  KEYWORD_REGISTRY,
} from "../../src/serialization/keyword-registry.js";
import { emitKey } from "../../src/serialization/emit-key.js";
import { FORMSPEC_EXTENSION_KEY_PATTERN, toKebabCase } from "../../src/serialization/index.js";
import type { SerializationContext } from "../../src/serialization/output-writer.js";

const extensionContext: SerializationContext = {
  vendorPrefix: "x-formspec",
  defaultTransport: "extension",
};

const PROVENANCE: Provenance = {
  surface: "chain-dsl",
  file: "/test.ts",
  line: 1,
  column: 0,
};

function makeIR(fields: readonly FieldNode[]): FormIR {
  return {
    kind: "form-ir",
    irVersion: IR_VERSION,
    elements: fields,
    typeRegistry: {},
    provenance: PROVENANCE,
  };
}

describe("serialization keyword emission", () => {
  it("emits extension-transport keys for every registered keyword in PR-1", () => {
    for (const entry of KEYWORD_REGISTRY) {
      expect(emitKey(entry.logicalName, extensionContext)).toBe(
        `x-formspec-${toKebabCase(entry.logicalName)}`
      );
    }
  });

  it("emits well-formed vendor extension keys for every registered keyword", () => {
    for (const entry of KEYWORD_REGISTRY) {
      expect(emitKey(entry.logicalName, extensionContext)).toMatch(FORMSPEC_EXTENSION_KEY_PATTERN);
    }
  });

  it("rejects unregistered emitted keywords", () => {
    expect(() => emitKey("unregisteredKeyword" as never, extensionContext)).toThrow(
      /Unregistered FormSpec serialization keyword "unregisteredKeyword"/
    );
  });

  it("throws for vocabulary transport until PR-2 implements it", () => {
    expect(() =>
      emitKey("optionSource", {
        vendorPrefix: "x-formspec",
        defaultTransport: "vocabulary",
      })
    ).toThrow(/Vocabulary transport for FormSpec keyword "optionSource" is not implemented/);
  });
});

describe("JsonSchema2020Writer", () => {
  it("preserves JSON Schema generator options while emitting", () => {
    const decimalType = defineCustomType({
      typeName: "Decimal",
      toJsonSchema: (_payload, vendorPrefix) => ({
        type: "string",
        [`${vendorPrefix}-decimal`]: true,
      }),
    });
    const extensionRegistry = createExtensionRegistry([
      defineExtension({ extensionId: "x-test/decimal", types: [decimalType] }),
    ]);
    const ir = makeIR([
      {
        kind: "field",
        name: "status",
        type: {
          kind: "enum",
          members: [{ value: "draft" }, { value: "sent" }],
        },
        required: false,
        constraints: [],
        annotations: [],
        provenance: PROVENANCE,
      },
      {
        kind: "field",
        name: "amount",
        type: { kind: "custom", typeId: "x-test/decimal/Decimal", payload: null },
        required: false,
        constraints: [],
        annotations: [],
        provenance: PROVENANCE,
      },
    ]);
    const writer = new JsonSchema2020Writer({
      enumSerialization: "oneOf",
      extensionRegistry,
    });
    const ctx: SerializationContext = {
      vendorPrefix: "x-acme",
      defaultTransport: "extension",
    };

    expect(writer.emitDocument(ir, ctx)).toEqual(
      generateJsonSchemaFromIR(ir, {
        enumSerialization: "oneOf",
        extensionRegistry,
        vendorPrefix: "x-acme",
      })
    );
  });

  it("rejects vocabulary transport until PR-2 implements it", () => {
    const writer = new JsonSchema2020Writer();

    expect(() =>
      writer.emitDocument(makeIR([]), {
        vendorPrefix: "x-formspec",
        defaultTransport: "vocabulary",
      })
    ).toThrow(/Vocabulary transport for JSON Schema 2020-12 output is not implemented/);
  });
});

describe("serialization keyword registry", () => {
  it("keeps kebab-cased logical names unique for extension transport", () => {
    expect(() => {
      assertUniqueKebabNames(KEYWORD_REGISTRY);
    }).not.toThrow();
  });

  it("rejects registry entries that collide after kebab-casing", () => {
    expect(() => {
      assertUniqueKebabNames([
        {
          logicalName: "schemaSource",
          vocabularyId: "dynamic-schema",
          transportPreference: "vocabulary",
        },
        {
          logicalName: "schema-source",
          vocabularyId: "metadata",
          transportPreference: "extension",
        },
      ]);
    }).toThrow(/collide after kebab-casing.*schemaSource.*schema-source/s);
  });
});
