/**
 * Parity fixture — plan-status — expected provenance-free IR.
 */

import type { ProvenanceFreeFormIR } from "../../utils.js";

export const expectedIR: ProvenanceFreeFormIR = {
  kind: "form-ir",
  irVersion: "0.1.0",
  elements: [
    {
      kind: "field",
      name: "status",
      type: {
        kind: "enum",
        members: [
          { value: "active", label: "Active" },
          { value: "paused", label: "Paused" },
          { value: "cancelled", label: "Cancelled" },
        ],
      },
      required: true,
      constraints: [],
      annotations: [
        {
          kind: "annotation",
          annotationKind: "displayName",
          value: "Plan Status",
        },
      ],
    },
  ],
  typeRegistry: {},
};
