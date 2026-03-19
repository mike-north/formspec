/**
 * Tests for interface and type alias schema generation.
 *
 * Covers the `generateSchemas` unified entry point, `analyzeInterface`,
 * `analyzeTypeAlias`, `extractJSDocFieldMetadata`, `@EnumOptions` JSON
 * parsing, nested type propagation, and error paths.
 *
 * @see https://json-schema.org/understanding-json-schema
 */

import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { generateSchemas } from "../generators/class-schema.js";
import {
  createProgramContext,
  findInterfaceByName,
  findTypeAliasByName,
} from "../analyzer/program.js";
import { analyzeInterface, analyzeTypeAlias } from "../analyzer/class-analyzer.js";
import { extractJSDocFieldMetadata } from "../analyzer/jsdoc-constraints.js";

const fixturesDir = path.join(__dirname, "fixtures");
const fixturePath = path.join(fixturesDir, "example-interface-types.ts");

// Shared program context for fixture analysis
function getCtx() {
  return createProgramContext(fixturePath);
}

/** Finds an interface in the fixture or throws with a descriptive message. */
function requireInterface(name: string) {
  const ctx = getCtx();
  const decl = findInterfaceByName(ctx.sourceFile, name);
  if (!decl) throw new Error(`Test precondition failed: interface "${name}" not found in fixture`);
  return { decl, ctx };
}

/** Finds a type alias in the fixture or throws with a descriptive message. */
function requireTypeAlias(name: string) {
  const ctx = getCtx();
  const decl = findTypeAliasByName(ctx.sourceFile, name);
  if (!decl) throw new Error(`Test precondition failed: type alias "${name}" not found in fixture`);
  return { decl, ctx };
}

// ============================================================================
// generateSchemas — unified entry point
// ============================================================================

describe("generateSchemas", () => {
  it("resolves a class automatically", () => {
    // Uses the existing class fixture
    const result = generateSchemas({
      filePath: path.join(fixturesDir, "example-a-builtins.ts"),
      typeName: "ExampleAForm",
    });
    expect(result.jsonSchema.type).toBe("object");
    expect(result.jsonSchema.properties).toBeDefined();
  });

  it("resolves an interface automatically", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "SimpleConfig",
    });
    expect(result.jsonSchema.type).toBe("object");
    expect(result.jsonSchema.properties?.["name"]).toHaveProperty("title", "Full Name");
  });

  it("resolves a type alias automatically", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "SimpleTypeAlias",
    });
    expect(result.jsonSchema.type).toBe("object");
    expect(result.jsonSchema.properties?.["label"]).toHaveProperty("title", "Label");
  });

  it("throws for unknown type names", () => {
    expect(() =>
      generateSchemas({
        filePath: fixturePath,
        typeName: "NonExistentType",
      })
    ).toThrow(/not found as a class, interface, or type alias/);
  });

  it("throws with descriptive error for non-object type alias", () => {
    expect(() =>
      generateSchemas({
        filePath: fixturePath,
        typeName: "StringAlias",
      })
    ).toThrow(/not an object type literal/);
  });

  it("includes line number in type alias error", () => {
    expect(() =>
      generateSchemas({
        filePath: fixturePath,
        typeName: "StringAlias",
      })
    ).toThrow(/line \d+/);
  });
});

// ============================================================================
// Interface analysis
// ============================================================================

describe("analyzeInterface", () => {
  it("extracts fields from a simple interface", () => {
    const { decl, ctx } = requireInterface("SimpleConfig");
    const analysis = analyzeInterface(decl, ctx.checker);

    expect(analysis.name).toBe("SimpleConfig");
    expect(analysis.fields).toHaveLength(4);
    expect(analysis.instanceMethods).toHaveLength(0);
    expect(analysis.staticMethods).toHaveLength(0);
  });

  it("detects optional fields", () => {
    const { decl, ctx } = requireInterface("SimpleConfig");
    const analysis = analyzeInterface(decl, ctx.checker);

    const nameField = analysis.fields.find((f) => f.name === "name");
    const emailField = analysis.fields.find((f) => f.name === "email");
    expect(nameField?.optional).toBe(false);
    expect(emailField?.optional).toBe(true);
  });

  it("detects @deprecated on interface properties", () => {
    const { decl, ctx } = requireInterface("DeprecatedFieldInterface");
    const analysis = analyzeInterface(decl, ctx.checker);

    const nameField = analysis.fields.find((f) => f.name === "name");
    const fullNameField = analysis.fields.find((f) => f.name === "fullName");
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing deprecated field detection
    expect(nameField?.deprecated).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- testing deprecated field detection
    expect(fullNameField?.deprecated).toBe(false);
  });

  it("handles empty interface", () => {
    const { decl, ctx } = requireInterface("EmptyInterface");
    const analysis = analyzeInterface(decl, ctx.checker);

    expect(analysis.name).toBe("EmptyInterface");
    expect(analysis.fields).toHaveLength(0);
  });
});

// ============================================================================
// Type alias analysis
// ============================================================================

describe("analyzeTypeAlias", () => {
  it("succeeds for object type literal aliases", () => {
    const { decl, ctx } = requireTypeAlias("SimpleTypeAlias");
    const result = analyzeTypeAlias(decl, ctx.checker);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.analysis.name).toBe("SimpleTypeAlias");
      expect(result.analysis.fields).toHaveLength(3);
    }
  });

  it("returns error for non-object type aliases", () => {
    const { decl, ctx } = requireTypeAlias("StringAlias");
    const result = analyzeTypeAlias(decl, ctx.checker);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("StringAlias");
      expect(result.error).toContain("not an object type literal");
      expect(result.error).toMatch(/line \d+/);
    }
  });

  it("returns error for union type aliases", () => {
    const { decl, ctx } = requireTypeAlias("UnionAlias");
    const result = analyzeTypeAlias(decl, ctx.checker);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("UnionAlias");
    }
  });
});

// ============================================================================
// @Field_displayName and @Field_description extraction
// ============================================================================

describe("extractJSDocFieldMetadata", () => {
  it("extracts @Field_displayName and @Field_description from interface properties", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "SimpleConfig",
    });

    const props = result.jsonSchema.properties ?? {};
    expect(props["name"]).toMatchObject({
      title: "Full Name",
      description: "The user's legal name",
    });
  });

  it("extracts @Field_displayName without @Field_description", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "SimpleConfig",
    });

    const props = result.jsonSchema.properties ?? {};
    expect(props["active"]).toHaveProperty("title", "Active");
    expect(props["active"]).not.toHaveProperty("description");
  });

  it("maps @Field_displayName to UI Schema label", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "SimpleConfig",
    });

    const nameControl = result.uiSchema.elements.find(
      (e) => e.type === "Control" && e.scope === "#/properties/name"
    );
    expect(nameControl).toHaveProperty("label", "Full Name");
    // description is not part of JSON Forms ControlElement; it lives in JSON Schema title/description
  });

  it("returns null when no metadata tags are present", () => {
    const { decl } = requireInterface("EmptyInterface");
    // EmptyInterface has no members, so nothing to extract
    for (const member of decl.members) {
      const metadata = extractJSDocFieldMetadata(member);
      expect(metadata).toBeNull();
    }
  });
});

// ============================================================================
// Constraint tag extraction on interfaces/type aliases
// ============================================================================

describe("constraint tags on interfaces", () => {
  it("applies @Minimum, @Maximum, @MinLength, @MaxLength, @Pattern", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "SimpleConfig",
    });

    const props = result.jsonSchema.properties ?? {};
    expect(props["name"]).toMatchObject({ minLength: 1, maxLength: 200 });
    expect(props["age"]).toMatchObject({ minimum: 0, maximum: 150 });
    expect(props["email"]).toHaveProperty("pattern", "^[^@]+@[^@]+$");
  });

  it("applies constraints on type aliases", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "SimpleTypeAlias",
    });

    const props = result.jsonSchema.properties ?? {};
    expect(props["label"]).toMatchObject({ minLength: 1 });
    expect(props["count"]).toMatchObject({ minimum: 0 });
  });

  it("tracks required vs optional fields", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "SimpleConfig",
    });

    expect(result.jsonSchema.required).toContain("name");
    expect(result.jsonSchema.required).toContain("age");
    expect(result.jsonSchema.required).toContain("active");
    expect(result.jsonSchema.required).not.toContain("email");
  });

  it("omits required when all fields are optional", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "OnlyOptionalFields",
    });

    expect(result.jsonSchema.required).toBeUndefined();
  });
});

// ============================================================================
// @EnumOptions JSON tag
// ============================================================================

describe("@EnumOptions TSDoc tag", () => {
  it("parses simple string array — UI Schema emits a Control for the field", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "WithEnumOptions",
    });

    // The UI Schema emits a Control for the field
    const statusControl = result.uiSchema.elements.find(
      (e) => e.type === "Control" && e.scope === "#/properties/status"
    );
    expect(statusControl).toBeDefined();
  });

  it("parses labeled object array — UI Schema emits a Control for the field", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "WithEnumOptions",
    });

    // The UI Schema emits a Control for the field
    const priorityControl = result.uiSchema.elements.find(
      (e) => e.type === "Control" && e.scope === "#/properties/priority"
    );
    expect(priorityControl).toBeDefined();
  });

  it("parses @EnumOptions on type alias", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "TypeAliasWithEnumOptions",
    });

    const colorSchema = result.jsonSchema.properties?.["color"];
    expect(colorSchema?.enum).toEqual(["red", "green", "blue"]);

    const colorControl = result.uiSchema.elements.find(
      (e) => e.type === "Control" && e.scope === "#/properties/color"
    );
    expect(colorControl).toBeDefined();
  });

  it("does not add EnumOptions when tag is absent", () => {
    const { decl, ctx } = requireInterface("SimpleConfig");
    const analysis = analyzeInterface(decl, ctx.checker);
    const nameField = analysis.fields.find((f) => f.name === "name");
    expect(nameField?.decorators.find((d) => d.name === "EnumOptions")).toBeUndefined();
  });
});

// ============================================================================
// Nested type propagation
// ============================================================================

describe("nested interface and type alias propagation", () => {
  it("propagates TSDoc constraints from nested interface", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "NestedConfig",
    });

    const address = result.jsonSchema.properties?.["address"] as Record<string, unknown>;
    expect(address["type"]).toBe("object");

    const addressProps = address["properties"] as Record<string, Record<string, unknown>>;
    expect(addressProps["street"]).toMatchObject({
      title: "Street",
      minLength: 1,
      maxLength: 200,
    });
    expect(addressProps["city"]).toMatchObject({
      title: "City",
      minLength: 1,
    });
    expect(addressProps["zip"]).toMatchObject({
      title: "Zip",
      pattern: "^[0-9]{5}$",
    });
  });

  it("propagates TSDoc constraints from nested type alias", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "NestedConfig",
    });

    const contact = result.jsonSchema.properties?.["contact"] as Record<string, unknown>;
    expect(contact["type"]).toBe("object");

    const contactProps = contact["properties"] as Record<string, Record<string, unknown>>;
    expect(contactProps["email"]).toMatchObject({
      title: "Email",
      pattern: "^[^@]+@[^@]+$",
    });
    expect(contactProps["phone"]).toMatchObject({
      title: "Phone",
      maxLength: 20,
    });
  });

  it("tracks required fields in nested types", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "NestedConfig",
    });

    const address = result.jsonSchema.properties?.["address"] as Record<string, unknown>;
    expect(address["required"]).toContain("street");
    expect(address["required"]).toContain("city");
    expect(address["required"]).not.toContain("zip");

    const contact = result.jsonSchema.properties?.["contact"] as Record<string, unknown>;
    expect(contact["required"]).toContain("email");
    expect(contact["required"]).not.toContain("phone");
  });
});

// ============================================================================
// Constrained primitive type aliases
// ============================================================================

describe("constrained primitive type aliases", () => {
  it("propagates @Minimum/@Maximum from type Percent = number", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "ConfigWithAliasedTypes",
    });

    const props = result.jsonSchema.properties ?? {};
    expect(props["discount"]).toMatchObject({
      type: "number",
      title: "Discount",
      minimum: 0,
      maximum: 100,
    });
  });

  it("propagates @MinLength/@MaxLength/@Pattern from type Email = string", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "ConfigWithAliasedTypes",
    });

    const props = result.jsonSchema.properties ?? {};
    expect(props["contactEmail"]).toMatchObject({
      type: "string",
      title: "Contact Email",
      minLength: 1,
      maxLength: 255,
      pattern: "^[^@]+@[^@]+$",
    });
  });

  it("propagates @Field_displayName/@Field_description from annotated type alias", () => {
    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "ConfigWithAliasedTypes",
    });

    const props = result.jsonSchema.properties ?? {};
    // The field's own @Field_displayName "Tax Rate" should take precedence,
    // but the alias constraints (@Minimum, @Maximum) should merge in
    expect(props["taxRate"]).toMatchObject({
      type: "number",
      minimum: 0,
      maximum: 100,
    });
  });
});

// ============================================================================
// Finder functions
// ============================================================================

describe("findInterfaceByName", () => {
  it("finds an existing interface", () => {
    const { decl } = requireInterface("SimpleConfig");
    expect(decl.name.text).toBe("SimpleConfig");
  });

  it("returns null for non-existent interface", () => {
    const ctx = getCtx();
    const decl = findInterfaceByName(ctx.sourceFile, "DoesNotExist");
    expect(decl).toBeNull();
  });
});

describe("findTypeAliasByName", () => {
  it("finds an existing type alias", () => {
    const { decl } = requireTypeAlias("SimpleTypeAlias");
    expect(decl.name.text).toBe("SimpleTypeAlias");
  });

  it("returns null for non-existent type alias", () => {
    const ctx = getCtx();
    const decl = findTypeAliasByName(ctx.sourceFile, "DoesNotExist");
    expect(decl).toBeNull();
  });
});
