/**
 * Parity fixture — user-registration — expected provenance-free IR.
 *
 * This is the canonical shape both the chain DSL and TSDoc surfaces must
 * produce (after provenance stripping) for the user-registration form.
 */

import type { ProvenanceFreeFormIR } from "../../utils.js";

export const expectedIR: ProvenanceFreeFormIR = {
  kind: "form-ir",
  irVersion: "0.1.0",
  elements: [
    {
      kind: "field",
      name: "email",
      type: { kind: "primitive", primitiveKind: "string" },
      required: true,
      constraints: [],
      annotations: [],
    },
    {
      kind: "field",
      name: "username",
      type: { kind: "primitive", primitiveKind: "string" },
      required: true,
      constraints: [],
      annotations: [],
    },
    {
      kind: "field",
      name: "agreedToTerms",
      type: { kind: "primitive", primitiveKind: "boolean" },
      required: true,
      constraints: [],
      annotations: [],
    },
    {
      kind: "field",
      name: "accountType",
      type: {
        kind: "enum",
        members: [{ value: "personal" }, { value: "business" }, { value: "enterprise" }],
      },
      required: true,
      constraints: [],
      annotations: [],
    },
  ],
  typeRegistry: {},
};
