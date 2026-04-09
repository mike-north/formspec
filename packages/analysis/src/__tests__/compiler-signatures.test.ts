import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFormSpecPerformanceRecorder,
  FORM_SPEC_SYNTHETIC_BATCH_CACHE_ENTRIES,
  buildSyntheticHelperPrelude,
  checkSyntheticTagApplications,
  checkSyntheticTagApplication,
  getMatchingTagSignatures,
  getTagDefinition,
  lowerTagApplicationToSyntheticCall,
} from "../internal.js";
import {
  checkNarrowSyntheticTagApplicabilities,
  checkNarrowSyntheticTagApplicability,
  checkSyntheticTagApplicationsDetailed,
} from "../compiler-signatures.js";

const MIXED_TAG_SUPPORTING_DECLARATIONS = [
  `
    type Discount = {
      amount: number;
      secondaryAmount: number;
      label: string;
      code: string;
      codes: string[];
    };
  `,
  "type Foo = { discount: Discount };",
] as const;

const MIXED_TAG_APPLICATIONS = [
  {
    tagName: "minimum",
    placement: "class-field" as const,
    hostType: "Foo",
    subjectType: "Discount",
    target: { kind: "path" as const, text: "amount" },
    argumentExpression: "0",
    supportingDeclarations: MIXED_TAG_SUPPORTING_DECLARATIONS,
  },
  {
    tagName: "maximum",
    placement: "class-field" as const,
    hostType: "Foo",
    subjectType: "Discount",
    target: { kind: "path" as const, text: "amount" },
    argumentExpression: "100",
    supportingDeclarations: MIXED_TAG_SUPPORTING_DECLARATIONS,
  },
  {
    tagName: "minimum",
    placement: "class-field" as const,
    hostType: "Foo",
    subjectType: "Discount",
    target: { kind: "path" as const, text: "secondaryAmount" },
    argumentExpression: "0",
    supportingDeclarations: MIXED_TAG_SUPPORTING_DECLARATIONS,
  },
  {
    tagName: "maximum",
    placement: "class-field" as const,
    hostType: "Foo",
    subjectType: "Discount",
    target: { kind: "path" as const, text: "secondaryAmount" },
    argumentExpression: "100",
    supportingDeclarations: MIXED_TAG_SUPPORTING_DECLARATIONS,
  },
  {
    tagName: "minLength",
    placement: "class-field" as const,
    hostType: "Foo",
    subjectType: "Discount",
    target: { kind: "path" as const, text: "label" },
    argumentExpression: "1",
    supportingDeclarations: MIXED_TAG_SUPPORTING_DECLARATIONS,
  },
  {
    tagName: "maxLength",
    placement: "class-field" as const,
    hostType: "Foo",
    subjectType: "Discount",
    target: { kind: "path" as const, text: "label" },
    argumentExpression: "64",
    supportingDeclarations: MIXED_TAG_SUPPORTING_DECLARATIONS,
  },
  {
    tagName: "pattern",
    placement: "class-field" as const,
    hostType: "Foo",
    subjectType: "Discount",
    target: { kind: "path" as const, text: "code" },
    argumentExpression: '"^[A-Z]+$"',
    supportingDeclarations: MIXED_TAG_SUPPORTING_DECLARATIONS,
  },
  {
    tagName: "minItems",
    placement: "class-field" as const,
    hostType: "Foo",
    subjectType: "Discount",
    target: { kind: "path" as const, text: "codes" },
    argumentExpression: "1",
    supportingDeclarations: MIXED_TAG_SUPPORTING_DECLARATIONS,
  },
  {
    tagName: "maxItems",
    placement: "class-field" as const,
    hostType: "Foo",
    subjectType: "Discount",
    target: { kind: "path" as const, text: "codes" },
    argumentExpression: "10",
    supportingDeclarations: MIXED_TAG_SUPPORTING_DECLARATIONS,
  },
] as const;

describe("compiler-signatures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("emits type declarations for extension-registered custom types", () => {
    const prelude = buildSyntheticHelperPrelude([
      {
        extensionId: "x-stripe/monetary",
        customTypes: [{ tsTypeNames: ["Decimal"] }],
      },
    ]);

    expect(prelude).toContain("type Decimal = unknown;");
  });

  it("skips type declarations for supported TypeScript global built-in types", () => {
    // "Date" is already declared in TypeScript's lib files; emitting
    // `type Date = unknown;` causes TS2300. Registering it as a tsTypeName
    // is still valid; only the prelude declaration is skipped.
    const prelude = buildSyntheticHelperPrelude([
      {
        extensionId: "x-example/date",
        customTypes: [{ tsTypeNames: ["Date"] }],
      },
    ]);

    expect(prelude).not.toContain("type Date = unknown;");
  });

  it("throws for unsupported TypeScript global built-in types", () => {
    expect(() =>
      buildSyntheticHelperPrelude([
        {
          extensionId: "ext-a",
          customTypes: [{ tsTypeNames: ["Array"] }],
        },
      ])
    ).toThrow('conflicts with a TypeScript global built-in type that FormSpec does not yet support overriding');
  });

  it("keeps prelude-level failures out of per-application batch diagnostics", () => {
    const result = checkSyntheticTagApplicationsDetailed({
      applications: [
        {
          tagName: "minLength",
          placement: "class-field",
          hostType: "Foo",
          subjectType: "string",
          argumentExpression: "1",
          supportingDeclarations: ["interface Foo { items: Array<string>; label: string; }"],
          extensions: [
            {
              extensionId: "x-example/array",
              customTypes: [{ tsTypeNames: ["Array"] }],
            },
          ],
        },
        {
          tagName: "maximum",
          placement: "class-field",
          hostType: "Bar",
          subjectType: "number",
          argumentExpression: "10",
          supportingDeclarations: ["interface Bar { items: Array<number>; count: number; }"],
          extensions: [
            {
              extensionId: "x-example/array",
              customTypes: [{ tsTypeNames: ["Array"] }],
            },
          ],
        },
      ],
    });

    expect(result.applicationResults).toHaveLength(2);
    expect(result.applicationResults.every((entry) => entry.diagnostics.length === 0)).toBe(true);
    expect(result.globalDiagnostics).toHaveLength(1);
    expect(result.globalDiagnostics[0]?.kind).toBe("unsupported-custom-type-override");
    expect(result.globalDiagnostics[0]?.message).toContain("conflicts with a TypeScript global built-in type");
  });

  it("preserves prelude-level failures across synthetic batch cache hits", () => {
    const applications = [
      {
        tagName: "minLength",
        placement: "class-field" as const,
        hostType: "Foo",
        subjectType: "string",
        argumentExpression: "1",
        supportingDeclarations: ["interface Foo { items: Array<string>; label: string; }"],
        extensions: [
          {
            extensionId: "x-example/array",
            customTypes: [{ tsTypeNames: ["Array"] }],
          },
        ],
      },
    ];

    const firstResult = checkSyntheticTagApplicationsDetailed({ applications });
    const secondResult = checkSyntheticTagApplicationsDetailed({ applications });

    expect(firstResult.globalDiagnostics).toHaveLength(1);
    expect(secondResult.globalDiagnostics).toHaveLength(1);
    expect(secondResult.globalDiagnostics[0]?.kind).toBe("unsupported-custom-type-override");
    expect(secondResult.globalDiagnostics[0]?.message).toContain("conflicts with a TypeScript global built-in type");
  });

  it("classifies invalid custom type registrations as synthetic setup failures", () => {
    const result = checkSyntheticTagApplicationsDetailed({
      applications: [
        {
          tagName: "minLength",
          placement: "class-field",
          hostType: "Foo",
          subjectType: "string",
          argumentExpression: "1",
          supportingDeclarations: ["interface Foo { label: string; }"],
          extensions: [
            {
              extensionId: "x-example/invalid-type",
              customTypes: [{ tsTypeNames: ["Not A Type"] }],
            },
          ],
        },
      ],
    });

    expect(result.applicationResults).toHaveLength(1);
    expect(result.applicationResults[0]?.diagnostics).toHaveLength(0);
    expect(result.globalDiagnostics).toHaveLength(1);
    expect(result.globalDiagnostics[0]?.kind).toBe("synthetic-setup");
    expect(result.globalDiagnostics[0]?.message).toContain("Invalid custom type name");
  });

  it("keeps legacy batched synthetic checks non-lossy for setup-level failures", () => {
    const results = checkSyntheticTagApplications({
      applications: [
        {
          tagName: "minLength",
          placement: "class-field",
          hostType: "Foo",
          subjectType: "string",
          argumentExpression: "1",
          supportingDeclarations: ["interface Foo { items: Array<string>; label: string; }"],
          extensions: [
            {
              extensionId: "x-example/array",
              customTypes: [{ tsTypeNames: ["Array"] }],
            },
          ],
        },
        {
          tagName: "maximum",
          placement: "class-field",
          hostType: "Bar",
          subjectType: "number",
          argumentExpression: "10",
          supportingDeclarations: ["interface Bar { items: Array<number>; count: number; }"],
          extensions: [
            {
              extensionId: "x-example/array",
              customTypes: [{ tsTypeNames: ["Array"] }],
            },
          ],
        },
      ],
    });

    expect(results).toHaveLength(2);
    expect(
      results.every((entry) =>
        entry.diagnostics.length > 0 &&
        entry.diagnostics.some(
          (diagnostic) => diagnostic.kind === "unsupported-custom-type-override"
        )
      )
    ).toBe(true);
  });

  it("skips type declarations for TypeScript primitive keywords", () => {
    // "bigint" is a TypeScript reserved keyword; emitting `type bigint = unknown;`
    // causes TS2457. It's already known to the compiler, so no declaration is needed.
    // Registering it as a tsTypeName is still valid (it means "match the native bigint
    // type as a custom type"); only the prelude declaration is skipped.
    const prelude = buildSyntheticHelperPrelude([
      {
        extensionId: "x-example/bigint",
        customTypes: [{ tsTypeNames: ["bigint"] }],
      },
    ]);

    expect(prelude).not.toContain("type bigint = unknown;");
  });

  it("throws when a custom type name is not a valid TypeScript identifier", () => {
    expect(() =>
      buildSyntheticHelperPrelude([
        {
          extensionId: "ext-a",
          customTypes: [{ tsTypeNames: ["Not A Type"] }],
        },
      ])
    ).toThrow('Invalid custom type name "Not A Type"');
  });

  it("throws when the same custom type name is registered by two different extensions", () => {
    expect(() =>
      buildSyntheticHelperPrelude([
        {
          extensionId: "ext-a",
          customTypes: [{ tsTypeNames: ["Decimal"] }],
        },
        {
          extensionId: "ext-b",
          customTypes: [{ tsTypeNames: ["Decimal"] }],
        },
      ])
    ).toThrow('Duplicate custom type name "Decimal"');
  });

  it("throws when the same custom type name appears twice within a single extension", () => {
    expect(() =>
      buildSyntheticHelperPrelude([
        {
          extensionId: "ext-a",
          customTypes: [{ tsTypeNames: ["Decimal", "Decimal"] }],
        },
      ])
    ).toThrow('Duplicate custom type name "Decimal"');
  });

  it("accepts a constraint on a field in an interface that references a custom extension type", () => {
    // MixedConfig references Decimal, which is not defined in supportingDeclarations
    // (it would normally be imported). The extension provides it as a custom type,
    // causing `type Decimal = unknown;` to appear in the prelude, so the interface
    // resolves and the minLength check on the string field passes.
    const result = checkSyntheticTagApplication({
      tagName: "minLength",
      placement: "class-field",
      hostType: "MixedConfig",
      subjectType: "string",
      argumentExpression: "1",
      supportingDeclarations: [
        "interface MixedConfig { amount: Decimal; label: string; }",
      ],
      extensions: [
        {
          extensionId: "x-stripe/monetary",
          customTypes: [{ tsTypeNames: ["Decimal"] }],
        },
      ],
    });

    expect(result.diagnostics).toHaveLength(0);
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

  it("checks multiple synthetic tag applications in one compiler pass", () => {
    const results = checkSyntheticTagApplications({
      applications: [
        {
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
        },
        {
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
        },
      ],
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.diagnostics).toHaveLength(0);
    expect(results[1]?.diagnostics).not.toHaveLength(0);
    expect(results[1]?.diagnostics[0]?.message).toContain('"currency"');
  });

  it("returns no results for an empty synthetic application batch", () => {
    expect(checkSyntheticTagApplications({ applications: [] })).toEqual([]);
  });

  it("matches single and batched synthetic diagnostics for the same input", () => {
    const single = checkSyntheticTagApplication({
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
    const batched = checkSyntheticTagApplications({
      applications: [
        {
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
        },
      ],
    });

    expect(batched).toHaveLength(1);
    expect(batched[0]?.diagnostics).toEqual(single.diagnostics);
  });

  it("isolates batched applications with conflicting supporting declarations", () => {
    const results = checkSyntheticTagApplications({
      applications: [
        {
          tagName: "minimum",
          placement: "class-field",
          hostType: "Foo",
          subjectType: "Subject",
          argumentExpression: "0",
          supportingDeclarations: ["type Subject = number;", "type Foo = { value: Subject };"],
        },
        {
          tagName: "minLength",
          placement: "class-field",
          hostType: "Bar",
          subjectType: "Subject",
          argumentExpression: "1",
          supportingDeclarations: ["type Subject = string;", "type Bar = { value: Subject };"],
        },
      ],
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.diagnostics).toHaveLength(0);
    expect(results[1]?.diagnostics).toHaveLength(0);
  });

  it("checks narrow applicability for a valid resolved numeric target type", () => {
    const result = checkNarrowSyntheticTagApplicability({
      tagName: "minimum",
      placement: "class-field",
      resolvedTargetType: "number",
      targetKind: "path",
      argumentExpression: "120",
    });

    expect(result.diagnostics).toHaveLength(0);
  });

  it("checks narrow applicability for an invalid resolved string target type", () => {
    const result = checkNarrowSyntheticTagApplicability({
      tagName: "minimum",
      placement: "class-field",
      resolvedTargetType: "string",
      targetKind: "path",
      argumentExpression: "120",
    });

    expect(result.diagnostics).not.toHaveLength(0);
    expect(result.diagnostics[0]?.message).toContain("false");
  });

  it("checks narrow applicability for an invalid argument type", () => {
    const result = checkNarrowSyntheticTagApplicability({
      tagName: "minimum",
      placement: "class-field",
      resolvedTargetType: "number",
      argumentExpression: '"120"',
    });

    expect(result.diagnostics).not.toHaveLength(0);
    expect(result.diagnostics[0]?.message).toContain("false");
  });

  it("rejects unknown tag names during narrow applicability checks", () => {
    expect(() =>
      checkNarrowSyntheticTagApplicability({
        tagName: "doesNotExist",
        placement: "class-field",
        resolvedTargetType: "number",
      })
    ).toThrow("Unknown FormSpec tag: doesNotExist");
  });

  it("checks multiple narrow applications in one compiler pass", () => {
    const results = checkNarrowSyntheticTagApplicabilities({
      applications: [
        {
          tagName: "minimum",
          placement: "class-field",
          resolvedTargetType: "number",
          targetKind: "path",
          argumentExpression: "120",
        },
        {
          tagName: "minimum",
          placement: "class-field",
          resolvedTargetType: "string",
          targetKind: "path",
          argumentExpression: "120",
        },
      ],
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.diagnostics).toHaveLength(0);
    expect(results[1]?.diagnostics).not.toHaveLength(0);
    expect(results[1]?.diagnostics[0]?.message).toContain("false");
  });

  it("returns no results for an empty narrow synthetic application batch", () => {
    expect(checkNarrowSyntheticTagApplicabilities({ applications: [] })).toEqual([]);
  });

  it("matches single and batched narrow diagnostics for the same input", () => {
    const single = checkNarrowSyntheticTagApplicability({
      tagName: "minimum",
      placement: "class-field",
      resolvedTargetType: "string",
      targetKind: "path",
      argumentExpression: "120",
    });
    const batched = checkNarrowSyntheticTagApplicabilities({
      applications: [
        {
          tagName: "minimum",
          placement: "class-field",
          resolvedTargetType: "string",
          targetKind: "path",
          argumentExpression: "120",
        },
      ],
    });

    expect(batched).toHaveLength(1);
    expect(batched[0]?.diagnostics).toEqual(single.diagnostics);
  });

  it("isolates batched narrow applications with incompatible value types", () => {
    const results = checkNarrowSyntheticTagApplicabilities({
      applications: [
        {
          tagName: "minimum",
          placement: "class-field",
          resolvedTargetType: "number",
          argumentExpression: "0",
        },
        {
          tagName: "minLength",
          placement: "class-field",
          resolvedTargetType: "string",
          argumentExpression: "3",
        },
      ],
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.diagnostics).toHaveLength(0);
    expect(results[1]?.diagnostics).toHaveLength(0);
  });

  it("propagates compilerOptions to the synthetic program without cross-contaminating the cache", () => {
    const application = {
      tagName: "minimum",
      placement: "class-field" as const,
      hostType: "FindLastResult",
      subjectType: "number",
      argumentExpression: "0",
      supportingDeclarations: ['type FindLastResult = ReturnType<number[]["findLast"]>;'],
    };

    const defaultLibResult = checkSyntheticTagApplication(application);
    expect(defaultLibResult.diagnostics).not.toHaveLength(0);
    expect(defaultLibResult.diagnostics[0]?.message).toContain("findLast");

    const es2023Result = checkSyntheticTagApplication({
      ...application,
      compilerOptions: { lib: ["lib.es2023.d.ts"] },
    });
    expect(es2023Result.diagnostics).toHaveLength(0);
  });

  it("keeps the synthetic batch cache at 64 entries and reuses it for mixed-tag canary batches", () => {
    expect(FORM_SPEC_SYNTHETIC_BATCH_CACHE_ENTRIES).toBe(64);

    const firstPerformance = createFormSpecPerformanceRecorder();
    const firstResults = checkSyntheticTagApplications({
      applications: MIXED_TAG_APPLICATIONS,
      performance: firstPerformance,
    });

    expect(firstResults).toHaveLength(MIXED_TAG_APPLICATIONS.length);
    expect(firstResults.every((result) => result.diagnostics.length === 0)).toBe(true);
    expect(
      firstPerformance.events.some(
        (event) => event.name === "analysis.syntheticCheckBatch.createProgram"
      )
    ).toBe(true);

    const secondPerformance = createFormSpecPerformanceRecorder();
    const secondResults = checkSyntheticTagApplications({
      applications: MIXED_TAG_APPLICATIONS,
      performance: secondPerformance,
    });

    expect(secondResults).toEqual(firstResults);
    expect(
      secondPerformance.events.some(
        (event) => event.name === "analysis.syntheticCheckBatch.cacheHit"
      )
    ).toBe(true);
    expect(
      secondPerformance.events.some(
        (event) => event.name === "analysis.syntheticCheckBatch.createProgram"
      )
    ).toBe(false);
  });
});
