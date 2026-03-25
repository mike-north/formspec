import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  runCli,
  resolveFixture,
  findSchemaFile,
} from "../helpers/schema-assertions.js";

describe("TSDoc Shared Types ($defs/$ref)", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-shared-"));
    const fixturePath = resolveFixture("tsdoc-class", "shared-types.ts");
    const result = runCli(["generate", fixturePath, "OrderForm", "-o", tempDir]);
    expect(result.exitCode).toBe(0);

    const schemaFile = findSchemaFile(tempDir, "schema.json");
    expect(schemaFile).toBeDefined();
    if (!schemaFile) throw new Error("Schema file not found");
    schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("uses $ref for shared Address type", () => {
    const properties = schema["properties"] as Record<string, Record<string, unknown>>;
    expect(properties["billingAddress"]["$ref"]).toBe("#/$defs/Address");
    expect(properties["shippingAddress"]["$ref"]).toBe("#/$defs/Address");
  });

  it("defines Address in $defs", () => {
    const defs = schema["$defs"] as Record<string, Record<string, unknown>>;
    expect(defs).toBeDefined();
    expect(defs["Address"]).toBeDefined();
    expect(defs["Address"]["type"]).toBe("object");
    const addrProps = defs["Address"]["properties"] as Record<string, unknown>;
    expect(addrProps).toHaveProperty("street");
    expect(addrProps).toHaveProperty("city");
    expect(addrProps).toHaveProperty("zip");
    expect(addrProps).toHaveProperty("country");
  });

  it("has correct required fields at root", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("orderId");
    expect(required).toContain("billingAddress");
    expect(required).toContain("shippingAddress");
    expect(required).not.toContain("notes");
  });

});
