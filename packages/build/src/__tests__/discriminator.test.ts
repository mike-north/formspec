import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeNamedTypeToIR } from "../analyzer/program.js";
import { generateSchemas } from "../generators/class-schema.js";

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  expect(value, label).toBeDefined();
  expect(value, label).not.toBeNull();
  expect(typeof value, label).toBe("object");

  if (value === null || typeof value !== "object") {
    throw new Error(label);
  }

  return value as Record<string, unknown>;
}

describe("@discriminator schema generation", () => {
  let tmpDir: string;
  let fixturePath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-discriminator-"));

    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "nodenext",
            strict: true,
            skipLibCheck: true,
          },
        },
        null,
        2
      )
    );

    fs.writeFileSync(
      path.join(tmpDir, "names.ts"),
      [
        "/** @apiName customer_record */",
        "export interface Customer {",
        "  id: string;",
        "}",
        "",
        "export interface Organization {",
        '  kind: "organization";',
        "  id: string;",
        "}",
        "",
        "/** @apiName api_named_account */",
        "export interface ApiNamedAccount {",
        "  id: string;",
        "}",
        "",
        "export interface InferredAccountCarrier {",
        "  id: string;",
        "}",
        "",
        "/** @apiName customer_record */",
        "export interface CustomerObjectCarrier {",
        '  readonly object: "customer";',
        "  readonly id: string;",
        "}",
        "",
        "/** @apiName custom_bar */",
        "export class Bar {",
        "  readonly object!: string;",
        "  readonly id!: string;",
        "}",
        "",
        "export class InferredObjectCarrier {",
        "  readonly object!: string;",
        "  readonly id!: string;",
        "}",
        "",
        "export type ObjectAliasCarrier = {",
        '  kind: "object_alias_carrier";',
        "  id: string;",
        "};",
        "",
        "export type IntersectionAliasCarrier = {",
        '  kind: "intersection_alias_carrier";',
        "  id: string;",
        "} & {",
        "  extra?: string;",
        "}",
        "",
        "export interface UnionIdentityCarrier {",
        '  kind: "customer" | "organization";',
        "  id: string;",
        "}",
        "",
        "export interface GenericCarrier<T> {",
        "  id: T;",
        "}",
        "",
        "export interface MissingCarrier {",
        "  id: string;",
        "}",
        "",
        "export type ExtractObjectTag<T> = T extends { readonly object: infer O }",
        "  ? O extends string ? O : never",
        "  : never;",
      ].join("\n")
    );

    fs.writeFileSync(
      path.join(tmpDir, "aliases.ts"),
      [
        'export type { Customer as ReExportedCustomer } from "./names.js";',
        'export { Organization as ReExportedOrganization } from "./names.js";',
      ].join("\n")
    );

    fixturePath = path.join(tmpDir, "fixture.ts");
    fs.writeFileSync(
      fixturePath,
      [
        'import type { Customer, Organization, ApiNamedAccount, InferredAccountCarrier, CustomerObjectCarrier, ObjectAliasCarrier, IntersectionAliasCarrier, UnionIdentityCarrier, GenericCarrier, MissingCarrier, ExtractObjectTag } from "./names.js";',
        'import { Bar, InferredObjectCarrier } from "./names.js";',
        'import type { ReExportedCustomer, ReExportedOrganization } from "./aliases.js";',
        "",
        "/** @discriminator :kind T */",
        "export interface TaggedValue<T> {",
        "  kind: string;",
        "  id: string;",
        "}",
        "",
        "/** @discriminator :kind T */",
        "export class TaggedClass<T> {",
        "  kind!: string;",
        "  id!: string;",
        "}",
        "",
        "/** @discriminator :kind T */",
        "export type TaggedAlias<T> = {",
        "  kind: string;",
        "  id: string;",
        "};",
        "",
        "/** @discriminator :type T */",
        "export type LiteralPointer<T extends { readonly object: string }> = {",
        "  type: ExtractObjectTag<T>;",
        "  id: string;",
        "  url: string;",
        "  readonly __type?: T;",
        "};",
        "",
        "/** @discriminator :type T */",
        "export type ParenthesizedLiteralPointer<T extends { readonly object: string }> = ({",
        "  type: ExtractObjectTag<T>;",
        "  id: string;",
        "  url: string;",
        "  readonly __type?: T;",
        "});",
        "",
        "/** @discriminator :type T */",
        "export type IntersectionPointer<T extends { readonly object: string }> = {",
        "  type: ExtractObjectTag<T>;",
        "  id: string;",
        "  url: string;",
        "} & {",
        "  readonly __type?: T;",
        "};",
        "",
        "/** @discriminator :type T */",
        "export type ParenthesizedIntersectionPointer<T extends { readonly object: string }> = ({",
        "  type: ExtractObjectTag<T>;",
        "  id: string;",
        "  url: string;",
        "} & {",
        "  readonly __type?: T;",
        "});",
        "",
        "export type LocalExtractObjectTag<T> = T extends { readonly object: infer O }",
        "  ? O extends string ? O : never",
        "  : never;",
        "",
        "/** @discriminator :type T */",
        "export type SameFileHelperPointer<T extends { readonly object: string }> = {",
        "  type: LocalExtractObjectTag<T>;",
        "  id: string;",
        "  url: string;",
        "};",
        "",
        "/** @discriminator :type T */",
        "export type InlineConditionalPointer<T extends { readonly object: string }> = {",
        "  type: T extends { readonly object: infer O } ? O extends string ? O : never : never;",
        "  id: string;",
        "  url: string;",
        "};",
        "",
        "export interface ValidWrapper {",
        "  fromInterface: TaggedValue<Customer>;",
        "  fromClass: TaggedClass<Organization>;",
        "  fromAlias: TaggedAlias<ReExportedCustomer>;",
        '  literal: TaggedValue<"manual_literal">;',
        "  fromReExport: TaggedValue<ReExportedOrganization>;",
        "  fromApiName: TaggedValue<ApiNamedAccount>;",
        "  fromInferred: TaggedValue<InferredAccountCarrier>;",
        "  fromObjectAlias: TaggedValue<ObjectAliasCarrier>;",
        "  fromIntersectionAlias: TaggedValue<IntersectionAliasCarrier>;",
        "  fromGenericString: TaggedValue<GenericCarrier<string>>;",
        "  fromGenericNumber: TaggedValue<GenericCarrier<number>>;",
        "}",
        "",
        "export interface GenericObjectAliasWrapper {",
        "  fromLiteralAlias: LiteralPointer<CustomerObjectCarrier>;",
        "  fromParenthesizedLiteralAlias: ParenthesizedLiteralPointer<CustomerObjectCarrier>;",
        "  fromIntersectionAlias: IntersectionPointer<CustomerObjectCarrier>;",
        "  fromParenthesizedIntersectionAlias: ParenthesizedIntersectionPointer<CustomerObjectCarrier>;",
        "  fromMetadataFallback: IntersectionPointer<Bar>;",
        "  fromInferredMetadataFallback: IntersectionPointer<InferredObjectCarrier>;",
        "}",
        "",
        "export interface SameFileConditionalHelperWrapper {",
        "  importedHelperMetadataFallback: LiteralPointer<Bar>;",
        "  sameFileHelperMetadataFallback: SameFileHelperPointer<Bar>;",
        "  sameFileInlineMetadataFallback: InlineConditionalPointer<Bar>;",
        "  sameFileHelperInferredMetadataFallback: SameFileHelperPointer<InferredObjectCarrier>;",
        "}",
        "",
        "/** @discriminator :kind T */",
        "export interface OptionalTaggedValue<T> {",
        "  kind?: string;",
        "  id: string;",
        "}",
        "",
        "export interface OptionalWrapper {",
        "  bad: OptionalTaggedValue<Customer>;",
        "}",
        "",
        "/** @discriminator :meta.kind T */",
        "export interface NestedTaggedValue<T> {",
        "  kind: string;",
        "  id: string;",
        "}",
        "",
        "export interface NestedWrapper {",
        "  bad: NestedTaggedValue<Customer>;",
        "}",
        "",
        "export interface UnionWrapper {",
        '  bad: TaggedValue<"customer" | "organization">;',
        "}",
        "",
        "export interface UnionIdentityWrapper {",
        "  bad: TaggedValue<UnionIdentityCarrier>;",
        "}",
        "",
        "/** @discriminator :kind T */",
        "export interface NumberKindTaggedValue<T> {",
        "  kind: number;",
        "  id: string;",
        "}",
        "",
        "export interface NumberKindWrapper {",
        "  bad: NumberKindTaggedValue<Customer>;",
        "}",
        "",
        "/** @discriminator :kind U */",
        "export interface UnknownTypeParameterTaggedValue<T> {",
        "  kind: string;",
        "  id: string;",
        "}",
        "",
        "export interface UnknownTypeParameterWrapper {",
        "  bad: UnknownTypeParameterTaggedValue<Customer>;",
        "}",
        "",
        "export interface MissingCarrierWrapper {",
        "  bad: TaggedValue<MissingCarrier>;",
        "}",
      ].join("\n")
    );
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("preserves concrete type arguments on generic references in the IR", () => {
    const analysis = analyzeNamedTypeToIR(fixturePath, "ValidWrapper");
    const field = analysis.fields.find((candidate) => candidate.name === "fromInterface");

    expect(field?.type.kind).toBe("reference");
    if (field?.type.kind === "reference") {
      expect(field.type.typeArguments).toHaveLength(1);
      expect(field.type.typeArguments[0]).toEqual({
        kind: "reference",
        name: "Customer",
        typeArguments: [],
      });
    }
  });

  it("specializes discriminator fields to singleton enums for explicit, literal-property, inferred, object-alias, re-export, and generic-instantiation sources", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "ValidWrapper",
      metadata: {
        type: {
          apiName: {
            mode: "infer-if-missing",
            infer: ({ logicalName }) =>
              logicalName.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase(),
          },
        },
      },
    });

    const rootProperties = result.jsonSchema.properties as Record<string, unknown>;
    const defs = result.jsonSchema.$defs ?? {};
    const resolvePropertySchema = (propertyName: string): Record<string, unknown> => {
      const propertySchema = rootProperties[propertyName];
      expect(propertySchema).toBeDefined();
      expect(typeof propertySchema).toBe("object");
      expect(propertySchema).not.toBeNull();

      const propertyRecord = propertySchema as Record<string, unknown>;
      const ref = typeof propertyRecord["$ref"] === "string" ? propertyRecord["$ref"] : undefined;
      if (ref === undefined) {
        return propertyRecord;
      }

      expect(ref.startsWith("#/$defs/")).toBe(true);
      const definitionName = ref.replace(/^#\/\$defs\//u, "");
      const definition = defs[definitionName];
      expect(definition).toBeDefined();
      expect(typeof definition).toBe("object");
      expect(definition).not.toBeNull();
      return definition as Record<string, unknown>;
    };
    const expectResolvedKindEnum = (propertyName: string, expectedValue: string): void => {
      expect(resolvePropertySchema(propertyName)).toMatchObject({
        type: "object",
        properties: {
          kind: {
            enum: [expectedValue],
          },
        },
      });
    };

    expectResolvedKindEnum("fromInterface", "customer_record");
    expectResolvedKindEnum("fromClass", "organization");
    expectResolvedKindEnum("fromAlias", "customer_record");
    expectResolvedKindEnum("literal", "manual_literal");
    expectResolvedKindEnum("fromReExport", "organization");
    expectResolvedKindEnum("fromApiName", "api_named_account");
    expectResolvedKindEnum("fromInferred", "inferred_account_carrier");
    expectResolvedKindEnum("fromObjectAlias", "object_alias_carrier");
    expectResolvedKindEnum("fromIntersectionAlias", "intersection_alias_carrier");
    expectResolvedKindEnum("fromGenericString", "generic_carrier__string");
    expectResolvedKindEnum("fromGenericNumber", "generic_carrier__number");
  });

  it("specializes generic object aliases across literal and intersection shapes", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "GenericObjectAliasWrapper",
      metadata: {
        type: {
          apiName: {
            mode: "infer-if-missing",
            infer: ({ logicalName }) =>
              logicalName.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase(),
          },
        },
      },
    });

    const rootProperties = result.jsonSchema.properties as Record<string, unknown>;
    const defs = result.jsonSchema.$defs ?? {};
    const resolvePropertySchema = (propertyName: string): Record<string, unknown> => {
      const propertySchema = rootProperties[propertyName];
      expect(propertySchema).toBeDefined();
      expect(typeof propertySchema).toBe("object");
      expect(propertySchema).not.toBeNull();

      const propertyRecord = propertySchema as Record<string, unknown>;
      const ref = typeof propertyRecord["$ref"] === "string" ? propertyRecord["$ref"] : undefined;
      if (ref === undefined) {
        return propertyRecord;
      }

      expect(ref.startsWith("#/$defs/")).toBe(true);
      const definitionName = ref.replace(/^#\/\$defs\//u, "");
      const definition = defs[definitionName];
      expect(definition).toBeDefined();
      expect(typeof definition).toBe("object");
      expect(definition).not.toBeNull();
      return definition as Record<string, unknown>;
    };
    const expectResolvedTypeEnum = (propertyName: string, expectedValue: string): void => {
      expect(resolvePropertySchema(propertyName)).toMatchObject({
        type: "object",
        properties: {
          type: {
            enum: [expectedValue],
          },
        },
      });
    };

    expectResolvedTypeEnum("fromLiteralAlias", "customer");
    expectResolvedTypeEnum("fromParenthesizedLiteralAlias", "customer");
    expectResolvedTypeEnum("fromIntersectionAlias", "customer");
    expectResolvedTypeEnum("fromParenthesizedIntersectionAlias", "customer");
    expectResolvedTypeEnum("fromMetadataFallback", "custom_bar");
    expectResolvedTypeEnum("fromInferredMetadataFallback", "inferred_object_carrier");
  });

  it("applies discriminator apiNamePrefix only to metadata-derived discriminator values", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "GenericObjectAliasWrapper",
      metadata: {
        type: {
          apiName: {
            mode: "infer-if-missing",
            infer: ({ logicalName }) =>
              logicalName.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase(),
          },
        },
      },
      discriminator: {
        apiNamePrefix: "v2.custom.",
      },
    });

    const rootProperties = result.jsonSchema.properties as Record<string, unknown>;
    const defs = result.jsonSchema.$defs ?? {};
    const resolveTypeEnum = (propertyName: string): readonly unknown[] => {
      const propertySchemaRecord = expectRecord(
        rootProperties[propertyName],
        `Missing schema for ${propertyName}`
      );
      const ref =
        typeof propertySchemaRecord["$ref"] === "string"
          ? propertySchemaRecord["$ref"]
          : undefined;
      const resolvedSchemaRecord = expectRecord(
        ref === undefined
          ? propertySchemaRecord
          : defs[ref.replace(/^#\/\$defs\//u, "")] ?? null,
        `Missing resolved schema for ${propertyName}`
      );
      const propertiesRecord = expectRecord(
        resolvedSchemaRecord["properties"],
        `Missing properties for ${propertyName}`
      );
      const typePropertyRecord = expectRecord(
        propertiesRecord["type"],
        `Missing discriminator field schema for ${propertyName}`
      );

      return typePropertyRecord["enum"] as readonly unknown[];
    };

    expect(resolveTypeEnum("fromLiteralAlias")).toEqual(["customer"]);
    expect(resolveTypeEnum("fromMetadataFallback")).toEqual(["v2.custom.custom_bar"]);
    expect(resolveTypeEnum("fromInferredMetadataFallback")).toEqual([
      "v2.custom.inferred_object_carrier",
    ]);
  });

  it("supports same-file conditional helper aliases for metadata-backed discriminator fallback", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "SameFileConditionalHelperWrapper",
      metadata: {
        type: {
          apiName: {
            mode: "infer-if-missing",
            infer: ({ logicalName }) =>
              logicalName.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase(),
          },
        },
      },
      discriminator: {
        apiNamePrefix: "prefixed_",
      },
    });

    const rootProperties = result.jsonSchema.properties as Record<string, unknown>;
    const defs = result.jsonSchema.$defs ?? {};
    const resolveTypeEnum = (propertyName: string): readonly unknown[] => {
      const propertySchemaRecord = expectRecord(
        rootProperties[propertyName],
        `Missing schema for ${propertyName}`
      );
      const ref =
        typeof propertySchemaRecord["$ref"] === "string"
          ? propertySchemaRecord["$ref"]
          : undefined;
      const resolvedSchemaRecord = expectRecord(
        ref === undefined
          ? propertySchemaRecord
          : defs[ref.replace(/^#\/\$defs\//u, "")] ?? null,
        `Missing resolved schema for ${propertyName}`
      );
      const propertiesRecord = expectRecord(
        resolvedSchemaRecord["properties"],
        `Missing properties for ${propertyName}`
      );
      const typePropertyRecord = expectRecord(
        propertiesRecord["type"],
        `Missing discriminator field schema for ${propertyName}`
      );

      return typePropertyRecord["enum"] as readonly unknown[];
    };

    expect(resolveTypeEnum("importedHelperMetadataFallback")).toEqual(["prefixed_custom_bar"]);
    expect(resolveTypeEnum("sameFileHelperMetadataFallback")).toEqual(["prefixed_custom_bar"]);
    expect(resolveTypeEnum("sameFileInlineMetadataFallback")).toEqual(["prefixed_custom_bar"]);
    expect(resolveTypeEnum("sameFileHelperInferredMetadataFallback")).toEqual([
      "prefixed_inferred_object_carrier",
    ]);
  });

  it("rejects optional discriminator fields", () => {
    expect(() =>
      generateSchemas({
        filePath: fixturePath,
        typeName: "OptionalWrapper",
      })
    ).toThrow(/TYPE_MISMATCH[\s\S]*kind/);
  });

  it("rejects nested discriminator targets in v1", () => {
    expect(() =>
      generateSchemas({
        filePath: fixturePath,
        typeName: "NestedWrapper",
      })
    ).toThrow(/INVALID_TAG_ARGUMENT/);
  });

  it("rejects union-valued discriminator sources in v1", () => {
    expect(() =>
      generateSchemas({
        filePath: fixturePath,
        typeName: "UnionWrapper",
      })
    ).toThrow(/INVALID_TAG_ARGUMENT/);
  });

  it("rejects union-valued identity properties in v1", () => {
    expect(() =>
      generateSchemas({
        filePath: fixturePath,
        typeName: "UnionIdentityWrapper",
      })
    ).toThrow(/INVALID_TAG_ARGUMENT/);
  });

  it("rejects discriminator targets that are not string-like", () => {
    expect(() =>
      generateSchemas({
        filePath: fixturePath,
        typeName: "NumberKindWrapper",
      })
    ).toThrow(/TYPE_MISMATCH[\s\S]*kind/);
  });

  it("rejects discriminator sources that are not local type parameters", () => {
    expect(() =>
      generateSchemas({
        filePath: fixturePath,
        typeName: "UnknownTypeParameterWrapper",
      })
    ).toThrow(/INVALID_TAG_ARGUMENT[\s\S]*U/);
  });

  it("rejects discriminator sources when no JSON-facing value can be derived", () => {
    expect(() =>
      generateSchemas({
        filePath: fixturePath,
        typeName: "MissingCarrierWrapper",
      })
    ).toThrow(/INVALID_TAG_ARGUMENT/);
  });
});
