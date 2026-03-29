import type { ConstraintTagParseRegistryLike } from "../tag-value-parser.js";
import { describe, expect, it } from "vitest";
import { parseConstraintTagValue } from "../index.js";

const PROVENANCE = {
  surface: "tsdoc" as const,
  file: "/virtual/formspec.ts",
  line: 1,
  column: 1,
  tagName: "@minimum",
};

function createRegistry(): ConstraintTagParseRegistryLike {
  return {
    extensions: [],
    findConstraint(constraintId) {
      if (constraintId === "x-test/numeric/MaxSigFig") {
        return {
          constraintName: "MaxSigFig",
          applicableTypes: null,
          compositionRule: "override",
          toJsonSchema() {
            return {};
          },
        };
      }
      if (constraintId === "x-test/decimal/MinScaled") {
        return {
          constraintName: "MinScaled",
          applicableTypes: null,
          compositionRule: "override",
          toJsonSchema() {
            return {};
          },
        };
      }
      return undefined;
    },
    findConstraintTag(tagName) {
      if (tagName === "maxSigFig") {
        return {
          extensionId: "x-test/numeric",
          registration: {
            tagName: "maxSigFig",
            constraintName: "MaxSigFig",
            parseValue(raw) {
              return Number(raw.trim());
            },
          },
        };
      }
      return undefined;
    },
    findBuiltinConstraintBroadening(typeId, tagName) {
      if (typeId === "Decimal" && tagName === "minimum") {
        return {
          extensionId: "x-test/decimal",
          registration: {
            tagName: "minimum",
            constraintName: "MinScaled",
            parseValue(raw) {
              return Number(raw.trim()) * 100;
            },
          },
        };
      }
      return undefined;
    },
  };
}

describe("tag-value-parser", () => {
  it("parses builtin numeric constraints with path targets", () => {
    const parsed = parseConstraintTagValue("minimum", ":amount 0", PROVENANCE);

    expect(parsed).toEqual({
      kind: "constraint",
      constraintKind: "minimum",
      value: 0,
      path: { segments: ["amount"] },
      provenance: PROVENANCE,
    });
  });

  it("parses boolean builtin constraints with an omitted argument", () => {
    const parsed = parseConstraintTagValue("uniqueItems", "", PROVENANCE);

    expect(parsed).toEqual({
      kind: "constraint",
      constraintKind: "uniqueItems",
      value: true,
      provenance: PROVENANCE,
    });
  });

  it("falls back to a raw string for non-JSON @const payloads", () => {
    const parsed = parseConstraintTagValue("const", "not-json", PROVENANCE);

    expect(parsed).toEqual({
      kind: "constraint",
      constraintKind: "const",
      value: "not-json",
      provenance: PROVENANCE,
    });
  });

  it("parses extension-defined constraint tags through the registry", () => {
    const parsed = parseConstraintTagValue("maxSigFig", "4", PROVENANCE, {
      registry: createRegistry(),
    });

    expect(parsed).toEqual({
      kind: "constraint",
      constraintKind: "custom",
      constraintId: "x-test/numeric/MaxSigFig",
      payload: 4,
      compositionRule: "override",
      provenance: PROVENANCE,
    });
  });

  it("uses builtin broadening registrations for custom field types", () => {
    const parsed = parseConstraintTagValue("minimum", "1.25", PROVENANCE, {
      registry: createRegistry(),
      fieldType: { kind: "custom", typeId: "Decimal", payload: null },
    });

    expect(parsed).toEqual({
      kind: "constraint",
      constraintKind: "custom",
      constraintId: "x-test/decimal/MinScaled",
      payload: 125,
      compositionRule: "override",
      provenance: PROVENANCE,
    });
  });
});
