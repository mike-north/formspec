import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeNamedTypeToIR } from "../analyzer/program.js";
import { generateSchemas } from "../generators/class-schema.js";

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
        'import type { Customer, Organization, ApiNamedAccount, InferredAccountCarrier, ObjectAliasCarrier, IntersectionAliasCarrier, UnionIdentityCarrier, GenericCarrier, MissingCarrier } from "./names.js";',
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
