import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildFormSchemas } from "@formspec/build";
import { UiSchemaCompletenessForm as ChainUiSchemaCompletenessForm } from "../fixtures/chain-dsl/ui-schema-completeness.js";
import {
  assertUiSchemaRule,
  findSchemaFile,
  findUiElement,
  resolveFixture,
  runCli,
} from "../helpers/schema-assertions.js";

describe("UI Schema Completeness", () => {
  describe("TSDoc pipeline", () => {
    let tempDir: string;
    let uiSchema: Record<string, unknown>;
    let elements: Record<string, unknown>[];

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-ui-tsdoc-"));
      const fixturePath = resolveFixture("tsdoc-class", "ui-schema-completeness.ts");
      const result = runCli(["generate", fixturePath, "UiSchemaCompletenessForm", "-o", tempDir]);
      expect(result.exitCode).toBe(0);

      const uiSchemaFile = findSchemaFile(tempDir, "ui_schema.json");
      expect(uiSchemaFile).toBeDefined();
      if (!uiSchemaFile) throw new Error("UI schema file not found");
      uiSchema = JSON.parse(fs.readFileSync(uiSchemaFile, "utf-8")) as Record<string, unknown>;
      elements = uiSchema["elements"] as Record<string, unknown>[];
    });

    afterAll(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    it("renders a VerticalLayout root with controls in source order", () => {
      expect(uiSchema["type"]).toBe("VerticalLayout");
      expect(elements).toHaveLength(4);
      expect(elements.map(scopeOf)).toEqual([
        "#/properties/accountId",
        "#/properties/fullName",
        "#/properties/emailAddress",
        "#/properties/billingAddress",
      ]);
    });

    it("maps displayName to label and placeholder to options.placeholder", () => {
      const fullName = findUiElement(uiSchema, "#/properties/fullName");
      expect(fullName).toMatchObject({
        type: "Control",
        scope: "#/properties/fullName",
        label: "Full Name",
        options: { placeholder: "Enter your full name" },
      });
    });

    it("keeps nested object fields scoped to the object property", () => {
      const address = findUiElement(uiSchema, "#/properties/billingAddress");
      expect(address).toMatchObject({
        type: "Control",
        scope: "#/properties/billingAddress",
        label: "Billing Address",
      });
    });

    it("infers labels when displayName is absent", () => {
      const accountId = findUiElement(uiSchema, "#/properties/accountId");
      const emailAddress = findUiElement(uiSchema, "#/properties/emailAddress");
      const billingAddress = findUiElement(uiSchema, "#/properties/billingAddress");

      expect(accountId).toMatchObject({
        type: "Control",
        scope: "#/properties/accountId",
        label: "Account Id",
      });
      expect(emailAddress).toMatchObject({
        type: "Control",
        scope: "#/properties/emailAddress",
        label: "Email Address",
      });
      expect(billingAddress).toMatchObject({
        type: "Control",
        scope: "#/properties/billingAddress",
        label: "Billing Address",
      });
    });
  });

  describe("Chain DSL pipeline", () => {
    const { uiSchema } = buildFormSchemas(ChainUiSchemaCompletenessForm);
    const elements = uiSchema.elements as Record<string, unknown>[];

    it("renders the group and root controls in source order", () => {
      expect(uiSchema.type).toBe("VerticalLayout");
      expect(elements).toHaveLength(4);
      expect(elements[0]).toMatchObject({ type: "Group", label: "Profile" });
      expect(elements[1]).toMatchObject({
        type: "Control",
        scope: "#/properties/contactMethod",
        label: "Preferred Contact Method",
      });
      expect(elements[2]).toMatchObject({
        type: "Control",
        scope: "#/properties/phoneNumber",
        label: "Phone Number",
      });
      expect(elements[3]).toMatchObject({
        type: "Control",
        scope: "#/properties/billingAddress",
        label: "Billing Address",
      });
    });

    it("maps group children and placeholder options", () => {
      const group = elements[0];
      expect(group).toBeDefined();
      if (!group) {
        throw new Error("Expected group element at index 0");
      }
      const groupElements = group["elements"] as Record<string, unknown>[];

      expect(groupElements).toHaveLength(3);
      expect(groupElements[0]).toMatchObject({
        type: "Control",
        scope: "#/properties/firstName",
        label: "First Name",
        options: { placeholder: "Enter your first name" },
      });
      expect(groupElements[1]).toMatchObject({
        type: "Control",
        scope: "#/properties/lastName",
        label: "Last Name",
      });
      expect(groupElements[2]).toMatchObject({
        type: "Control",
        scope: "#/properties/emailAddress",
        label: "Email Address",
      });
    });

    it("attaches a SHOW rule to the conditional field", () => {
      assertUiSchemaRule(uiSchema, "#/properties/phoneNumber", "SHOW", {
        scope: "#/properties/contactMethod",
        schema: { const: "phone" },
      });
    });

    it("keeps the nested object field as a scoped Control", () => {
      const address = findUiElement(uiSchema, "#/properties/billingAddress");
      expect(address).toMatchObject({
        type: "Control",
        scope: "#/properties/billingAddress",
        label: "Billing Address",
      });
    });
  });
});

function scopeOf(element: Record<string, unknown>): string | undefined {
  return typeof element["scope"] === "string" ? element["scope"] : undefined;
}
