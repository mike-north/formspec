/**
 * Regression coverage for issue #387: the TSDoc analyzer must not let two
 * declarations from different modules share the same unqualified `$defs` key.
 *
 * The intended behavior is fail-fast rather than silently choosing whichever
 * declaration happened to populate the registry first.
 *
 * @see https://github.com/mike-north/formspec/issues/387
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateSchemas, type GenerateSchemasOptions } from "../src/generators/class-schema.js";

function generateSchemasOrThrow(options: Omit<GenerateSchemasOptions, "errorReporting">) {
  return generateSchemas({ ...options, errorReporting: "throw" });
}

interface MultiFileFixture {
  readonly dir: string;
  readonly entryPath: string;
}

const fixtureDirs: string[] = [];

function writeFixture(files: Record<string, string>): MultiFileFixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-type-registry-collision-"));
  fixtureDirs.push(dir);

  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "nodenext",
          strict: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ["**/*.ts"],
      },
      null,
      2
    )
  );

  for (const [relativePath, source] of Object.entries(files)) {
    const absolutePath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, source);
  }

  return { dir, entryPath: path.join(dir, "form.ts") };
}

afterEach(() => {
  for (const dir of fixtureDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("type registry declaration collisions", () => {
  it("throws when same-named primitive aliases are imported from different modules", () => {
    const fixture = writeFixture({
      "file-a.ts": "export type Email = string;\n",
      "file-b.ts": "export type Email = string;\n",
      "form.ts": [
        'import type { Email as SenderEmail } from "./file-a";',
        'import type { Email as RecipientEmail } from "./file-b";',
        "",
        "export class ContactForm {",
        "  sender!: SenderEmail;",
        "  recipient!: RecipientEmail;",
        "}",
      ].join("\n"),
    });

    expect(() =>
      generateSchemasOrThrow({
        filePath: fixture.entryPath,
        typeName: "ContactForm",
      })
    ).toThrow(/Type registry collision: "Email".*file-a\.ts.*file-b\.ts/s);
  });

  it("throws for the mixed primitive-alias and object-alias reproduction", () => {
    const fixture = writeFixture({
      "file-a.ts": "export type Email = string;\n",
      "file-b.ts": "export type Email = { local: string; domain: string };\n",
      "form.ts": [
        'import type { Email as SenderEmail } from "./file-a";',
        'import type { Email as RecipientEmail } from "./file-b";',
        "",
        "export class ContactForm {",
        "  sender!: SenderEmail;",
        "  recipient!: RecipientEmail;",
        "}",
      ].join("\n"),
    });

    expect(() =>
      generateSchemasOrThrow({
        filePath: fixture.entryPath,
        typeName: "ContactForm",
      })
    ).toThrow(/Type registry collision: "Email".*file-a\.ts.*file-b\.ts/s);
  });

  it("throws when same-named object types are imported from different modules", () => {
    const fixture = writeFixture({
      "file-a.ts": "export interface Address { street: string; }\n",
      "file-b.ts": "export interface Address { postalCode: string; }\n",
      "form.ts": [
        'import type { Address as BillingAddress } from "./file-a";',
        'import type { Address as ShippingAddress } from "./file-b";',
        "",
        "export class CheckoutForm {",
        "  billing!: BillingAddress;",
        "  shipping!: ShippingAddress;",
        "}",
      ].join("\n"),
    });

    expect(() =>
      generateSchemasOrThrow({
        filePath: fixture.entryPath,
        typeName: "CheckoutForm",
      })
    ).toThrow(/Type registry collision: "Address".*file-a\.ts.*file-b\.ts/s);
  });

  it("throws when same-named union aliases are imported from different modules", () => {
    const fixture = writeFixture({
      "file-a.ts": 'export type Status = "draft" | "sent";\n',
      "file-b.ts": 'export type Status = "active" | "disabled";\n',
      "form.ts": [
        'import type { Status as MessageStatus } from "./file-a";',
        'import type { Status as AccountStatus } from "./file-b";',
        "",
        "export class StatusForm {",
        "  message?: MessageStatus;",
        "  account?: AccountStatus;",
        "}",
      ].join("\n"),
    });

    expect(() =>
      generateSchemasOrThrow({
        filePath: fixture.entryPath,
        typeName: "StatusForm",
      })
    ).toThrow(/Type registry collision: "Status".*file-a\.ts.*file-b\.ts/s);
  });

  it("throws when same-named recursive record aliases are imported from different modules", () => {
    const fixture = writeFixture({
      "file-a.ts": "export type TreeMap = { [key: string]: TreeMap };\n",
      "file-b.ts": "export type TreeMap = { [key: string]: TreeMap };\n",
      "form.ts": [
        'import type { TreeMap as LeftTreeMap } from "./file-a";',
        'import type { TreeMap as RightTreeMap } from "./file-b";',
        "",
        "export class TreeForm {",
        "  left!: LeftTreeMap;",
        "  right!: RightTreeMap;",
        "}",
      ].join("\n"),
    });

    expect(() =>
      generateSchemasOrThrow({
        filePath: fixture.entryPath,
        typeName: "TreeForm",
      })
    ).toThrow(/Type registry collision: "TreeMap".*file-a\.ts.*file-b\.ts/s);
  });

  it("throws when same-named declarations come from different namespaces in one file", () => {
    const fixture = writeFixture({
      "form.ts": [
        "namespace Billing {",
        "  export interface Address { street: string; }",
        "}",
        "",
        "namespace Shipping {",
        "  export interface Address { postalCode: string; }",
        "}",
        "",
        "export class CheckoutForm {",
        "  billing!: Billing.Address;",
        "  shipping!: Shipping.Address;",
        "}",
      ].join("\n"),
    });

    expect(() =>
      generateSchemasOrThrow({
        filePath: fixture.entryPath,
        typeName: "CheckoutForm",
      })
    ).toThrow(/Type registry collision: "Address".*form\.ts.*form\.ts/s);
  });

  it("allows repeated references to the same declaration", () => {
    const fixture = writeFixture({
      "models.ts": "export interface Address { street: string; }\n",
      "form.ts": [
        'import type { Address } from "./models";',
        "",
        "export class CheckoutForm {",
        "  billing!: Address;",
        "  shipping!: Address;",
        "}",
      ].join("\n"),
    });

    const result = generateSchemasOrThrow({
      filePath: fixture.entryPath,
      typeName: "CheckoutForm",
    });

    expect(result.jsonSchema.properties).toMatchObject({
      billing: { $ref: "#/$defs/Address" },
      shipping: { $ref: "#/$defs/Address" },
    });
    expect(result.jsonSchema.$defs).toHaveProperty("Address");
  });
});
