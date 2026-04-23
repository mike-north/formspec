/**
 * Parity fixture — usd-cents — expected provenance-free IR.
 */

import type { ProvenanceFreeFormIR } from "../../utils.js";

export const expectedIR: ProvenanceFreeFormIR = {
  kind: "form-ir",
  irVersion: "0.1.0",
  elements: [
    {
      kind: "field",
      name: "unitPrice",
      type: { kind: "primitive", primitiveKind: "number" },
      required: true,
      // Constraint order is source-order significant in the current IR:
      // lower bounds are preserved before later narrowing tags like @multipleOf.
      constraints: [
        {
          kind: "constraint",
          constraintKind: "minimum",
          value: 0,
        },
        {
          kind: "constraint",
          constraintKind: "multipleOf",
          value: 1,
        },
      ],
      annotations: [],
    },
    {
      kind: "field",
      name: "quantity",
      type: { kind: "primitive", primitiveKind: "number" },
      required: true,
      // Keep the same source-order expectation here to guard parity across both
      // authoring surfaces rather than sorting constraints in test utilities.
      constraints: [
        {
          kind: "constraint",
          constraintKind: "minimum",
          value: 1,
        },
        {
          kind: "constraint",
          constraintKind: "multipleOf",
          value: 1,
        },
      ],
      annotations: [],
    },
  ],
  typeRegistry: {},
};
