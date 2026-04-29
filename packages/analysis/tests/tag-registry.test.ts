import { describe, expect, it } from "vitest";
import { defineAnnotation, defineExtension, defineMetadataSlot } from "@formspec/core";
import {
  getAllTagDefinitions,
  getInheritableAnnotationKeys,
  getTagDefinition,
  readExtensionRegistryFromSettings,
  readExtensionTagNames,
} from "../src/internal.js";

describe("tag-registry", () => {
  it("restores pre-extraction ecosystem and structure tags", () => {
    expect(getTagDefinition("apiName")).not.toBeNull();
    expect(getTagDefinition("order")).not.toBeNull();
    expect(getTagDefinition("showWhen")).not.toBeNull();
    expect(getTagDefinition("discriminator")).not.toBeNull();
    expect(getTagDefinition("defaultValue")).not.toBeNull();
    expect(getTagDefinition("deprecated")).not.toBeNull();
    expect(getTagDefinition("remarks")).not.toBeNull();
    expect(getTagDefinition("see")).not.toBeNull();
  });

  it("preserves legacy value kinds and target support for shared metadata", () => {
    expect(getTagDefinition("apiName")).toMatchObject({
      canonicalName: "apiName",
      valueKind: "string",
      category: "annotation",
      supportedTargets: ["none", "member", "variant"],
    });

    expect(getTagDefinition("order")).toMatchObject({
      canonicalName: "order",
      valueKind: "signedInteger",
      category: "annotation",
    });

    expect(getTagDefinition("showWhen")).toMatchObject({
      canonicalName: "showWhen",
      valueKind: "condition",
      category: "structure",
      allowDuplicates: true,
    });

    expect(getTagDefinition("discriminator")).toMatchObject({
      canonicalName: "discriminator",
      valueKind: null,
      category: "annotation",
      supportedTargets: ["path"],
      placements: ["class", "interface", "type-alias"],
    });

    expect(getTagDefinition("defaultValue")).toMatchObject({
      canonicalName: "defaultValue",
      valueKind: null,
      category: "ecosystem",
    });
  });

  it("normalizes names through the shared registry entry point", () => {
    expect(getTagDefinition("ApiName")?.canonicalName).toBe("apiName");
  });

  it("does not register the removed @description tag", () => {
    expect(getTagDefinition("description")).toBeNull();
    expect(getTagDefinition("Description")).toBeNull();
    expect(getAllTagDefinitions().map((tag) => tag.canonicalName)).not.toContain("description");
  });

  it("does not allow extensions to reintroduce the removed @description tag", () => {
    const extension = {
      extensionId: "x-example/description",
      constraintTags: [
        {
          tagName: "description",
        },
      ],
      metadataSlots: [
        defineMetadataSlot({
          slotId: "customDescription",
          tagName: "Description",
          declarationKinds: ["field"],
        }),
      ],
    };

    expect(getTagDefinition("description", [extension])).toBeNull();
    expect(getAllTagDefinitions([extension]).map((tag) => tag.canonicalName)).not.toContain(
      "description"
    );
  });

  // Regression: prior to fixing `buildExtraTagDefinition`, non-constraint
  // tags inherited a `capabilities` array derived from their value-kind
  // (e.g. `@displayName` → "string-like"), which then propagated into the
  // ESLint rule and narrow synthetic check as a field-type requirement.
  // Only built-in *constraint* tags should carry field-type capabilities.
  it("assigns empty capabilities to every non-constraint tag", () => {
    const NON_CONSTRAINT_TAGS = [
      // annotation
      "displayName",
      "format",
      "placeholder",
      "order",
      "apiName",
      "discriminator",
      // structure
      "group",
      "showWhen",
      "hideWhen",
      "enableWhen",
      "disableWhen",
      // ecosystem
      "defaultValue",
      "deprecated",
      "example",
      "remarks",
      "see",
    ] as const;

    for (const tagName of NON_CONSTRAINT_TAGS) {
      const definition = getTagDefinition(tagName);
      expect(definition, `expected @${tagName} to be registered`).not.toBeNull();
      expect(
        definition?.capabilities,
        `@${tagName} is non-constraint — its capabilities must be empty`
      ).toEqual([]);
    }
  });

  it("preserves capabilities on built-in constraint tags", () => {
    // Constraint tags legitimately express a field-type requirement; the
    // fix must not strip their capabilities.
    expect(getTagDefinition("minimum")?.capabilities).toEqual(["numeric-comparable"]);
    expect(getTagDefinition("minLength")?.capabilities).toEqual(["string-like"]);
    expect(getTagDefinition("minItems")?.capabilities).toEqual(["array-like"]);
    expect(getTagDefinition("enumOptions")?.capabilities).toEqual(["enum-member-addressable"]);
  });

  it("derives inheritable annotation keys from built-in tag definitions", () => {
    const inheritableBuiltins = getAllTagDefinitions()
      .filter((definition) => definition.inheritFromBase === "local-wins")
      .map((definition) => definition.canonicalName)
      .sort();

    expect(inheritableBuiltins).toEqual(["format"]);
    expect([...getInheritableAnnotationKeys()]).toEqual(["format"]);
    expect(getInheritableAnnotationKeys()).toBe(getInheritableAnnotationKeys());
  });

  it("adds extension custom annotation opt-ins under custom identity keys", () => {
    const extension = defineExtension({
      extensionId: "x-example/currency",
      annotations: [
        defineAnnotation({
          annotationName: "DisplayCurrency",
          inheritFromBase: "local-wins",
          tagDocumentation: {
            completionDetail: "Currency display annotation",
            payloadLabel: "<currency-code> [locale]",
            hoverSummary: "Controls how money values display currency.",
            hoverMarkdown:
              "Use `@displayCurrency <currency-code> [locale]` on money-shaped declarations.",
          },
        }),
        defineAnnotation({
          annotationName: "DisplayLocale",
        }),
        defineAnnotation({
          annotationName: "DisplayRegion",
          inheritFromBase: "never",
        }),
      ],
    });
    const extensions = [extension] as const;

    expect(getTagDefinition("DisplayCurrency", extensions)).toMatchObject({
      canonicalName: "displayCurrency",
      category: "annotation",
      completionDetail: "Currency display annotation",
      inheritFromBase: "local-wins",
      hoverSummary: "Controls how money values display currency.",
      hoverMarkdown:
        "Use `@displayCurrency <currency-code> [locale]` on money-shaped declarations.",
      signatures: [
        expect.objectContaining({
          label: "@displayCurrency <currency-code> [locale]",
          parameters: [
            expect.objectContaining({
              label: "<currency-code> [locale]",
            }),
          ],
        }),
      ],
    });
    expect(getTagDefinition("DisplayLocale", extensions)?.inheritFromBase).toBeUndefined();
    expect(getTagDefinition("DisplayRegion", extensions)?.inheritFromBase).toBe("never");
    expect(
      getAllTagDefinitions(extensions).filter((definition) =>
        definition.canonicalName.startsWith("display")
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalName: "displayCurrency",
          category: "annotation",
          inheritFromBase: "local-wins",
        }),
      ])
    );
    expect([...getInheritableAnnotationKeys(extensions)].sort()).toEqual([
      "custom:x-example/currency/DisplayCurrency",
      "format",
    ]);
    expect(getInheritableAnnotationKeys(extensions)).toBe(getInheritableAnnotationKeys(extensions));
  });

  it("rejects duplicate normalized annotation tag names", () => {
    const currencyExtension = defineExtension({
      extensionId: "x-example/currency",
      annotations: [
        defineAnnotation({
          annotationName: "DisplayUnit",
          inheritFromBase: "local-wins",
        }),
      ],
    });
    const inventoryExtension = defineExtension({
      extensionId: "x-example/inventory",
      annotations: [
        defineAnnotation({
          annotationName: "DisplayUnit",
          inheritFromBase: "local-wins",
        }),
      ],
    });

    expect(() => getTagDefinition("DisplayUnit", [currencyExtension, inventoryExtension])).toThrow(
      'Duplicate annotation tag: "@displayUnit"'
    );
    expect(() => getAllTagDefinitions([currencyExtension, inventoryExtension])).toThrow(
      'Duplicate annotation tag: "@displayUnit"'
    );
    expect(() => getInheritableAnnotationKeys([currencyExtension, inventoryExtension])).toThrow(
      'Duplicate annotation tag: "@displayUnit"'
    );
  });

  it("assigns empty capabilities to extension metadata tags regardless of value kind", () => {
    const extension = defineExtension({
      extensionId: "x-example/metadata",
      metadataSlots: [
        defineMetadataSlot({
          slotId: "externalName",
          tagName: "ExternalName",
          declarationKinds: ["field"],
        }),
      ],
    });

    expect(getTagDefinition("externalName", [extension])?.capabilities).toEqual([]);
  });

  it("normalizes extension metadata tag registrations to canonical names", () => {
    const extension = defineExtension({
      extensionId: "x-example/metadata",
      metadataSlots: [
        defineMetadataSlot({
          slotId: "externalName",
          tagName: "ExternalName",
          declarationKinds: ["field"],
        }),
      ],
    });

    expect(getTagDefinition("externalName", [extension])).toMatchObject({
      canonicalName: "externalName",
      supportedTargets: ["none"],
    });
  });

  it("rejects extension metadata slots that disable bare syntax without qualifiers", () => {
    const extension = defineExtension({
      extensionId: "x-example/metadata",
      metadataSlots: [
        defineMetadataSlot({
          slotId: "externalName",
          tagName: "externalName",
          declarationKinds: ["field"],
          allowBare: false,
        }),
      ],
    });

    expect(() => getTagDefinition("externalName", [extension])).toThrow(
      'Metadata tag "@externalName" must allow bare usage or declare at least one qualifier.'
    );
  });

  it("reads every extension-registered tag name from FormSpec settings", () => {
    const tagNames = readExtensionTagNames({
      formspec: {
        extensionRegistry: {
          extensions: [
            {
              constraintTags: [{ tagName: "@AfterDate" }, { tagName: "afterDate" }],
              metadataSlots: [{ tagName: "ExternalName" }],
              annotations: [{ annotationName: "@PrimaryField" }],
            },
            null,
            {
              constraintTags: [{ tagName: 123 }],
              metadataSlots: [{ tagName: null }],
              annotations: [{ annotationName: undefined }],
            },
          ],
        },
      },
    });

    expect([...tagNames].sort()).toEqual(["afterDate", "externalName", "primaryField"]);
  });

  it("returns the settings-bound extension registry through a shared reader", () => {
    const extensionRegistry = {
      extensions: [],
      findTypeByName: (typeName: string) =>
        typeName === "Decimal"
          ? {
              extensionId: "x-example/decimal",
              registration: { typeName: "Decimal" },
            }
          : undefined,
      findBuiltinConstraintBroadening: (typeId: string, tagName: string) =>
        typeId === "x-example/decimal/Decimal" && tagName === "minimum" ? {} : undefined,
    };

    expect(
      readExtensionRegistryFromSettings({
        formspec: { extensionRegistry },
      })
    ).toBe(extensionRegistry);
    expect(readExtensionRegistryFromSettings({ formspec: {} })).toBeUndefined();
    expect(
      readExtensionRegistryFromSettings({ formspec: { extensionRegistry: null } })
    ).toBeUndefined();
  });

  it("ignores malformed registry methods without losing valid extension names", () => {
    const settings = {
      formspec: {
        extensionRegistry: {
          extensions: [null, [], { constraintTags: [{ tagName: "@AfterDate" }] }],
          findTypeByName: true,
          findBuiltinConstraintBroadening: {},
        },
      },
    };

    const registry = readExtensionRegistryFromSettings(settings);

    expect(registry?.extensions).toHaveLength(1);
    expect(registry?.extensions?.[0]).toEqual({ constraintTags: [{ tagName: "@AfterDate" }] });
    expect(registry?.findTypeByName).toBeUndefined();
    expect(registry?.findBuiltinConstraintBroadening).toBeUndefined();
    expect([...readExtensionTagNames(settings)]).toEqual(["afterDate"]);
  });
});
