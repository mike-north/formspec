import { describe, expect, it } from "vitest";
import { field, formspec, group, is, when } from "@formspec/dsl";
import {
  DEFAULT_CONSTRAINTS,
  DEFAULT_DSL_POLICY,
  defineConstraints,
  defineDSLPolicy,
  validateFormSpecElements,
} from "../src/index.js";
import {
  defineDSLPolicy as defineBrowserDSLPolicy,
  validateFormSpecElements as validateBrowserFormSpecElements,
} from "../src/browser.js";

describe("DSL-policy defaults and factories", () => {
  /* eslint-disable @typescript-eslint/no-deprecated -- compatibility test covers deprecated aliases */
  it("exposes canonical DSLPolicy names while preserving deprecated aliases", () => {
    const policy = defineDSLPolicy({
      fieldTypes: { dynamicEnum: "error" },
      layout: { group: "warn" },
    });
    const legacyPolicy = defineConstraints({
      fieldTypes: { dynamicEnum: "error" },
      layout: { group: "warn" },
    });

    expect(policy).toMatchObject({
      fieldTypes: { dynamicEnum: "error", text: "off" },
      layout: { group: "warn", conditionals: "off" },
    });
    expect(legacyPolicy).toEqual(policy);
    expect(DEFAULT_CONSTRAINTS).toBe(DEFAULT_DSL_POLICY);
  });
  /* eslint-enable @typescript-eslint/no-deprecated */

  it("keeps the browser entrypoint aligned with the package entrypoint", () => {
    const sourcePolicy = defineDSLPolicy({ fieldTypes: { dynamicSchema: "error" } });
    const browserPolicy = defineBrowserDSLPolicy({ fieldTypes: { dynamicSchema: "error" } });

    expect(browserPolicy).toEqual(sourcePolicy);
  });
});

describe("FormSpec DSL-policy validation", () => {
  it("reports disallowed field builders from the canonical policy shape", () => {
    const form = formspec(field.text("name"), field.dynamicEnum("country", "countries"));

    const result = validateFormSpecElements(form.elements, {
      constraints: {
        fieldTypes: { dynamicEnum: "error" },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "DISALLOWED_FIELD_TYPE",
        fieldName: "country",
        fieldType: "dynamic_enum",
        severity: "error",
      }),
    ]);
  });

  it("reports layout constructs disallowed by project policy", () => {
    const form = formspec(
      field.enum("kind", ["personal", "business"] as const),
      group("Contact", field.text("name")),
      when(is("kind", "business"), field.text("company"))
    );

    const result = validateFormSpecElements(form.elements, {
      constraints: {
        layout: { group: "error", conditionals: "warn" },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DISALLOWED_GROUP", severity: "error" }),
        expect.objectContaining({ code: "DISALLOWED_CONDITIONAL", severity: "warning" }),
      ])
    );
  });

  it("validates nested object depth and field option policy together", () => {
    const form = formspec(
      field.object(
        "address",
        field.object("country", field.text("code", { label: "Country code" }))
      )
    );

    const result = validateFormSpecElements(form.elements, {
      constraints: {
        fieldOptions: { label: "error" },
        layout: { maxNestingDepth: 1 },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DISALLOWED_FIELD_OPTION", fieldName: "code" }),
        expect.objectContaining({ code: "EXCEEDED_NESTING_DEPTH" }),
      ])
    );
  });

  it("validates through the browser entrypoint without changing behavior", () => {
    const form = formspec(field.dynamicSchema("details", "detailSchema"));

    const result = validateBrowserFormSpecElements(form.elements, {
      constraints: {
        fieldTypes: { dynamicSchema: "error" },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatchObject({
      code: "DISALLOWED_FIELD_TYPE",
      fieldType: "dynamic_schema",
    });
  });
});
