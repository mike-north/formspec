import { describe, expect, it } from "vitest";
import { defineExtension, defineMetadataSlot } from "@formspec/core";
import { getTagDefinition } from "../internal.js";

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

  it("annotation tags have empty capabilities regardless of value kind", () => {
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

    // displayName takes a string value but must not be restricted to string fields
    expect(getTagDefinition("displayName")?.capabilities).toEqual([]);
    expect(getTagDefinition("apiName")?.capabilities).toEqual([]);
    expect(getTagDefinition("description")?.capabilities).toEqual([]);
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
});
