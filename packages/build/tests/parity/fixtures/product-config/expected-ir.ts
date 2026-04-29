/**
 * Parity fixture — product-config — expected provenance-free IR.
 *
 * This is the canonical shape both the chain DSL and TSDoc surfaces must
 * produce (after provenance stripping) for the product-config form.
 */

import type { ProvenanceFreeFormIR } from "../../utils.js";

export const expectedIR: ProvenanceFreeFormIR = {
  kind: "form-ir",
  irVersion: "0.1.0",
  elements: [
    {
      kind: "field",
      name: "sku",
      type: { kind: "primitive", primitiveKind: "string" },
      required: true,
      constraints: [],
      annotations: [],
    },
    {
      kind: "field",
      name: "name",
      type: { kind: "primitive", primitiveKind: "string" },
      required: true,
      constraints: [],
      annotations: [],
    },
    {
      kind: "field",
      name: "available",
      type: { kind: "primitive", primitiveKind: "boolean" },
      required: false,
      constraints: [],
      annotations: [],
    },
    {
      kind: "field",
      name: "pricing",
      type: {
        kind: "object",
        properties: [
          {
            name: "basePrice",
            type: { kind: "primitive", primitiveKind: "number" },
            optional: false,
            constraints: [],
            annotations: [],
          },
          {
            name: "currency",
            type: { kind: "primitive", primitiveKind: "string" },
            optional: false,
            constraints: [],
            annotations: [],
          },
        ],
      },
      required: true,
      constraints: [],
      annotations: [],
    },
  ],
  typeRegistry: {},
};
