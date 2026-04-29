import { describe, expect, it } from "vitest";
import type { FieldNode, FormIR, Provenance } from "@formspec/core/internals";
import { IR_VERSION } from "@formspec/core/internals";
import { normalizeMetadataPolicy, resolveFormIRMetadata } from "../src/metadata/index.js";

const PROVENANCE: Provenance = {
  surface: "chain-dsl",
  file: "/test.ts",
  line: 1,
  column: 0,
};

function makeIR(field: FieldNode): FormIR {
  return {
    kind: "form-ir",
    irVersion: IR_VERSION,
    elements: [field],
    typeRegistry: {},
    provenance: PROVENANCE,
  };
}

describe("resolveFormIRMetadata", () => {
  it("resolves enum member labels inside ObjectTypeNode.additionalProperties TypeNode", () => {
    const ir = makeIR({
      kind: "field",
      name: "metadataBag",
      type: {
        kind: "object",
        properties: [],
        additionalProperties: {
          kind: "enum",
          members: [{ value: "usd" }],
        },
      },
      required: false,
      constraints: [],
      annotations: [],
      provenance: PROVENANCE,
    });

    const resolved = resolveFormIRMetadata(ir, {
      surface: "chain-dsl",
      policy: normalizeMetadataPolicy({
        enumMember: {
          displayName: {
            mode: "infer-if-missing",
            infer: ({ logicalName }) => `Label ${logicalName}`,
          },
        },
      }),
    });

    const element = resolved.elements[0];
    expect(element?.kind).toBe("field");
    if (element?.kind !== "field") {
      throw new Error("Expected a field element.");
    }

    expect(element.type.kind).toBe("object");
    if (element.type.kind !== "object") {
      throw new Error("Expected an object type.");
    }

    expect(element.type.additionalProperties).toEqual({
      kind: "enum",
      members: [{ value: "usd", label: "Label usd" }],
    });
  });
});
