import { describe, expect, it } from "vitest";
import {
  buildSyntheticHelperPrelude,
  checkSyntheticTagApplication,
  getMatchingTagSignatures,
  getTagDefinition,
  lowerTagApplicationToSyntheticCall,
} from "../internal.js";

describe("compiler-signatures", () => {
  it("renders synthetic overloads for path-targeted builtin constraints", () => {
    const prelude = buildSyntheticHelperPrelude();

    expect(prelude).toContain("declare namespace __formspec {");
    expect(prelude).toContain("function tag_minimum<Host, Subject>(");
    expect(prelude).toContain(
      'ctx: TagContext<"class-field" | "interface-field" | "type-alias-field" | "variable" | "function-parameter" | "method-parameter", Host, Subject>,'
    );
    expect(prelude).toContain('target0: PathOfCapability<Subject, "numeric-comparable">,');
    expect(prelude).toContain("function tag_minLength<Host, Subject>(");
    expect(prelude).toContain('target0: PathOfCapability<Subject, "string-like">,');
    expect(prelude).toContain("function tag_uniqueItems<Host, Subject>(");
    expect(prelude).toContain('target0: PathOfCapability<Subject, "array-like">');
    expect(prelude).toContain("value: number");
  });

  it("renders member and variant overloads for annotation tags", () => {
    const prelude = buildSyntheticHelperPrelude();

    expect(prelude).toContain("function tag_displayName<Host, Subject>(");
    expect(prelude).toContain("target0: MemberTarget<Subject>,");
    expect(prelude).toContain("target0: VariantTarget<Subject>,");
    expect(prelude).toContain("value: string");
  });

  it("selects matching signatures by placement and target kind", () => {
    const displayName = getTagDefinition("displayName");
    if (displayName === null) {
      throw new Error("Expected displayName tag definition to exist");
    }

    const variantSignatures = getMatchingTagSignatures(displayName, "type-alias", "variant");
    const directSignatures = getMatchingTagSignatures(displayName, "class-field", null);

    expect(variantSignatures).toHaveLength(1);
    expect(variantSignatures[0]?.label).toBe("@displayName :variant <label>");
    expect(directSignatures).toHaveLength(1);
    expect(directSignatures[0]?.label).toBe("@displayName <label>");
  });

  it("lowers path-targeted constraints into synthetic helper calls", () => {
    const lowered = lowerTagApplicationToSyntheticCall({
      tagName: "minimum",
      placement: "class-field",
      hostType: "Foo",
      subjectType: "Discount",
      target: {
        kind: "path",
        text: "percent",
      },
      argumentExpression: "120",
    });

    expect(lowered.matchingSignatures).toHaveLength(1);
    expect(lowered.callExpression).toBe(
      '__formspec.tag_minimum(__ctx<"class-field", Foo, Discount>(), __path<Discount, "numeric-comparable">("percent"), 120);'
    );
  });

  it("lowers variant-targeted annotations into synthetic helper calls", () => {
    const lowered = lowerTagApplicationToSyntheticCall({
      tagName: "displayName",
      placement: "type-alias",
      hostType: "Status",
      subjectType: "Status",
      target: {
        kind: "variant",
        text: "plural",
      },
      argumentExpression: '"Statuses"',
    });

    expect(lowered.callExpression).toBe(
      '__formspec.tag_displayName(__ctx<"type-alias", Status, Status>(), __variant<Status>("plural"), "Statuses");'
    );
  });

  it("lowers direct constraints without a target argument", () => {
    const lowered = lowerTagApplicationToSyntheticCall({
      tagName: "minimum",
      placement: "class-field",
      hostType: "Foo",
      subjectType: "number",
      argumentExpression: "0",
    });

    expect(lowered.callExpression).toBe(
      '__formspec.tag_minimum(__ctx<"class-field", Foo, number>(), 0);'
    );
  });

  it("lowers member-targeted annotations into synthetic helper calls", () => {
    const lowered = lowerTagApplicationToSyntheticCall({
      tagName: "displayName",
      placement: "class-field",
      hostType: "Foo",
      subjectType: "FooStatusMap",
      target: {
        kind: "member",
        text: "draft",
      },
      argumentExpression: '"Draft"',
    });

    expect(lowered.callExpression).toBe(
      '__formspec.tag_displayName(__ctx<"class-field", Foo, FooStatusMap>(), __member<FooStatusMap>("draft"), "Draft");'
    );
  });

  it("rejects placements without a matching synthetic signature", () => {
    expect(() =>
      lowerTagApplicationToSyntheticCall({
        tagName: "minimum",
        placement: "class",
        hostType: "Foo",
        subjectType: "Foo",
        argumentExpression: "0",
      })
    ).toThrow('No synthetic signature for @minimum on placement "class"');
  });

  it("rejects unknown tag names during lowering", () => {
    expect(() =>
      lowerTagApplicationToSyntheticCall({
        tagName: "doesNotExist",
        placement: "class-field",
        hostType: "Foo",
        subjectType: "number",
        argumentExpression: "0",
      })
    ).toThrow("Unknown FormSpec tag: doesNotExist");
  });

  it("lets the TypeScript checker accept a valid path-targeted synthetic call", () => {
    const result = checkSyntheticTagApplication({
      tagName: "minimum",
      placement: "class-field",
      hostType: "Foo",
      subjectType: "Discount",
      target: {
        kind: "path",
        text: "percent",
      },
      argumentExpression: "120",
      supportingDeclarations: [
        "type Percent = number;",
        "type Discount = { percent: Percent; currency: string };",
        "type Foo = { discount: Discount };",
      ],
    });

    expect(result.diagnostics).toHaveLength(0);
  });

  it("lets the TypeScript checker reject an incompatible path target", () => {
    const result = checkSyntheticTagApplication({
      tagName: "minimum",
      placement: "class-field",
      hostType: "Foo",
      subjectType: "Discount",
      target: {
        kind: "path",
        text: "currency",
      },
      argumentExpression: "120",
      supportingDeclarations: [
        "type Percent = number;",
        "type Discount = { percent: Percent; currency: string };",
        "type Foo = { discount: Discount };",
      ],
    });

    expect(result.diagnostics).not.toHaveLength(0);
    expect(result.diagnostics[0]?.message).toContain('"currency"');
    expect(result.diagnostics[0]?.message).toContain('"percent"');
  });

  it("lets the TypeScript checker reject wrong argument types", () => {
    const result = checkSyntheticTagApplication({
      tagName: "minimum",
      placement: "class-field",
      hostType: "Foo",
      subjectType: "number",
      argumentExpression: '"120"',
      supportingDeclarations: ["type Foo = { value: number };"],
    });

    expect(result.diagnostics).not.toHaveLength(0);
    expect(result.diagnostics[0]?.message).toContain("string");
    expect(result.diagnostics[0]?.message).toContain("number");
  });

  it("includes extension tags in the synthetic helper prelude", () => {
    const prelude = buildSyntheticHelperPrelude([
      {
        extensionId: "acme",
        constraintTags: [{ tagName: "acmeConstraint" }],
      },
    ]);

    expect(prelude).toContain("function tag_acmeConstraint<Host, Subject>(");
  });

  it("lowers extension tag applications when extension metadata is supplied", () => {
    const lowered = lowerTagApplicationToSyntheticCall({
      tagName: "acmeConstraint",
      placement: "class-field",
      hostType: "Foo",
      subjectType: "Foo",
      argumentExpression: '"ok"',
      extensions: [
        {
          extensionId: "acme",
          constraintTags: [{ tagName: "acmeConstraint" }],
        },
      ],
    });

    expect(lowered.callExpression).toBe(
      '__formspec.tag_acmeConstraint(__ctx<"class-field", Foo, Foo>(), "ok");'
    );
  });

  it("lets the synthetic checker validate extension tags when extension metadata is supplied", () => {
    const result = checkSyntheticTagApplication({
      tagName: "acmeConstraint",
      placement: "class-field",
      hostType: "Foo",
      subjectType: "Foo",
      argumentExpression: '"ok"',
      extensions: [
        {
          extensionId: "acme",
          constraintTags: [{ tagName: "acmeConstraint" }],
        },
      ],
      supportingDeclarations: ["type Foo = { value: string };"],
    });

    expect(result.diagnostics).toHaveLength(0);
  });
});
