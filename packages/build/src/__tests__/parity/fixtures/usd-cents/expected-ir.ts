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
