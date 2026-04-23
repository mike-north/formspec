/**
 * Parity fixture — address — expected provenance-free IR.
 *
 * This is the canonical shape both the chain DSL and TSDoc surfaces must
 * produce (after provenance stripping) for the address form.
 */

import type { ProvenanceFreeFormIR } from "../../utils.js";

export const expectedIR: ProvenanceFreeFormIR = {
  kind: "form-ir",
  irVersion: "0.1.0",
  elements: [
    {
      kind: "field",
      name: "street",
      type: { kind: "primitive", primitiveKind: "string" },
      required: true,
      constraints: [],
      annotations: [],
    },
    {
      kind: "field",
      name: "city",
      type: { kind: "primitive", primitiveKind: "string" },
      required: true,
      constraints: [],
      annotations: [],
    },
    {
      kind: "field",
      name: "postalCode",
      type: { kind: "primitive", primitiveKind: "string" },
      required: true,
      constraints: [],
      annotations: [],
    },
    {
      kind: "field",
      name: "country",
      type: { kind: "primitive", primitiveKind: "string" },
      required: false,
      constraints: [],
      annotations: [],
    },
  ],
  typeRegistry: {},
};
