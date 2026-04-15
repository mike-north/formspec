import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { describe, expect, it } from "vitest";
import type { FormSpecConfig } from "@formspec/config";
import { generateSchemas } from "../generators/class-schema.js";
import { numericExtension } from "./fixtures/example-numeric-extension.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeTempSource(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-config-test-"));
  const filePath = path.join(dir, "model.ts");
  fs.writeFileSync(filePath, source);
  return filePath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateSchemas with FormSpecConfig", () => {
  it("resolves extensionRegistry from config.extensions", () => {
    // Decimal is a custom type registered in numericExtension
    const filePath = writeTempSource(`
      export type Decimal = string & { __brand: "Decimal" };

      export interface PaymentForm {
        amount: Decimal;
      }
    `);

    try {
      const config: FormSpecConfig = {
        extensions: [numericExtension],
        vendorPrefix: "x-formspec",
      };

      const result = generateSchemas({
        filePath,
        typeName: "PaymentForm",
        config,
        errorReporting: "throw",
      });

      // The Decimal type should be resolved from the extension and emitted with vendor prefix
      const amountProp = result.jsonSchema.properties?.["amount"];
      expect(amountProp).toMatchObject({
        type: "string",
        "x-formspec-decimal": true,
      });
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });

  it("resolves vendorPrefix from config", () => {
    const filePath = writeTempSource(`
      export interface SimpleForm {
        name: string;
      }
    `);

    try {
      const config: FormSpecConfig = {
        vendorPrefix: "x-custom",
      };

      const result = generateSchemas({
        filePath,
        typeName: "SimpleForm",
        config,
        errorReporting: "throw",
      });

      expect(result.jsonSchema.properties?.["name"]).toEqual({ type: "string" });
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });

  it("resolves enumSerialization from config", () => {
    const filePath = writeTempSource(`
      export type Status = "active" | "inactive";

      export interface StatusForm {
        status: Status;
      }
    `);

    try {
      const configEnum: FormSpecConfig = { enumSerialization: "enum" };
      const configOneOf: FormSpecConfig = { enumSerialization: "oneOf" };

      const enumResult = generateSchemas({
        filePath,
        typeName: "StatusForm",
        config: configEnum,
        errorReporting: "throw",
      });
      const oneOfResult = generateSchemas({
        filePath,
        typeName: "StatusForm",
        config: configOneOf,
        errorReporting: "throw",
      });

      // With "enum": Status $defs entry uses flat enum representation
      expect(enumResult.jsonSchema.$defs?.["Status"]).toMatchObject({
        enum: ["active", "inactive"],
      });
      expect(enumResult.jsonSchema.$defs?.["Status"]).not.toHaveProperty("oneOf");

      // With "oneOf": Status $defs entry uses oneOf representation
      expect(oneOfResult.jsonSchema.$defs?.["Status"]).toMatchObject({
        oneOf: [{ const: "active" }, { const: "inactive" }],
      });
      expect(oneOfResult.jsonSchema.$defs?.["Status"]).not.toHaveProperty("enum");
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });

  it("resolves metadata from config", () => {
    const filePath = writeTempSource(`
      export interface UserForm {
        userName: string;
      }
    `);

    try {
      const config: FormSpecConfig = {
        metadata: {
          field: {
            apiName: { mode: "prefer-explicit" },
          },
        },
      };

      const result = generateSchemas({
        filePath,
        typeName: "UserForm",
        config,
        errorReporting: "throw",
      });

      // With prefer-explicit: no apiName inference, so the property name is preserved as-is
      expect(result.jsonSchema.properties).toHaveProperty("userName");
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });

  it("direct options override config values", () => {
    const filePath = writeTempSource(`
      export type Status = "active" | "inactive";

      export interface StatusForm {
        status: Status;
      }
    `);

    try {
      // Config says oneOf but direct option says enum — direct option wins
      const config: FormSpecConfig = { enumSerialization: "oneOf" };

      const result = generateSchemas({
        filePath,
        typeName: "StatusForm",
        config,
        enumSerialization: "enum", // overrides config
        errorReporting: "throw",
      });

      // Direct "enum" option wins over config "oneOf"
      expect(result.jsonSchema.$defs?.["Status"]).toMatchObject({
        enum: ["active", "inactive"],
      });
      expect(result.jsonSchema.$defs?.["Status"]).not.toHaveProperty("oneOf");
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });

  it("works without config (backward compatibility)", () => {
    const filePath = writeTempSource(`
      export interface SimpleForm {
        name: string;
      }
    `);

    try {
      const result = generateSchemas({
        filePath,
        typeName: "SimpleForm",
        errorReporting: "throw",
      });

      expect(result.jsonSchema.properties?.["name"]).toEqual({ type: "string" });
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });
});
