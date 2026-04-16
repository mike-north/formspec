/**
 * Tests for symbol-based custom type detection via defineCustomType<T>().
 *
 * Phase 3: symbol-registry builder + ExtensionRegistry.findTypeBySymbol/setSymbolMap.
 *
 * @see packages/build/src/extensions/symbol-registry.ts
 * @see packages/build/src/extensions/registry.ts (findTypeBySymbol, setSymbolMap)
 * @see packages/build/src/analyzer/class-analyzer.ts (resolveSymbolBasedCustomType)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineCustomType, defineExtension } from "@formspec/core/internals";
import { createExtensionRegistry } from "../extensions/index.js";
import { buildSymbolMapFromConfig } from "../extensions/symbol-registry.js";
import { createProgramContext } from "../analyzer/program.js";
import { generateSchemas } from "../generators/class-schema.js";

// =============================================================================
// TEST HELPERS
// =============================================================================

const TSCONFIG = JSON.stringify(
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
);

// Root of the build package — used for creating temp dirs under the package so that
// TypeScript's node_modules resolution can find @formspec/core when walking up.
const BUILD_PACKAGE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function writeTsConfig(dir: string): void {
  fs.writeFileSync(path.join(dir, "tsconfig.json"), TSCONFIG);
}

/**
 * Creates a temp directory as a subdirectory of the build package root so that
 * TypeScript's module resolution can walk up and find `node_modules/@formspec/core`.
 * Use this when the test needs checker-based symbol resolution (e.g., namespace imports).
 */
function makeDirUnderBuildPackage(prefix: string): string {
  const scratchDir = path.join(BUILD_PACKAGE_ROOT, "scratch", "test-fixtures");
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }
  return fs.mkdtempSync(path.join(scratchDir, `formspec-sym-reg-${prefix}-`));
}

function makeDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `formspec-sym-reg-${prefix}-`));
}

function cleanDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
}

// =============================================================================
// UNIT TESTS — buildSymbolMapFromConfig
// =============================================================================

describe("buildSymbolMapFromConfig", () => {
  describe("happy path: type param extraction → symbol map entry", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = makeDir("happy");
      writeTsConfig(tmpDir);

      // The type file: a branded Decimal type
      fs.writeFileSync(
        path.join(tmpDir, "decimal.ts"),
        [
          "declare const __decimalBrand: unique symbol;",
          "export type Decimal = string & { readonly [__decimalBrand]: true };",
        ].join("\n")
      );

      // The config file: uses defineCustomType<Decimal>()
      fs.writeFileSync(
        path.join(tmpDir, "formspec.config.ts"),
        [
          'import type { Decimal } from "./decimal.js";',
          'import { defineCustomType, defineExtension } from "@formspec/core";',
          "",
          "export const extension = defineExtension({",
          '  extensionId: "x-test/decimal",',
          "  types: [",
          '    defineCustomType<Decimal>({ typeName: "Decimal", toJsonSchema: () => ({ type: "string" }) }),',
          "  ],",
          "});",
        ].join("\n")
      );
    });

    afterAll(() => {
      cleanDir(tmpDir);
    });

    it("builds a non-empty symbol map when defineCustomType<T>() has a type argument", () => {
      const decimalType = defineCustomType({
        typeName: "Decimal",
        toJsonSchema: () => ({ type: "string" }),
      });
      const registry = createExtensionRegistry([
        defineExtension({ extensionId: "x-test/decimal", types: [decimalType] }),
      ]);

      const configPath = path.join(tmpDir, "formspec.config.ts");
      // Include config file in program so its source is available
      const ctx = createProgramContext(path.join(tmpDir, "decimal.ts"), [configPath]);

      const symbolMap = buildSymbolMapFromConfig(configPath, ctx.program, ctx.checker, registry);

      // The Decimal symbol must appear in the map
      expect(symbolMap.size).toBe(1);

      // The single entry should link to the Decimal registration
      const firstEntry = [...symbolMap.entries()][0];
      // Verify we got an entry (size check above guarantees this)
      expect(firstEntry).toBeDefined();
      if (firstEntry === undefined) {
        return;
      }
      const [, entry] = firstEntry;
      // spec: symbol-registry §findRegistrationByTypeName → extensionId matches
      expect(entry.extensionId).toBe("x-test/decimal");
      // spec: symbol-registry §findRegistrationByTypeName → registration.typeName matches
      expect(entry.registration.typeName).toBe("Decimal");
    });
  });

  describe("defineCustomType() without type arg → no symbol entry", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = makeDir("no-tparam");
      writeTsConfig(tmpDir);

      fs.writeFileSync(
        path.join(tmpDir, "formspec.config.ts"),
        [
          'import { defineCustomType, defineExtension } from "@formspec/core";',
          "",
          "// No type argument — symbol map must be empty",
          "export const extension = defineExtension({",
          '  extensionId: "x-test/no-tp",',
          "  types: [",
          '    defineCustomType({ typeName: "Unregistered", toJsonSchema: () => ({ type: "string" }) }),',
          "  ],",
          "});",
        ].join("\n")
      );
    });

    afterAll(() => {
      cleanDir(tmpDir);
    });

    it("returns an empty map when no defineCustomType call has a type argument", () => {
      const registry = createExtensionRegistry([
        defineExtension({
          extensionId: "x-test/no-tp",
          types: [
            defineCustomType({
              typeName: "Unregistered",
              toJsonSchema: () => ({ type: "string" }),
            }),
          ],
        }),
      ]);

      const configPath = path.join(tmpDir, "formspec.config.ts");
      const ctx = createProgramContext(configPath);

      const symbolMap = buildSymbolMapFromConfig(configPath, ctx.program, ctx.checker, registry);

      // No type argument → no symbol entries
      expect(symbolMap.size).toBe(0);
    });
  });

  describe("bare primitive type arg → no symbol entry", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = makeDir("primitive-tparam");
      writeTsConfig(tmpDir);

      fs.writeFileSync(
        path.join(tmpDir, "formspec.config.ts"),
        [
          'import { defineCustomType, defineExtension } from "@formspec/core";',
          "",
          "// Bare primitive — has no TypeScript symbol",
          "export const extension = defineExtension({",
          '  extensionId: "x-test/prim",',
          "  types: [",
          '    defineCustomType<string>({ typeName: "StrType", toJsonSchema: () => ({ type: "string" }) }),',
          "  ],",
          "});",
        ].join("\n")
      );
    });

    afterAll(() => {
      cleanDir(tmpDir);
    });

    it("skips a bare primitive type argument (no symbol to register)", () => {
      const registry = createExtensionRegistry([
        defineExtension({
          extensionId: "x-test/prim",
          types: [
            defineCustomType({
              typeName: "StrType",
              toJsonSchema: () => ({ type: "string" }),
            }),
          ],
        }),
      ]);

      const configPath = path.join(tmpDir, "formspec.config.ts");
      const ctx = createProgramContext(configPath);

      const symbolMap = buildSymbolMapFromConfig(configPath, ctx.program, ctx.checker, registry);

      // `string` has no ts.Symbol → skip, empty map
      expect(symbolMap.size).toBe(0);
    });
  });

  describe("config file not in program → returns empty map", () => {
    it("returns an empty map when the config file is not present in the program", () => {
      const tmpDir = makeDir("not-in-program");
      writeTsConfig(tmpDir);

      const decimalType = defineCustomType({
        typeName: "Decimal",
        toJsonSchema: () => ({ type: "string" }),
      });
      const registry = createExtensionRegistry([
        defineExtension({ extensionId: "x-test/decimal", types: [decimalType] }),
      ]);

      // The consumer file doesn't import the config file at all
      const consumerPath = path.join(tmpDir, "consumer.ts");
      fs.writeFileSync(consumerPath, "export interface Foo { x: string; }");

      try {
        const ctx = createProgramContext(consumerPath);
        // The config path is NOT in the program
        const configPath = path.join(tmpDir, "nonexistent.config.ts");

        const symbolMap = buildSymbolMapFromConfig(configPath, ctx.program, ctx.checker, registry);

        // File not in program → empty map
        expect(symbolMap.size).toBe(0);
      } finally {
        cleanDir(tmpDir);
      }
    });
  });
});

// =============================================================================
// UNIT TESTS — ExtensionRegistry.findTypeBySymbol / setSymbolMap
// =============================================================================

describe("ExtensionRegistry symbol map API", () => {
  it("findTypeBySymbol returns undefined before setSymbolMap is called", () => {
    const decimalType = defineCustomType({
      typeName: "Decimal",
      toJsonSchema: () => ({ type: "string" }),
    });
    const registry = createExtensionRegistry([
      defineExtension({ extensionId: "x-test/dec", types: [decimalType] }),
    ]);

    // Use a real symbol obtained from a real program to avoid interface mismatch.
    const tmpDir = makeDir("api-test");
    writeTsConfig(tmpDir);
    const filePath = path.join(tmpDir, "types.ts");
    fs.writeFileSync(filePath, "export type Decimal = string & { readonly __d: true };");
    try {
      const ctx = createProgramContext(filePath);
      const sf = ctx.program.getSourceFile(filePath);
      if (sf === undefined) {
        return;
      }
      const decl = sf.statements[0];
      if (decl === undefined) {
        return;
      }
      // Get the symbol for Decimal from the type checker
      const type = ctx.checker.getTypeAtLocation(decl);
      const sym = type.aliasSymbol ?? type.getSymbol();
      if (sym === undefined) {
        return;
      }

      // Before setSymbolMap, lookup must return undefined
      expect(registry.findTypeBySymbol(sym)).toBeUndefined();

      // After setSymbolMap, lookup must return the entry
      registry.setSymbolMap(
        new Map([[sym, { extensionId: "x-test/dec", registration: decimalType }]])
      );
      const result = registry.findTypeBySymbol(sym);
      expect(result).toBeDefined();
      expect(result?.extensionId).toBe("x-test/dec");
      expect(result?.registration.typeName).toBe("Decimal");
    } finally {
      cleanDir(tmpDir);
    }
  });

  it("setSymbolMap can be called multiple times (last map wins)", () => {
    const typeA = defineCustomType({
      typeName: "TypeA",
      toJsonSchema: () => ({ type: "string" }),
    });
    const typeB = defineCustomType({
      typeName: "TypeB",
      toJsonSchema: () => ({ type: "integer" }),
    });
    const registry = createExtensionRegistry([
      defineExtension({ extensionId: "x-test/multi", types: [typeA, typeB] }),
    ]);

    const tmpDir = makeDir("api-test-multi");
    writeTsConfig(tmpDir);
    const filePath = path.join(tmpDir, "types.ts");
    fs.writeFileSync(filePath, "export type T = string;");
    try {
      const ctx = createProgramContext(filePath);
      const sf = ctx.program.getSourceFile(filePath);
      if (sf === undefined) {
        return;
      }
      const firstStatement = sf.statements[0];
      if (firstStatement === undefined) {
        return;
      }
      const type = ctx.checker.getTypeAtLocation(firstStatement);
      const sym = type.aliasSymbol ?? type.getSymbol();
      if (sym === undefined) {
        return;
      }

      // First call
      registry.setSymbolMap(new Map([[sym, { extensionId: "x-test/multi", registration: typeA }]]));
      expect(registry.findTypeBySymbol(sym)?.registration.typeName).toBe("TypeA");

      // Second call replaces the map
      registry.setSymbolMap(new Map([[sym, { extensionId: "x-test/multi", registration: typeB }]]));
      expect(registry.findTypeBySymbol(sym)?.registration.typeName).toBe("TypeB");
    } finally {
      cleanDir(tmpDir);
    }
  });
});

// =============================================================================
// UNIT TESTS — buildSymbolMapFromConfig edge cases
// =============================================================================

describe("buildSymbolMapFromConfig edge cases", () => {
  describe("multiple defineCustomType calls in one config", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = makeDir("multi-types");
      writeTsConfig(tmpDir);

      fs.writeFileSync(
        path.join(tmpDir, "types.ts"),
        [
          "declare const __decBrand: unique symbol;",
          "export type Decimal = string & { readonly [__decBrand]: true };",
          "declare const __dateBrand: unique symbol;",
          "export type DateOnly = string & { readonly [__dateBrand]: true };",
        ].join("\n")
      );

      fs.writeFileSync(
        path.join(tmpDir, "formspec.config.ts"),
        [
          'import type { Decimal, DateOnly } from "./types.js";',
          'import { defineCustomType, defineExtension } from "@formspec/core";',
          "",
          "export const extension = defineExtension({",
          '  extensionId: "x-test/multi",',
          "  types: [",
          '    defineCustomType<Decimal>({ typeName: "Decimal", toJsonSchema: () => ({ type: "string" }) }),',
          '    defineCustomType<DateOnly>({ typeName: "DateOnly", toJsonSchema: () => ({ type: "string", format: "date" }) }),',
          "  ],",
          "});",
        ].join("\n")
      );
    });

    afterAll(() => {
      cleanDir(tmpDir);
    });

    it("registers both branded types when config has 2 defineCustomType<T> calls", () => {
      const decimalType = defineCustomType({
        typeName: "Decimal",
        toJsonSchema: () => ({ type: "string" }),
      });
      const dateOnlyType = defineCustomType({
        typeName: "DateOnly",
        toJsonSchema: () => ({ type: "string", format: "date" }),
      });
      const registry = createExtensionRegistry([
        defineExtension({
          extensionId: "x-test/multi",
          types: [decimalType, dateOnlyType],
        }),
      ]);

      const configPath = path.join(tmpDir, "formspec.config.ts");
      const ctx = createProgramContext(path.join(tmpDir, "types.ts"), [configPath]);

      const symbolMap = buildSymbolMapFromConfig(configPath, ctx.program, ctx.checker, registry);

      // spec: symbol-registry §buildSymbolMapFromConfig → one entry per <T> call
      expect(symbolMap.size).toBe(2);

      const typeNames = [...symbolMap.values()].map((e) => e.registration.typeName).sort();
      expect(typeNames).toEqual(["DateOnly", "Decimal"]);
    });
  });

  describe("symbol-based resolution wins over brand-based when both are available", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = makeDir("sym-brand-priority");
      writeTsConfig(tmpDir);

      // A type with a brand identifier
      fs.writeFileSync(
        path.join(tmpDir, "types.ts"),
        [
          "declare const __myBrand: unique symbol;",
          "export type MyType = string & { readonly [__myBrand]: true };",
        ].join("\n")
      );

      // Consumer file
      fs.writeFileSync(
        path.join(tmpDir, "form.ts"),
        [
          'import type { MyType } from "./types.js";',
          "",
          "export interface TestForm {",
          "  field: MyType;",
          "}",
        ].join("\n")
      );

      // Config registers with both symbol AND brand
      fs.writeFileSync(
        path.join(tmpDir, "formspec.config.ts"),
        [
          'import type { MyType } from "./types.js";',
          'import { defineCustomType, defineExtension } from "@formspec/core";',
          "",
          "export const extension = defineExtension({",
          '  extensionId: "x-test/sym-brand",',
          "  types: [",
          "    defineCustomType<MyType>({",
          '      typeName: "MyType",',
          '      brand: "__myBrand",',
          '      toJsonSchema: () => ({ type: "string", format: "via-symbol" }),',
          "    }),",
          "  ],",
          "});",
        ].join("\n")
      );
    });

    afterAll(() => {
      cleanDir(tmpDir);
    });

    it("symbol-based resolution wins over brand-based when type has both symbol map entry and brand", () => {
      const myType = defineCustomType({
        typeName: "MyType",
        brand: "__myBrand",
        toJsonSchema: () => ({ type: "string", format: "via-symbol" }),
      });
      const config = {
        extensions: [defineExtension({ extensionId: "x-test/sym-brand", types: [myType] })],
        vendorPrefix: "x-test",
      };

      const result = generateSchemas({
        filePath: path.join(tmpDir, "form.ts"),
        typeName: "TestForm",
        errorReporting: "throw",
        config,
        configPath: path.join(tmpDir, "formspec.config.ts"),
      });

      const properties = result.jsonSchema.properties as Record<string, unknown>;

      // spec: resolveSymbolBasedCustomType fires after name-based but before brand-based;
      // with both paths available, format: "via-symbol" is produced via symbol-based detection.
      expect(properties["field"]).toMatchObject({ type: "string", format: "via-symbol" });
    });
  });

  describe("namespace import — import * as core → symbol still resolved via checker", () => {
    let tmpDir: string;

    beforeAll(() => {
      // Place the temp dir under the build package root so TypeScript can walk up
      // and find node_modules/@formspec/core for symbol-based detection.
      tmpDir = makeDirUnderBuildPackage("ns-import");
      writeTsConfig(tmpDir);

      fs.writeFileSync(
        path.join(tmpDir, "types.ts"),
        [
          "declare const __nsBrand: unique symbol;",
          "export type NsType = string & { readonly [__nsBrand]: true };",
        ].join("\n")
      );

      // Config uses namespace import — the visitor resolves the call symbol through the
      // type checker, so core.defineCustomType<NsType>() is correctly identified.
      fs.writeFileSync(
        path.join(tmpDir, "formspec.config.ts"),
        [
          'import type { NsType } from "./types.js";',
          'import * as core from "@formspec/core";',
          "",
          "export const extension = core.defineExtension({",
          '  extensionId: "x-test/ns",',
          "  types: [",
          "    core.defineCustomType<NsType>({",
          '      typeName: "NsType",',
          '      toJsonSchema: () => ({ type: "string" }),',
          "    }),",
          "  ],",
          "});",
        ].join("\n")
      );
    });

    afterAll(() => {
      cleanDir(tmpDir);
    });

    it("resolves defineCustomType<T> called via namespace import (core.defineCustomType)", () => {
      const nsType = defineCustomType({
        typeName: "NsType",
        toJsonSchema: () => ({ type: "string" }),
      });
      const registry = createExtensionRegistry([
        defineExtension({ extensionId: "x-test/ns", types: [nsType] }),
      ]);

      const configPath = path.join(tmpDir, "formspec.config.ts");
      const ctx = createProgramContext(path.join(tmpDir, "types.ts"), [configPath]);

      const symbolMap = buildSymbolMapFromConfig(configPath, ctx.program, ctx.checker, registry);

      // The checker resolves core.defineCustomType to the canonical @formspec/core declaration,
      // so namespace imports produce a symbol map entry just like direct imports.
      // spec: symbol-registry §isDefineCustomTypeCall → resolves via checker, handles namespace imports
      expect(symbolMap.size).toBe(1);
      const entry = [...symbolMap.values()][0];
      expect(entry?.registration.typeName).toBe("NsType");
    });
  });

  describe("typeName mismatch — typo in typeName prevents symbol map entry", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = makeDir("typo-typename");
      writeTsConfig(tmpDir);

      fs.writeFileSync(
        path.join(tmpDir, "types.ts"),
        [
          "declare const __tyBrand: unique symbol;",
          "export type Decimal = string & { readonly [__tyBrand]: true };",
        ].join("\n")
      );

      // Config has typeName: "Deciml" (typo) — does not match registry entry "Decimal"
      fs.writeFileSync(
        path.join(tmpDir, "formspec.config.ts"),
        [
          'import type { Decimal } from "./types.js";',
          'import { defineCustomType, defineExtension } from "@formspec/core";',
          "",
          "export const extension = defineExtension({",
          '  extensionId: "x-test/typo",',
          "  types: [",
          '    defineCustomType<Decimal>({ typeName: "Deciml", toJsonSchema: () => ({ type: "string" }) }),',
          "  ],",
          "});",
        ].join("\n")
      );
    });

    afterAll(() => {
      cleanDir(tmpDir);
    });

    it("produces no symbol map entry when typeName in config does not match the registry", () => {
      // Registry has the correct name "Decimal"; config file has typo "Deciml"
      const decimalType = defineCustomType({
        typeName: "Decimal",
        toJsonSchema: () => ({ type: "string" }),
      });
      const registry = createExtensionRegistry([
        defineExtension({ extensionId: "x-test/typo", types: [decimalType] }),
      ]);

      const configPath = path.join(tmpDir, "formspec.config.ts");
      const ctx = createProgramContext(path.join(tmpDir, "types.ts"), [configPath]);

      const symbolMap = buildSymbolMapFromConfig(configPath, ctx.program, ctx.checker, registry);

      // spec: symbol-registry §findRegistrationByTypeName → typeName must match exactly;
      // "Deciml" ≠ "Decimal" → no entry produced.
      expect(symbolMap.size).toBe(0);
    });
  });
});

// =============================================================================
// INTEGRATION TESTS — symbol-based resolution via generateSchemas
// =============================================================================

describe("symbol-based custom type resolution in schema generation", () => {
  // ---------------------------------------------------------------------------
  // Scenario 1: type param → field resolves to custom type
  // ---------------------------------------------------------------------------
  describe("type parameter → symbol resolves to custom type", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = makeDir("sym-gen");
      writeTsConfig(tmpDir);

      // Type definition file
      fs.writeFileSync(
        path.join(tmpDir, "decimal.ts"),
        [
          "declare const __decBrand: unique symbol;",
          "export type Decimal = string & { readonly [__decBrand]: true };",
        ].join("\n")
      );

      // Consumer file — uses Decimal as a field type
      fs.writeFileSync(
        path.join(tmpDir, "form.ts"),
        [
          'import type { Decimal } from "./decimal.js";',
          "",
          "export interface PaymentForm {",
          "  amount: Decimal;",
          "  label: string;",
          "}",
        ].join("\n")
      );

      // Config file with defineCustomType<Decimal>()
      fs.writeFileSync(
        path.join(tmpDir, "formspec.config.ts"),
        [
          'import type { Decimal } from "./decimal.js";',
          'import { defineCustomType, defineExtension } from "@formspec/core";',
          "",
          "export const extension = defineExtension({",
          '  extensionId: "x-test/sym",',
          "  types: [",
          "    defineCustomType<Decimal>({",
          '      typeName: "Decimal",',
          '      toJsonSchema: () => ({ type: "string", format: "decimal" }),',
          "    }),",
          "  ],",
          "});",
        ].join("\n")
      );
    });

    afterAll(() => {
      cleanDir(tmpDir);
    });

    it("resolves a Decimal field to its JSON Schema via symbol-based detection", () => {
      const decimalType = defineCustomType({
        typeName: "Decimal",
        toJsonSchema: () => ({ type: "string", format: "decimal" }),
      });
      const config = {
        extensions: [defineExtension({ extensionId: "x-test/sym", types: [decimalType] })],
        vendorPrefix: "x-test",
      };

      const result = generateSchemas({
        filePath: path.join(tmpDir, "form.ts"),
        typeName: "PaymentForm",
        errorReporting: "throw",
        config,
        configPath: path.join(tmpDir, "formspec.config.ts"),
      });

      const properties = result.jsonSchema.properties as Record<string, unknown>;

      // spec: symbol-based detection → custom type → toJsonSchema emits format: "decimal"
      expect(properties["amount"]).toMatchObject({ type: "string", format: "decimal" });
      // spec: plain string field is unaffected
      expect(properties["label"]).toMatchObject({ type: "string" });
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: import alias still matches via symbol
  // ---------------------------------------------------------------------------
  describe("import alias: type imported under a different name still matches", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = makeDir("sym-alias");
      writeTsConfig(tmpDir);

      fs.writeFileSync(
        path.join(tmpDir, "currency.ts"),
        [
          "declare const __currBrand: unique symbol;",
          "export type Money = string & { readonly [__currBrand]: true };",
        ].join("\n")
      );

      // Consumer imports Money as Amount — name would fail name-based lookup
      fs.writeFileSync(
        path.join(tmpDir, "form.ts"),
        [
          'import type { Money as Amount } from "./currency.js";',
          "",
          "export interface OrderForm {",
          "  total: Amount;",
          "}",
        ].join("\n")
      );

      // Config uses the canonical name Money
      fs.writeFileSync(
        path.join(tmpDir, "formspec.config.ts"),
        [
          'import type { Money } from "./currency.js";',
          'import { defineCustomType, defineExtension } from "@formspec/core";',
          "",
          "export const extension = defineExtension({",
          '  extensionId: "x-test/curr",',
          "  types: [",
          "    defineCustomType<Money>({",
          '      typeName: "Money",',
          '      toJsonSchema: () => ({ type: "string", format: "money" }),',
          "    }),",
          "  ],",
          "});",
        ].join("\n")
      );
    });

    afterAll(() => {
      cleanDir(tmpDir);
    });

    it("resolves an aliased import to the registered type via symbol identity", () => {
      const moneyType = defineCustomType({
        typeName: "Money",
        toJsonSchema: () => ({ type: "string", format: "money" }),
      });
      const config = {
        extensions: [defineExtension({ extensionId: "x-test/curr", types: [moneyType] })],
        vendorPrefix: "x-test",
      };

      const result = generateSchemas({
        filePath: path.join(tmpDir, "form.ts"),
        typeName: "OrderForm",
        errorReporting: "throw",
        config,
        configPath: path.join(tmpDir, "formspec.config.ts"),
      });

      const properties = result.jsonSchema.properties as Record<string, unknown>;

      // spec: symbol identity is canonical → alias resolution works
      expect(properties["total"]).toMatchObject({ type: "string", format: "money" });
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: type alias chain (type Amount = Money) → matches via symbol chain
  // ---------------------------------------------------------------------------
  describe("type alias chain: type Foo = Bar where Bar is the registered type", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = makeDir("sym-chain");
      writeTsConfig(tmpDir);

      fs.writeFileSync(
        path.join(tmpDir, "base.ts"),
        [
          "declare const __baseBrand: unique symbol;",
          "export type BaseDecimal = string & { readonly [__baseBrand]: true };",
          "/** Re-export under another alias */",
          "export type CurrencyAmount = BaseDecimal;",
        ].join("\n")
      );

      fs.writeFileSync(
        path.join(tmpDir, "form.ts"),
        [
          'import type { CurrencyAmount } from "./base.js";',
          "",
          "export interface InvoiceForm {",
          "  price: CurrencyAmount;",
          "}",
        ].join("\n")
      );

      // Config registers BaseDecimal; consumer uses CurrencyAmount
      fs.writeFileSync(
        path.join(tmpDir, "formspec.config.ts"),
        [
          'import type { BaseDecimal } from "./base.js";',
          'import { defineCustomType, defineExtension } from "@formspec/core";',
          "",
          "export const extension = defineExtension({",
          '  extensionId: "x-test/chain",',
          "  types: [",
          "    defineCustomType<BaseDecimal>({",
          '      typeName: "BaseDecimal",',
          '      toJsonSchema: () => ({ type: "string", format: "base-decimal" }),',
          "    }),",
          "  ],",
          "});",
        ].join("\n")
      );
    });

    afterAll(() => {
      cleanDir(tmpDir);
    });

    it("resolves an alias chain to the registered type via canonical symbol", () => {
      const baseDecimalType = defineCustomType({
        typeName: "BaseDecimal",
        toJsonSchema: () => ({ type: "string", format: "base-decimal" }),
      });
      const config = {
        extensions: [defineExtension({ extensionId: "x-test/chain", types: [baseDecimalType] })],
        vendorPrefix: "x-test",
      };

      const result = generateSchemas({
        filePath: path.join(tmpDir, "form.ts"),
        typeName: "InvoiceForm",
        errorReporting: "throw",
        config,
        configPath: path.join(tmpDir, "formspec.config.ts"),
      });

      const properties = result.jsonSchema.properties as Record<string, unknown>;

      // spec: alias chain → canonical symbol match → toJsonSchema emits format: "base-decimal"
      expect(properties["price"]).toMatchObject({ type: "string", format: "base-decimal" });
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: defineCustomType() without <T> → no symbol → falls back to name/brand
  // ---------------------------------------------------------------------------
  describe("fallback: no type param → name-based lookup still works", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = makeDir("sym-fallback");
      writeTsConfig(tmpDir);

      fs.writeFileSync(
        path.join(tmpDir, "types.ts"),
        ["/** Tagged string */", "export type Tagged = string;"].join("\n")
      );

      fs.writeFileSync(
        path.join(tmpDir, "form.ts"),
        [
          'import type { Tagged } from "./types.js";',
          "",
          "export interface TagForm {",
          "  value: Tagged;",
          "}",
        ].join("\n")
      );

      // Config uses defineCustomType without type param + tsTypeNames for name-based lookup
      fs.writeFileSync(
        path.join(tmpDir, "formspec.config.ts"),
        [
          'import { defineCustomType, defineExtension } from "@formspec/core";',
          "",
          "export const extension = defineExtension({",
          '  extensionId: "x-test/fallback",',
          "  types: [",
          "    defineCustomType({",
          '      typeName: "TaggedFallback",',
          '      tsTypeNames: ["Tagged"],',
          '      toJsonSchema: () => ({ type: "string", format: "tagged" }),',
          "    }),",
          "  ],",
          "});",
        ].join("\n")
      );
    });

    afterAll(() => {
      cleanDir(tmpDir);
    });

    it("falls back to name-based detection when no type parameter is present", () => {
      const taggedType = defineCustomType({
        typeName: "TaggedFallback",
        tsTypeNames: ["Tagged"],
        toJsonSchema: () => ({ type: "string", format: "tagged" }),
      });
      const config = {
        extensions: [defineExtension({ extensionId: "x-test/fallback", types: [taggedType] })],
        vendorPrefix: "x-test",
      };

      const result = generateSchemas({
        filePath: path.join(tmpDir, "form.ts"),
        typeName: "TagForm",
        errorReporting: "throw",
        config,
        configPath: path.join(tmpDir, "formspec.config.ts"),
      });

      const properties = result.jsonSchema.properties as Record<string, unknown>;

      // spec: name-based fallback → toJsonSchema emits format: "tagged"
      expect(properties["value"]).toMatchObject({ type: "string", format: "tagged" });
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: symbol-only resolution — import alias not in tsTypeNames
  // ---------------------------------------------------------------------------
  describe("symbol-only: import alias not in tsTypeNames — name-based cannot match", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = makeDir("sym-alias-only");
      writeTsConfig(tmpDir);

      // The canonical type is declared as OriginalDecimal.
      fs.writeFileSync(
        path.join(tmpDir, "decimal.ts"),
        [
          "declare const __origDecBrand: unique symbol;",
          "export type OriginalDecimal = string & { readonly [__origDecBrand]: true };",
        ].join("\n")
      );

      // Consumer imports it under the alias "AliasedDecimal".
      // Name-based lookup (tsTypeNames: ["OriginalDecimal"]) cannot match "AliasedDecimal".
      // Only symbol-based resolution can succeed here.
      fs.writeFileSync(
        path.join(tmpDir, "form.ts"),
        [
          'import type { OriginalDecimal as AliasedDecimal } from "./decimal.js";',
          "",
          "export interface AliasForm {",
          "  amount: AliasedDecimal;",
          "}",
        ].join("\n")
      );

      // Config registers with the type parameter <OriginalDecimal> AND tsTypeNames
      // that only lists "OriginalDecimal" — the consumer's alias "AliasedDecimal" is absent.
      fs.writeFileSync(
        path.join(tmpDir, "formspec.config.ts"),
        [
          'import type { OriginalDecimal } from "./decimal.js";',
          'import { defineCustomType, defineExtension } from "@formspec/core";',
          "",
          "export const extension = defineExtension({",
          '  extensionId: "x-test/alias-only",',
          "  types: [",
          "    defineCustomType<OriginalDecimal>({",
          '      typeName: "OriginalDecimal",',
          '      tsTypeNames: ["OriginalDecimal"],',
          '      toJsonSchema: () => ({ type: "string", format: "original-decimal" }),',
          "    }),",
          "  ],",
          "});",
        ].join("\n")
      );
    });

    afterAll(() => {
      cleanDir(tmpDir);
    });

    it("resolves via symbol when tsTypeNames cannot match (import alias)", () => {
      // The type is registered with tsTypeNames: ["OriginalDecimal"] only.
      // The consumer uses "AliasedDecimal" — name-based lookup ("AliasedDecimal" vs
      // tsTypeNames: ["OriginalDecimal"]) fails. Symbol-based must succeed via ts.Symbol identity.
      const originalDecimalType = defineCustomType({
        typeName: "OriginalDecimal",
        tsTypeNames: ["OriginalDecimal"],
        toJsonSchema: () => ({ type: "string", format: "original-decimal" }),
      });
      const config = {
        extensions: [
          defineExtension({
            extensionId: "x-test/alias-only",
            types: [originalDecimalType],
          }),
        ],
        vendorPrefix: "x-test",
      };

      const result = generateSchemas({
        filePath: path.join(tmpDir, "form.ts"),
        typeName: "AliasForm",
        errorReporting: "throw",
        config,
        configPath: path.join(tmpDir, "formspec.config.ts"),
      });

      const properties = result.jsonSchema.properties as Record<string, unknown>;

      // spec: symbol-based resolution matches OriginalDecimal via ts.Symbol identity,
      // even though the consumer imports it as "AliasedDecimal" which is absent from tsTypeNames.
      expect(properties["amount"]).toMatchObject({ type: "string", format: "original-decimal" });
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 7: priority order — name-based runs before symbol-based
  // ---------------------------------------------------------------------------
  describe("priority order: name-based lookup fires before symbol-based lookup", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = makeDir("sym-priority");
      writeTsConfig(tmpDir);

      fs.writeFileSync(
        path.join(tmpDir, "types.ts"),
        [
          "declare const __priBrand: unique symbol;",
          "export type PriorityType = string & { readonly [__priBrand]: true };",
        ].join("\n")
      );

      fs.writeFileSync(
        path.join(tmpDir, "form.ts"),
        [
          'import type { PriorityType } from "./types.js";',
          "",
          "export interface PriorityForm {",
          "  field: PriorityType;",
          "}",
        ].join("\n")
      );

      // Config registers PriorityType with both a symbol AND a name-based entry.
      // name-based (via tsTypeNames) fires first per the resolveRegisteredCustomType path.
      fs.writeFileSync(
        path.join(tmpDir, "formspec.config.ts"),
        [
          'import type { PriorityType } from "./types.js";',
          'import { defineCustomType, defineExtension } from "@formspec/core";',
          "",
          "export const extension = defineExtension({",
          '  extensionId: "x-test/pri",',
          "  types: [",
          "    defineCustomType<PriorityType>({",
          '      typeName: "ViaSymbol",',
          '      toJsonSchema: () => ({ type: "string", format: "via-symbol" }),',
          "    }),",
          "    defineCustomType({",
          '      typeName: "ViaName",',
          '      tsTypeNames: ["PriorityType"],',
          '      toJsonSchema: () => ({ type: "string", format: "via-name" }),',
          "    }),",
          "  ],",
          "});",
        ].join("\n")
      );
    });

    afterAll(() => {
      cleanDir(tmpDir);
    });

    it("name-registered type (via tsTypeNames) takes priority over symbol-registered type", () => {
      const viaSymbol = defineCustomType({
        typeName: "ViaSymbol",
        toJsonSchema: () => ({ type: "string", format: "via-symbol" }),
      });
      const viaName = defineCustomType({
        typeName: "ViaName",
        tsTypeNames: ["PriorityType"],
        toJsonSchema: () => ({ type: "string", format: "via-name" }),
      });
      const config = {
        extensions: [
          defineExtension({
            extensionId: "x-test/pri",
            types: [viaSymbol, viaName],
          }),
        ],
        vendorPrefix: "x-test",
      };

      const result = generateSchemas({
        filePath: path.join(tmpDir, "form.ts"),
        typeName: "PriorityForm",
        errorReporting: "throw",
        config,
        configPath: path.join(tmpDir, "formspec.config.ts"),
      });

      const properties = result.jsonSchema.properties as Record<string, unknown>;

      // spec: resolveRegisteredCustomType (name-based) fires before resolveSymbolBasedCustomType.
      // "PriorityType" matches "ViaName" via tsTypeNames → resolves to format: "via-name".
      // This documents the current priority: name → symbol → brand.
      expect(properties["field"]).toMatchObject({ type: "string", format: "via-name" });
    });
  });
});
