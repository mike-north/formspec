/**
 * Tests for the IR analysis pipeline.
 *
 * Verifies that `analyzeClassToIR`, `analyzeInterfaceToIR`, and
 * `analyzeTypeAliasToIR` produce canonical IR nodes (FieldNode,
 * TypeNode, ConstraintNode, AnnotationNode) directly.
 *
 * @see packages/core/src/types/ir.ts for IR type definitions
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  defineExtension,
  defineMetadataSlot,
  type FieldNode,
  type ConstraintNode,
  type AnnotationNode,
} from "@formspec/core/internals";
import {
  createProgramContext,
  findClassByName,
  findInterfaceByName,
  findTypeAliasByName,
} from "../src/analyzer/program.js";
import {
  analyzeClassToIR,
  analyzeInterfaceToIR,
  analyzeTypeAliasToIR,
} from "../src/analyzer/class-analyzer.js";
import { createExtensionRegistry } from "../src/extensions/index.js";

const fixturesDir = path.join(__dirname, "fixtures");
const sampleFormsPath = path.join(fixturesDir, "sample-forms.ts");
const interfaceFixturePath = path.join(fixturesDir, "example-interface-types.ts");

// =============================================================================
// Helper functions
// =============================================================================

function findField(fields: readonly FieldNode[], name: string): FieldNode {
  const field = fields.find((f) => f.name === name);
  if (!field) throw new Error(`Field "${name}" not found`);
  return field;
}

function findConstraint(constraints: readonly ConstraintNode[], kind: string): ConstraintNode {
  const c = constraints.find((n) => n.constraintKind === kind);
  if (!c) throw new Error(`Constraint "${kind}" not found`);
  return c;
}

function findAnnotation(annotations: readonly AnnotationNode[], kind: string): AnnotationNode {
  const a = annotations.find((n) => n.annotationKind === kind);
  if (!a) throw new Error(`Annotation "${kind}" not found`);
  return a;
}

function writeTempSource(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-ir-analyzer-"));
  const filePath = path.join(dir, "model.ts");
  fs.writeFileSync(filePath, source);
  return filePath;
}

// =============================================================================
// analyzeClassToIR
// =============================================================================

describe("analyzeClassToIR", () => {
  it("produces FieldNode[] for InstallmentPlan", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");

    const analysis = analyzeClassToIR(classDecl, ctx.checker, sampleFormsPath);

    expect(analysis.name).toBe("InstallmentPlan");
    expect(analysis.fields).toHaveLength(4);

    const fieldNames = analysis.fields.map((f) => f.name);
    expect(fieldNames).toContain("status");
    expect(fieldNames).toContain("amount");
    expect(fieldNames).toContain("customerEmail");
    expect(fieldNames).toContain("installments");
  });

  it("produces FieldNodes with kind: 'field'", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");

    const analysis = analyzeClassToIR(classDecl, ctx.checker, sampleFormsPath);

    for (const field of analysis.fields) {
      expect(field.kind).toBe("field");
    }
  });

  it("resolves string literal union to enum TypeNode", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");

    const analysis = analyzeClassToIR(classDecl, ctx.checker, sampleFormsPath);
    const statusField = findField(analysis.fields, "status");

    expect(statusField.type.kind).toBe("enum");
    if (statusField.type.kind === "enum") {
      const values = statusField.type.members.map((m) => m.value);
      expect(values).toContain("active");
      expect(values).toContain("paused");
      expect(values).toContain("canceled");
    }
  });

  it("resolves number type to primitive TypeNode", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");

    const analysis = analyzeClassToIR(classDecl, ctx.checker, sampleFormsPath);
    const amountField = findField(analysis.fields, "amount");

    expect(amountField.type).toEqual({ kind: "primitive", primitiveKind: "number" });
  });

  it("marks required fields correctly", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");

    const analysis = analyzeClassToIR(classDecl, ctx.checker, sampleFormsPath);

    const amountField = findField(analysis.fields, "amount");
    const emailField = findField(analysis.fields, "customerEmail");

    expect(amountField.required).toBe(true);
    expect(emailField.required).toBe(false);
  });

  it("extracts root annotations from class declarations", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "VehicleRegistration");
    if (!classDecl) throw new Error("VehicleRegistration class not found");

    const analysis = analyzeClassToIR(classDecl, ctx.checker, sampleFormsPath);

    expect(findAnnotation(analysis.annotations ?? [], "displayName")).toMatchObject({
      annotationKind: "displayName",
      value: "Vehicle Registration",
    });
    expect(findAnnotation(analysis.annotations ?? [], "description")).toMatchObject({
      annotationKind: "description",
      value: "Collect vehicle details for fleet management",
    });
  });

  it("resolves optional string as nullable primitive", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "SimpleProduct");
    if (!classDecl) throw new Error("SimpleProduct class not found");

    const analysis = analyzeClassToIR(classDecl, ctx.checker, sampleFormsPath);
    const nameField = findField(analysis.fields, "name");

    expect(nameField.type).toEqual({ kind: "primitive", primitiveKind: "string" });
  });

  it("resolves boolean type", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "SimpleProduct");
    if (!classDecl) throw new Error("SimpleProduct class not found");

    const analysis = analyzeClassToIR(classDecl, ctx.checker, sampleFormsPath);
    const activeField = findField(analysis.fields, "active");

    expect(activeField.type).toEqual({ kind: "primitive", primitiveKind: "boolean" });
  });

  it("resolves string[] as array TypeNode", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "SimpleProduct");
    if (!classDecl) throw new Error("SimpleProduct class not found");

    const analysis = analyzeClassToIR(classDecl, ctx.checker, sampleFormsPath);
    const tagsField = findField(analysis.fields, "tags");

    // tags is string[] | undefined, optional field
    // The type should be array (after stripping undefined from optional)
    if (tagsField.type.kind === "array") {
      expect(tagsField.type.items).toEqual({ kind: "primitive", primitiveKind: "string" });
    } else if (tagsField.type.kind === "union") {
      // Could be union of [array, null] depending on how TS resolves the optional
      const arrayMember = tagsField.type.members.find((m) => m.kind === "array");
      expect(arrayMember).toBeDefined();
    }
  });

  it("retains method analysis", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");

    const analysis = analyzeClassToIR(classDecl, ctx.checker, sampleFormsPath);

    expect(analysis.instanceMethods).toHaveLength(2);
    expect(analysis.staticMethods).toHaveLength(1);
  });

  it("includes provenance with file path", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");

    const analysis = analyzeClassToIR(classDecl, ctx.checker, sampleFormsPath);
    const statusField = findField(analysis.fields, "status");

    expect(statusField.provenance.surface).toBe("tsdoc");
    expect(statusField.provenance.file).toBe(sampleFormsPath);
    expect(statusField.provenance.line).toBeGreaterThan(0);
  });
});

// =============================================================================
// analyzeInterfaceToIR
// =============================================================================

describe("analyzeInterfaceToIR", () => {
  it("produces FieldNodes from SimpleConfig", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findInterfaceByName(ctx.sourceFile, "SimpleConfig");
    if (!decl) throw new Error("SimpleConfig not found");

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, interfaceFixturePath);

    expect(analysis.name).toBe("SimpleConfig");
    expect(analysis.fields).toHaveLength(4);
    expect(analysis.instanceMethods).toHaveLength(0);
  }, 15_000);

  it("accepts extension-defined metadata slots without changing built-in metadata resolution", () => {
    const filePath = writeTempSource(`
      export interface CustomerRecord {
        /** @apiName customer_name @externalName CUSTOMER */
        customerName: string;
      }
    `);
    const extensionRegistry = createExtensionRegistry([
      defineExtension({
        extensionId: "x-example/metadata",
        metadataSlots: [
          defineMetadataSlot({
            slotId: "externalName",
            tagName: "externalName",
            declarationKinds: ["field"],
          }),
        ],
      }),
    ]);

    try {
      const ctx = createProgramContext(filePath);
      const decl = findInterfaceByName(ctx.sourceFile, "CustomerRecord");
      if (!decl) throw new Error("CustomerRecord not found");

      const analysis = analyzeInterfaceToIR(decl, ctx.checker, filePath, extensionRegistry);
      const field = findField(analysis.fields, "customerName");

      expect(field.metadata?.apiName).toEqual({
        value: "customer_name",
        source: "explicit",
      });
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });

  it("extracts constraint nodes from JSDoc tags", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findInterfaceByName(ctx.sourceFile, "SimpleConfig");
    if (!decl) throw new Error("SimpleConfig not found");

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, interfaceFixturePath);

    // name field: @MinLength 1 @MaxLength 200
    const nameField = findField(analysis.fields, "name");
    const minLength = findConstraint(nameField.constraints, "minLength");
    const maxLength = findConstraint(nameField.constraints, "maxLength");
    expect(minLength).toMatchObject({ kind: "constraint", constraintKind: "minLength", value: 1 });
    expect(maxLength).toMatchObject({
      kind: "constraint",
      constraintKind: "maxLength",
      value: 200,
    });

    // age field: @Minimum 0 @Maximum 150
    const ageField = findField(analysis.fields, "age");
    const minimum = findConstraint(ageField.constraints, "minimum");
    const maximum = findConstraint(ageField.constraints, "maximum");
    expect(minimum).toMatchObject({ kind: "constraint", constraintKind: "minimum", value: 0 });
    expect(maximum).toMatchObject({ kind: "constraint", constraintKind: "maximum", value: 150 });

    // email field: @Pattern ^[^@]+@[^@]+$
    const emailField = findField(analysis.fields, "email");
    const pattern = findConstraint(emailField.constraints, "pattern");
    expect(pattern).toMatchObject({
      kind: "constraint",
      constraintKind: "pattern",
      pattern: "^[^@]+@[^@]+$",
    });
  });

  it("extracts annotation nodes from JSDoc tags", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findInterfaceByName(ctx.sourceFile, "SimpleConfig");
    if (!decl) throw new Error("SimpleConfig not found");

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, interfaceFixturePath);

    const nameField = findField(analysis.fields, "name");
    const displayName = findAnnotation(nameField.annotations, "displayName");
    const description = findAnnotation(nameField.annotations, "description");
    expect(displayName).toMatchObject({ annotationKind: "displayName", value: "Full Name" });
    expect(description).toMatchObject({
      annotationKind: "description",
      value: "The user's legal name",
    });
  });

  it("detects @deprecated as AnnotationNode", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findInterfaceByName(ctx.sourceFile, "DeprecatedFieldInterface");
    if (!decl) throw new Error("DeprecatedFieldInterface not found");

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, interfaceFixturePath);

    const nameField = findField(analysis.fields, "name");
    const deprecated = findAnnotation(nameField.annotations, "deprecated");
    expect(deprecated.annotationKind).toBe("deprecated");
  });

  it("marks optional/required fields correctly", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findInterfaceByName(ctx.sourceFile, "SimpleConfig");
    if (!decl) throw new Error("SimpleConfig not found");

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, interfaceFixturePath);

    const nameField = findField(analysis.fields, "name");
    const emailField = findField(analysis.fields, "email");
    expect(nameField.required).toBe(true);
    expect(emailField.required).toBe(false);
  });

  it("resolves types correctly", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findInterfaceByName(ctx.sourceFile, "SimpleConfig");
    if (!decl) throw new Error("SimpleConfig not found");

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, interfaceFixturePath);

    const nameField = findField(analysis.fields, "name");
    expect(nameField.type).toEqual({ kind: "primitive", primitiveKind: "string" });

    const ageField = findField(analysis.fields, "age");
    expect(ageField.type).toEqual({ kind: "primitive", primitiveKind: "number" });

    const activeField = findField(analysis.fields, "active");
    expect(activeField.type).toEqual({ kind: "primitive", primitiveKind: "boolean" });
  });

  it("handles empty interface", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findInterfaceByName(ctx.sourceFile, "EmptyInterface");
    if (!decl) throw new Error("EmptyInterface not found");

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, interfaceFixturePath);

    expect(analysis.name).toBe("EmptyInterface");
    expect(analysis.fields).toHaveLength(0);
  });

  it("constraint provenance includes tag name", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findInterfaceByName(ctx.sourceFile, "SimpleConfig");
    if (!decl) throw new Error("SimpleConfig not found");

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, interfaceFixturePath);

    const nameField = findField(analysis.fields, "name");
    const minLength = findConstraint(nameField.constraints, "minLength");
    expect(minLength.provenance.tagName).toBe("@minLength");
    expect(minLength.provenance.file).toBe(interfaceFixturePath);
    expect(minLength.provenance.line).toBeGreaterThan(0);
  });
});

// =============================================================================
// analyzeTypeAliasToIR
// =============================================================================

describe("analyzeTypeAliasToIR", () => {
  it("succeeds for object type literal aliases", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findTypeAliasByName(ctx.sourceFile, "SimpleTypeAlias");
    if (!decl) throw new Error("SimpleTypeAlias not found");

    const result = analyzeTypeAliasToIR(decl, ctx.checker, interfaceFixturePath);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.analysis.name).toBe("SimpleTypeAlias");
      expect(result.analysis.fields).toHaveLength(3);

      const labelField = findField(result.analysis.fields, "label");
      expect(labelField.type).toEqual({ kind: "primitive", primitiveKind: "string" });

      const minLength = findConstraint(labelField.constraints, "minLength");
      expect(minLength).toMatchObject({ constraintKind: "minLength", value: 1 });

      const displayName = findAnnotation(labelField.annotations, "displayName");
      expect(displayName).toMatchObject({ annotationKind: "displayName", value: "Label" });
    }
  }, 15_000);

  it("succeeds for parenthesized object-like type aliases", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findTypeAliasByName(ctx.sourceFile, "ParenthesizedTypeAlias");
    if (!decl) throw new Error("ParenthesizedTypeAlias not found");

    const result = analyzeTypeAliasToIR(decl, ctx.checker, interfaceFixturePath);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.analysis.fields).toHaveLength(1);
      const labelField = findField(result.analysis.fields, "label");
      expect(labelField.type).toEqual({
        kind: "primitive",
        primitiveKind: "string",
      });
      expect(findAnnotation(labelField.annotations, "displayName")).toMatchObject({
        annotationKind: "displayName",
        value: "Parenthesized Label",
      });
    }
  });

  it("succeeds for intersection object-like type aliases", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findTypeAliasByName(ctx.sourceFile, "IntersectionTypeAlias");
    if (!decl) throw new Error("IntersectionTypeAlias not found");

    const result = analyzeTypeAliasToIR(decl, ctx.checker, interfaceFixturePath);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.analysis.fields).toHaveLength(2);
      expect(findField(result.analysis.fields, "label").type).toEqual({
        kind: "primitive",
        primitiveKind: "string",
      });
      expect(findField(result.analysis.fields, "count").type).toEqual({
        kind: "primitive",
        primitiveKind: "number",
      });
      expect(
        findAnnotation(findField(result.analysis.fields, "label").annotations, "displayName")
      ).toMatchObject({
        annotationKind: "displayName",
        value: "Left Label",
      });
    }
  });

  it("succeeds for parenthesized intersection object-like type aliases", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findTypeAliasByName(ctx.sourceFile, "ParenthesizedIntersectionTypeAlias");
    if (!decl) throw new Error("ParenthesizedIntersectionTypeAlias not found");

    const result = analyzeTypeAliasToIR(decl, ctx.checker, interfaceFixturePath);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.analysis.fields).toHaveLength(2);
      expect(
        findAnnotation(findField(result.analysis.fields, "label").annotations, "displayName")
      ).toMatchObject({
        annotationKind: "displayName",
        value: "Parenthesized Left Label",
      });
      expect(
        findAnnotation(findField(result.analysis.fields, "count").annotations, "displayName")
      ).toMatchObject({
        annotationKind: "displayName",
        value: "Parenthesized Right Count",
      });
    }
  });

  it("returns error for non-object type aliases", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findTypeAliasByName(ctx.sourceFile, "StringAlias");
    if (!decl) throw new Error("StringAlias not found");

    const result = analyzeTypeAliasToIR(decl, ctx.checker, interfaceFixturePath);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("not-object-like");
      expect(result.error).toContain("StringAlias");
      expect(result.error).toContain("not an object-like type alias");
    }
  });

  it("returns error for union type aliases", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findTypeAliasByName(ctx.sourceFile, "UnionAlias");
    if (!decl) throw new Error("UnionAlias not found");

    const result = analyzeTypeAliasToIR(decl, ctx.checker, interfaceFixturePath);
    expect(result.ok).toBe(false);
  });

  it("returns error for referenced generic object aliases", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findTypeAliasByName(ctx.sourceFile, "InstantiatedReferencedTypeAlias");
    if (!decl) throw new Error("InstantiatedReferencedTypeAlias not found");

    const result = analyzeTypeAliasToIR(decl, ctx.checker, interfaceFixturePath);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("not-object-like");
      expect(result.error).toContain("InstantiatedReferencedTypeAlias");
      expect(result.error).toContain("not an object-like type alias");
    }
  });

  it("returns error for duplicate property names across intersection members", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findTypeAliasByName(ctx.sourceFile, "DuplicateIntersectionTypeAlias");
    if (!decl) throw new Error("DuplicateIntersectionTypeAlias not found");

    const result = analyzeTypeAliasToIR(decl, ctx.checker, interfaceFixturePath);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("duplicate-properties");
      expect(result.error).toContain("DuplicateIntersectionTypeAlias");
      expect(result.error).toContain("duplicate property names");
      expect(result.error).toContain("id");
    }
  });

  it("returns error for duplicate quoted property names across intersection members", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findTypeAliasByName(ctx.sourceFile, "DuplicateQuotedIntersectionTypeAlias");
    if (!decl) throw new Error("DuplicateQuotedIntersectionTypeAlias not found");

    const result = analyzeTypeAliasToIR(decl, ctx.checker, interfaceFixturePath);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("duplicate-properties");
      expect(result.error).toContain("DuplicateQuotedIntersectionTypeAlias");
      expect(result.error).toContain("duplicate property names");
      expect(result.error).toContain("id");
    }
  });
});

// =============================================================================
// Constrained primitive type alias propagation
// =============================================================================

describe("constrained type alias propagation (IR)", () => {
  it("propagates @Minimum/@Maximum from type Percent = number", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findInterfaceByName(ctx.sourceFile, "ConfigWithAliasedTypes");
    if (!decl) throw new Error("ConfigWithAliasedTypes not found");

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, interfaceFixturePath);
    const discountField = findField(analysis.fields, "discount");

    expect(discountField.type).toEqual({ kind: "reference", name: "Percent", typeArguments: [] });
    expect(analysis.typeRegistry["Percent"]).toMatchObject({
      type: { kind: "primitive", primitiveKind: "number" },
    });

    const minimum = findConstraint(analysis.typeRegistry["Percent"]?.constraints ?? [], "minimum");
    const maximum = findConstraint(analysis.typeRegistry["Percent"]?.constraints ?? [], "maximum");
    expect(minimum).toMatchObject({ value: 0 });
    expect(maximum).toMatchObject({ value: 100 });
  });

  it("propagates @MinLength/@MaxLength/@Pattern from type Email = string", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findInterfaceByName(ctx.sourceFile, "ConfigWithAliasedTypes");
    if (!decl) throw new Error("ConfigWithAliasedTypes not found");

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, interfaceFixturePath);
    const emailField = findField(analysis.fields, "contactEmail");

    expect(emailField.type).toEqual({ kind: "reference", name: "Email", typeArguments: [] });
    expect(analysis.typeRegistry["Email"]).toMatchObject({
      type: { kind: "primitive", primitiveKind: "string" },
    });

    const aliasConstraints = analysis.typeRegistry["Email"]?.constraints ?? [];
    const minLength = findConstraint(aliasConstraints, "minLength");
    const maxLength = findConstraint(aliasConstraints, "maxLength");
    const pattern = findConstraint(aliasConstraints, "pattern");
    expect(minLength).toMatchObject({ value: 1 });
    expect(maxLength).toMatchObject({ value: 255 });
    expect(pattern).toMatchObject({ constraintKind: "pattern", pattern: "^[^@]+@[^@]+$" });
  });
});

// =============================================================================
// Nested type resolution and type registry
// =============================================================================

describe("nested type resolution (IR)", () => {
  it("resolves nested interface as reference TypeNode with typeRegistry entry", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findInterfaceByName(ctx.sourceFile, "NestedConfig");
    if (!decl) throw new Error("NestedConfig not found");

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, interfaceFixturePath);

    const addressField = findField(analysis.fields, "address");

    // The address type should be either a reference or an inline object
    if (addressField.type.kind === "reference") {
      expect(addressField.type.name).toBe("Address");
      expect(analysis.typeRegistry["Address"]).toBeDefined();
      const addressType = analysis.typeRegistry["Address"]?.type;
      expect(addressType?.kind).toBe("object");
    } else {
      // If inlined, it should be an object type
      expect(addressField.type.kind).toBe("object");
    }
  }, 15_000);

  it("propagates constraints from nested type declarations to typeRegistry properties", () => {
    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findInterfaceByName(ctx.sourceFile, "NestedConfig");
    if (!decl) throw new Error("NestedConfig not found");

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, interfaceFixturePath);

    // Look for Address in typeRegistry
    const addressDef = analysis.typeRegistry["Address"];
    if (addressDef?.type.kind === "object") {
      const streetProp = addressDef.type.properties.find((p) => p.name === "street");
      expect(streetProp).toBeDefined();
      if (streetProp) {
        // Check that constraints were propagated
        const minLen = streetProp.constraints.find((c) => c.constraintKind === "minLength");
        const maxLen = streetProp.constraints.find((c) => c.constraintKind === "maxLength");
        expect(minLen).toBeDefined();
        expect(maxLen).toBeDefined();
      }
    }
  });
});

// =============================================================================
// canonicalizeTSDoc wrapper
// =============================================================================

describe("canonicalizeTSDoc", () => {
  // Import inline to avoid module-level issues if the module isn't found
  it("produces a valid FormIR from analyzeInterfaceToIR output", async () => {
    const { canonicalizeTSDoc } = await import("../src/canonicalize/tsdoc-canonicalizer.js");
    const { IR_VERSION } = await import("@formspec/core/internals");

    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findInterfaceByName(ctx.sourceFile, "SimpleConfig");
    if (!decl) throw new Error("SimpleConfig not found");

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, interfaceFixturePath);
    const formIR = canonicalizeTSDoc(analysis, { file: interfaceFixturePath });

    expect(formIR.kind).toBe("form-ir");
    expect(formIR.irVersion).toBe(IR_VERSION);
    expect(formIR.provenance.surface).toBe("tsdoc");
    expect(formIR.provenance.file).toBe(interfaceFixturePath);
    expect(formIR.elements).toHaveLength(4);

    // Elements should be the same FieldNode[] from analysis
    for (const element of formIR.elements) {
      expect(element.kind).toBe("field");
    }
  });

  it("passes typeRegistry through", async () => {
    const { canonicalizeTSDoc } = await import("../src/canonicalize/tsdoc-canonicalizer.js");

    const ctx = createProgramContext(interfaceFixturePath);
    const decl = findInterfaceByName(ctx.sourceFile, "NestedConfig");
    if (!decl) throw new Error("NestedConfig not found");

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, interfaceFixturePath);
    const formIR = canonicalizeTSDoc(analysis, { file: interfaceFixturePath });

    // typeRegistry should contain Address and ContactInfo
    expect(Object.keys(formIR.typeRegistry).length).toBeGreaterThan(0);
  });
});

// =============================================================================
// RECORD TYPE DETECTION — BUG-3 regression
// =============================================================================

describe("analyzeClassToIR — Record<string, T> type detection", () => {
  const edgeCasesPath = path.join(fixturesDir, "edge-cases.ts");

  it("emits RecordTypeNode (kind: record) for Record<string, string>", () => {
    // Regression for BUG-3: Record<string, string> was incorrectly being
    // lifted to $defs as a named type with additionalProperties: false.
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ObjectEdgeCases");
    if (!classDecl) throw new Error("ObjectEdgeCases class not found");

    const analysis = analyzeClassToIR(classDecl, ctx.checker, edgeCasesPath);
    const field = analysis.fields.find((f) => f.name === "stringRecord");
    if (!field) throw new Error("stringRecord field not found");

    expect(field.type.kind).toBe("record");
    if (field.type.kind === "record") {
      expect(field.type.valueType).toEqual({ kind: "primitive", primitiveKind: "string" });
    }
  });

  it("does NOT register Record as a named type in the typeRegistry", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ObjectEdgeCases");
    if (!classDecl) throw new Error("ObjectEdgeCases class not found");

    const analysis = analyzeClassToIR(classDecl, ctx.checker, edgeCasesPath);

    expect(Object.keys(analysis.typeRegistry)).not.toContain("Record");
  });

  it("keeps named non-recursive record aliases inline as RecordTypeNode", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ObjectEdgeCases");
    if (!classDecl) throw new Error("ObjectEdgeCases class not found");

    const analysis = analyzeClassToIR(classDecl, ctx.checker, edgeCasesPath);
    const field = analysis.fields.find((f) => f.name === "namedStringMap");
    if (!field) throw new Error("namedStringMap field not found");

    expect(field.type.kind).toBe("record");
    if (field.type.kind === "record") {
      expect(field.type.valueType).toEqual({ kind: "primitive", primitiveKind: "string" });
    }
    expect(analysis.typeRegistry).not.toHaveProperty("StringMap");
  });

  it("handles self-referential Record types without stack overflow", () => {
    // Regression for the circular-reference bug in tryResolveRecordType:
    // `type SelfRefRecord = Record<string, SelfRefRecord>` would recurse
    // infinitely without the visiting-set guard inside tryResolveRecordType.
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ObjectEdgeCases");
    if (!classDecl) throw new Error("ObjectEdgeCases class not found");

    // Must not throw / stack overflow
    const analysis = analyzeClassToIR(classDecl, ctx.checker, edgeCasesPath);

    const field = analysis.fields.find((f) => f.name === "selfRefRecord");
    expect(field).toBeDefined();
    // The type should be some valid IR node (record or object), never undefined
    expect(field?.type).toBeDefined();
    // Regardless of the exact shape, the kind must be a known TypeNode kind
    const validKinds = ["record", "object", "primitive", "union", "array", "enum", "reference"];
    expect(validKinds).toContain(field?.type.kind);
    if (field?.type.kind === "object") {
      expect(field.type.additionalProperties).toBe(false);
    }
  });

  it("resolves recursive class properties as named references", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "CircularNode");
    if (!classDecl) throw new Error("CircularNode class not found");

    const analysis = analyzeClassToIR(classDecl, ctx.checker, edgeCasesPath);

    expect(Object.keys(analysis.typeRegistry)).toContain("CircularNode");

    const nextField = findField(analysis.fields, "next");
    expect(nextField.type).toEqual({
      kind: "reference",
      name: "CircularNode",
      typeArguments: [],
    });

    const namedType = analysis.typeRegistry["CircularNode"];
    if (!namedType) throw new Error("CircularNode type registry entry not found");
    expect(namedType.type.kind).toBe("object");
    if (namedType.type.kind === "object") {
      const recursiveProp = namedType.type.properties.find((prop) => prop.name === "next");
      expect(recursiveProp?.type).toEqual({
        kind: "reference",
        name: "CircularNode",
        typeArguments: [],
      });
    }
  });
});
