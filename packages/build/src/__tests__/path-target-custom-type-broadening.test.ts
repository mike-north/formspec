/**
 * Extended path-targeted custom-type broadening tests.
 *
 * Covers the full matrix of registration styles × nesting depths × structural
 * shapes (nullable unions, mixed compositions) for path-targeted
 * `@constraint :path value` tags that resolve to extension-registered custom
 * types.
 *
 * Three registration styles under test:
 *   1. Name-based Decimal   (`tsTypeNames: ["Decimal"]`)
 *   2. Brand-based Decimal  (`brand: "__decimalBrand"`)
 *   3. String-backed PostalCode (broadens `maxLength` + `pattern`)
 *
 * Design notes:
 *   - Path-targeted broadening emits vocabulary keywords at the terminal
 *     location when the terminal type is a registered custom type with a
 *     broadening for that tag (issue #395).
 *   - The test fixtures use `emitsVocabularyKeywords: true` so assertions can
 *     pin camelCase keyword names directly (e.g. `decimalMinimum: "0"`) rather
 *     than vendor-prefix constructions.
 *   - Payload values are strings because the fixture's `parseValue` uses
 *     `(raw) => raw.trim()`.
 *   - "Correct terminal" means the keyword lands on `properties.<last-segment>`
 *     within any intermediate `properties` nesting, not on an enclosing level.
 *   - Array traversal via path-targeting (`:items.amount`) is not currently
 *     supported; tests for that feature are deferred.
 *   - Records/dictionaries are not currently traversable via path targeting;
 *     a TODO is included below.
 *
 * @see https://github.com/mike-north/formspec/issues/395 — path-targeted broadening
 * @see https://json-schema.org/draft/2020-12/json-schema-core §10.2.1 — sibling keywords next to $ref
 */

import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { defineConstraint, defineCustomType, defineExtension } from "@formspec/core/internals";
import type { FormSpecConfig } from "@formspec/config";
import { type ClassSchemas, generateSchemas } from "../generators/class-schema.js";
import type { JsonSchema2020 } from "../json-schema/ir-generator.js";

// =============================================================================
// EXTENSION FIXTURES
//
// All fixtures use `emitsVocabularyKeywords: true` so broadened output is a
// camelCase keyword + string payload. This lets tests pin exact values without
// accounting for vendor-prefix construction.
// =============================================================================

/** Identity parser: returns the raw tag argument as a trimmed string. */
const trimmedString = (raw: string): string => raw.trim();

/**
 * Name-based Decimal: detected by the TypeScript alias name "Decimal".
 * Broadenings map @minimum → decimalMinimum, @maximum → decimalMaximum, etc.
 * Payload is a string (the raw tag argument).
 */
const nameBasedDecimalExtension = defineExtension({
  extensionId: "x-test/decimal-name",
  types: [
    defineCustomType({
      typeName: "Decimal",
      tsTypeNames: ["Decimal"],
      builtinConstraintBroadenings: [
        { tagName: "minimum", constraintName: "DecimalMinimum", parseValue: trimmedString },
        { tagName: "maximum", constraintName: "DecimalMaximum", parseValue: trimmedString },
        {
          tagName: "exclusiveMinimum",
          constraintName: "DecimalExclusiveMinimum",
          parseValue: trimmedString,
        },
        {
          tagName: "exclusiveMaximum",
          constraintName: "DecimalExclusiveMaximum",
          parseValue: trimmedString,
        },
        { tagName: "multipleOf", constraintName: "DecimalMultipleOf", parseValue: trimmedString },
      ],
      toJsonSchema: () => ({ type: "string", format: "decimal" }),
    }),
  ],
  constraints: [
    defineConstraint({
      constraintName: "DecimalMinimum",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      isApplicableToType: (t) => t.kind === "custom",
      emitsVocabularyKeywords: true,
      semanticRole: { family: "decimal-bound", bound: "lower", inclusive: true },
      toJsonSchema: (payload) => ({ decimalMinimum: payload }),
    }),
    defineConstraint({
      constraintName: "DecimalMaximum",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      isApplicableToType: (t) => t.kind === "custom",
      emitsVocabularyKeywords: true,
      semanticRole: { family: "decimal-bound", bound: "upper", inclusive: true },
      toJsonSchema: (payload) => ({ decimalMaximum: payload }),
    }),
    defineConstraint({
      constraintName: "DecimalExclusiveMinimum",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      isApplicableToType: (t) => t.kind === "custom",
      emitsVocabularyKeywords: true,
      semanticRole: { family: "decimal-bound", bound: "lower", inclusive: false },
      toJsonSchema: (payload) => ({ decimalExclusiveMinimum: payload }),
    }),
    defineConstraint({
      constraintName: "DecimalExclusiveMaximum",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      isApplicableToType: (t) => t.kind === "custom",
      emitsVocabularyKeywords: true,
      semanticRole: { family: "decimal-bound", bound: "upper", inclusive: false },
      toJsonSchema: (payload) => ({ decimalExclusiveMaximum: payload }),
    }),
    defineConstraint({
      constraintName: "DecimalMultipleOf",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      isApplicableToType: (t) => t.kind === "custom",
      emitsVocabularyKeywords: true,
      toJsonSchema: (payload) => ({ decimalMultipleOf: payload }),
    }),
  ],
});

/**
 * Brand-based Decimal: detected via the `__decimalBrand` unique-symbol
 * computed property key. Same broadenings as the name-based version.
 */
const brandBasedDecimalExtension = defineExtension({
  extensionId: "x-test/decimal-brand",
  types: [
    defineCustomType({
      typeName: "Decimal",
      brand: "__decimalBrand",
      builtinConstraintBroadenings: [
        { tagName: "minimum", constraintName: "DecimalMinimum", parseValue: trimmedString },
        { tagName: "maximum", constraintName: "DecimalMaximum", parseValue: trimmedString },
        {
          tagName: "exclusiveMinimum",
          constraintName: "DecimalExclusiveMinimum",
          parseValue: trimmedString,
        },
        {
          tagName: "exclusiveMaximum",
          constraintName: "DecimalExclusiveMaximum",
          parseValue: trimmedString,
        },
        { tagName: "multipleOf", constraintName: "DecimalMultipleOf", parseValue: trimmedString },
      ],
      toJsonSchema: () => ({ type: "string", format: "decimal" }),
    }),
  ],
  constraints: [
    defineConstraint({
      constraintName: "DecimalMinimum",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      emitsVocabularyKeywords: true,
      semanticRole: { family: "decimal-bound", bound: "lower", inclusive: true },
      toJsonSchema: (payload) => ({ decimalMinimum: payload }),
    }),
    defineConstraint({
      constraintName: "DecimalMaximum",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      emitsVocabularyKeywords: true,
      semanticRole: { family: "decimal-bound", bound: "upper", inclusive: true },
      toJsonSchema: (payload) => ({ decimalMaximum: payload }),
    }),
    defineConstraint({
      constraintName: "DecimalExclusiveMinimum",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      emitsVocabularyKeywords: true,
      semanticRole: { family: "decimal-bound", bound: "lower", inclusive: false },
      toJsonSchema: (payload) => ({ decimalExclusiveMinimum: payload }),
    }),
    defineConstraint({
      constraintName: "DecimalExclusiveMaximum",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      emitsVocabularyKeywords: true,
      semanticRole: { family: "decimal-bound", bound: "upper", inclusive: false },
      toJsonSchema: (payload) => ({ decimalExclusiveMaximum: payload }),
    }),
    defineConstraint({
      constraintName: "DecimalMultipleOf",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      emitsVocabularyKeywords: true,
      toJsonSchema: (payload) => ({ decimalMultipleOf: payload }),
    }),
  ],
});

/**
 * String-backed PostalCode: detected by the TypeScript alias name "PostalCode".
 * Broadens `maxLength` → postalMaxLength, `pattern` → postalPattern.
 */
const postalCodeExtension = defineExtension({
  extensionId: "x-test/postal-code",
  types: [
    defineCustomType({
      typeName: "PostalCode",
      tsTypeNames: ["PostalCode"],
      builtinConstraintBroadenings: [
        { tagName: "maxLength", constraintName: "PostalCodeMaxLength", parseValue: trimmedString },
        { tagName: "pattern", constraintName: "PostalCodePattern", parseValue: trimmedString },
      ],
      toJsonSchema: () => ({ type: "string", format: "postal-code" }),
    }),
  ],
  constraints: [
    defineConstraint({
      constraintName: "PostalCodeMaxLength",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      emitsVocabularyKeywords: true,
      semanticRole: { family: "postal-length", bound: "upper", inclusive: true },
      toJsonSchema: (payload) => ({ postalMaxLength: payload }),
    }),
    defineConstraint({
      constraintName: "PostalCodePattern",
      compositionRule: "override",
      applicableTypes: ["custom"],
      emitsVocabularyKeywords: true,
      toJsonSchema: (payload) => ({ postalPattern: payload }),
    }),
  ],
});

// =============================================================================
// CONFIG OBJECTS
// =============================================================================

const nameBasedConfig: FormSpecConfig = {
  extensions: [nameBasedDecimalExtension],
  vendorPrefix: "x-formspec",
};

const brandBasedConfig: FormSpecConfig = {
  extensions: [brandBasedDecimalExtension],
  vendorPrefix: "x-test",
};

const postalCodeConfig: FormSpecConfig = {
  extensions: [postalCodeExtension],
  vendorPrefix: "x-formspec",
};

// =============================================================================
// SOURCE DECLARATIONS
// =============================================================================

/** TypeScript source for the name-based Decimal type. */
const NAME_DECIMAL_DECL = `export type Decimal = string & { readonly __brand: "Decimal" };`;

/** TypeScript source for the brand-based Decimal type. */
const BRAND_DECIMAL_DECL = [
  "declare const __decimalBrand: unique symbol;",
  "export type Decimal = string & { readonly [__decimalBrand]: true };",
].join("\n");

/** TypeScript source for the PostalCode type. */
const POSTAL_CODE_DECL = `export type PostalCode = string & { readonly __postalBrand: "PostalCode" };`;

// =============================================================================
// TEST HELPERS
// =============================================================================

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeTempSource(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-path-broaden-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "model.ts");
  fs.writeFileSync(filePath, source);
  return filePath;
}

function runSchema(source: string, config: FormSpecConfig): ClassSchemas {
  const filePath = writeTempSource(source);
  return generateSchemas({
    filePath,
    typeName: "Root",
    config,
    errorReporting: "throw",
  });
}

/**
 * Drills into a schema along the given path segments (via `.properties[seg]`)
 * and returns the terminal sub-schema. Returns `undefined` if any segment is
 * missing. Used to assert that a keyword lands at the correct level.
 */
function drillToTerminal(
  schema: JsonSchema2020 | undefined,
  ...segments: string[]
): Record<string, unknown> | undefined {
  let current: Record<string, unknown> | undefined = schema as Record<string, unknown> | undefined;
  for (const seg of segments) {
    if (current === undefined) return undefined;
    const props = current["properties"] as Record<string, unknown> | undefined;
    current = props?.[seg] as Record<string, unknown> | undefined;
  }
  return current;
}

/**
 * Gets the top-level field schema from the root object's properties and
 * drills through the given path segments to find the terminal sub-schema.
 *
 * @param result       - schema generation result
 * @param rootField    - the top-level property name (e.g. "total")
 * @param pathSegments - the segment chain to traverse within the field schema
 */
function getTerminal(
  result: ClassSchemas,
  rootField: string,
  ...pathSegments: string[]
): Record<string, unknown> | undefined {
  const fieldSchema = result.jsonSchema.properties?.[rootField];
  if (fieldSchema === undefined) return undefined;

  // When there's only one segment, check `fieldSchema.properties[segment]`.
  // When multiple segments, drill through nested `properties` chains.
  return drillToTerminal(fieldSchema, ...pathSegments);
}

/**
 * Asserts that a keyword is present at the terminal of a path-targeted
 * constraint, and that it does NOT appear at any intermediate level.
 *
 * @param result          - schema generation result
 * @param rootField       - top-level field name
 * @param pathSegments    - full path to the terminal (at least 1 segment)
 * @param keyword         - vocabulary keyword expected at the terminal
 * @param expectedValue   - expected keyword value (string payload)
 */
function expectTerminalKeyword(
  result: ClassSchemas,
  rootField: string,
  pathSegments: readonly string[],
  keyword: string,
  expectedValue: unknown
): void {
  expect(pathSegments.length, "pathSegments must have at least one segment").toBeGreaterThan(0);

  const terminal = getTerminal(result, rootField, ...pathSegments);
  expect(
    terminal,
    `expected terminal schema at ${rootField}.${pathSegments.join(".")} to exist`
  ).toBeDefined();
  expect(
    terminal?.[keyword],
    `expected ${keyword} === ${String(expectedValue)} at terminal ${rootField}.${pathSegments.join(".")}`
  ).toBe(expectedValue);

  // Guard: keyword must NOT appear at intermediate levels (leak detection).
  // Check each prefix of pathSegments (excluding the full path and the empty prefix).
  for (let depth = 1; depth < pathSegments.length; depth++) {
    const intermediate = getTerminal(result, rootField, ...pathSegments.slice(0, depth));
    expect(
      intermediate?.[keyword],
      `keyword "${keyword}" must NOT appear at intermediate level ${rootField}.${pathSegments.slice(0, depth).join(".")} (leaked from terminal)`
    ).toBeUndefined();
  }

  // Guard: keyword must NOT appear directly on the root field schema.
  const fieldSchema = result.jsonSchema.properties?.[rootField] as
    | Record<string, unknown>
    | undefined;
  if (pathSegments.length > 0) {
    expect(
      fieldSchema?.[keyword],
      `keyword "${keyword}" must NOT leak onto the root field schema '${rootField}'`
    ).toBeUndefined();
  }
}

// =============================================================================
// DEPTH MATRIX — shared fixture types
// =============================================================================

/**
 * Nested type declarations for the depth matrix.
 * Each declaration builds on the previous level.
 *
 *  MonetaryAmount: { amount: Decimal; currency: string }
 *  LineItem:       { money: MonetaryAmount }
 *  Order:          { line: LineItem }
 *  Invoice:        { order: Order }
 */
function buildDepthSource(decl: string, rootDef: string): string {
  return [
    decl,
    "export interface MonetaryAmount { amount: Decimal; currency: string; }",
    "export interface LineItem { money: MonetaryAmount; }",
    "export interface Order { line: LineItem; }",
    "export interface Invoice { order: Order; }",
    "",
    rootDef,
  ].join("\n");
}

// =============================================================================
// MULTI-LEVEL PATH-TARGET NESTING MATRIX
// =============================================================================

describe("multi-level path-target nesting", () => {
  /**
   * Each row: depth, fieldType, tag, rootDefinition, pathToTerminal,
   * vocabularyKeyword, payload.
   *
   * Post-fix (#395): broadened vocabulary keywords + string payloads.
   *
   * The "correct terminal" for each depth:
   *   depth 1: amount  → final path = ["amount"]
   *   depth 2: money.amount → final path = ["money", "amount"]
   *   depth 3: line.money.amount → final path = ["line", "money", "amount"]
   *   depth 4: order.line.money.amount → final path = ["order", "line", "money", "amount"]
   */
  interface DepthCase {
    label: string;
    /** Root type definition source (will be appended after the nested types) */
    rootTypeDef: string;
    /** The path segments used in the tag: e.g. ["amount"] for @minimum :amount 0 */
    pathSegments: string[];
    /** Top-level field name in Root */
    rootField: string;
    /** Vocabulary keyword expected at the terminal (post-fix broadened form) */
    keyword: string;
    /** Expected keyword value (string payload from trimmedString parser) */
    value: string;
  }

  const depthCases: DepthCase[] = [
    {
      label: "depth 1 — @minimum :amount 0 on MonetaryAmount { amount: Decimal }",
      rootTypeDef: [
        "export interface Root {",
        "  /** @minimum :amount 0 */",
        "  total: MonetaryAmount;",
        "}",
      ].join("\n"),
      pathSegments: ["amount"],
      rootField: "total",
      keyword: "decimalMinimum",
      value: "0",
    },
    {
      label: "depth 2 — @minimum :money.amount 0 on LineItem { money: MonetaryAmount }",
      rootTypeDef: [
        "export interface Root {",
        "  /** @minimum :money.amount 0 */",
        "  item: LineItem;",
        "}",
      ].join("\n"),
      pathSegments: ["money", "amount"],
      rootField: "item",
      keyword: "decimalMinimum",
      value: "0",
    },
    {
      label: "depth 3 — @minimum :line.money.amount 0 on Order { line: LineItem }",
      rootTypeDef: [
        "export interface Root {",
        "  /** @minimum :line.money.amount 0 */",
        "  order: Order;",
        "}",
      ].join("\n"),
      pathSegments: ["line", "money", "amount"],
      rootField: "order",
      keyword: "decimalMinimum",
      value: "0",
    },
    {
      label: "depth 4 — @minimum :order.line.money.amount 0 on Invoice { order: Order }",
      rootTypeDef: [
        "export interface Root {",
        "  /** @minimum :order.line.money.amount 0 */",
        "  invoice: Invoice;",
        "}",
      ].join("\n"),
      pathSegments: ["order", "line", "money", "amount"],
      rootField: "invoice",
      keyword: "decimalMinimum",
      value: "0",
    },
  ];

  describe("name-based Decimal registration", () => {
    it.each(depthCases)("$label", ({ rootTypeDef, pathSegments, rootField, keyword, value }) => {
      const source = buildDepthSource(NAME_DECIMAL_DECL, rootTypeDef);
      const result = runSchema(source, nameBasedConfig);
      expectTerminalKeyword(result, rootField, pathSegments, keyword, value);
    });
  });

  describe("brand-based Decimal registration", () => {
    it.each(depthCases)("$label", ({ rootTypeDef, pathSegments, rootField, keyword, value }) => {
      const source = buildDepthSource(BRAND_DECIMAL_DECL, rootTypeDef);
      const result = runSchema(source, brandBasedConfig);
      expectTerminalKeyword(result, rootField, pathSegments, keyword, value);
    });
  });

  describe("string-backed PostalCode registration", () => {
    /**
     * PostalCode variants of the depth matrix — uses maxLength (a string
     * constraint) rather than minimum (numeric). The nested type is replaced
     * with a PostalCode subfield.
     * Post-fix: broadened to postalMaxLength: "5".
     */
    const postalDepthCases: DepthCase[] = [
      {
        label: "depth 1 — @maxLength :code 5 on AddressLine { code: PostalCode }",
        rootTypeDef: [
          "export interface Root {",
          "  /** @maxLength :code 5 */",
          "  addr: AddressLine;",
          "}",
        ].join("\n"),
        pathSegments: ["code"],
        rootField: "addr",
        keyword: "postalMaxLength",
        value: "5",
      },
      {
        label: "depth 2 — @maxLength :address.code 5 on Contact { address: AddressLine }",
        rootTypeDef: [
          "export interface Root {",
          "  /** @maxLength :address.code 5 */",
          "  contact: Contact;",
          "}",
        ].join("\n"),
        pathSegments: ["address", "code"],
        rootField: "contact",
        keyword: "postalMaxLength",
        value: "5",
      },
      {
        label: "depth 3 — @maxLength :person.address.code 5 on Record { person: Contact }",
        rootTypeDef: [
          "export interface Root {",
          "  /** @maxLength :person.address.code 5 */",
          "  record: PersonRecord;",
          "}",
        ].join("\n"),
        pathSegments: ["person", "address", "code"],
        rootField: "record",
        keyword: "postalMaxLength",
        value: "5",
      },
      {
        label: "depth 4 — @maxLength :group.person.address.code 5 on Team { group: PersonRecord }",
        rootTypeDef: [
          "export interface Root {",
          "  /** @maxLength :group.person.address.code 5 */",
          "  team: Team;",
          "}",
        ].join("\n"),
        pathSegments: ["group", "person", "address", "code"],
        rootField: "team",
        keyword: "postalMaxLength",
        value: "5",
      },
    ];

    it.each(postalDepthCases)(
      "$label",
      ({ rootTypeDef, pathSegments, rootField, keyword, value }) => {
        const source = [
          POSTAL_CODE_DECL,
          "export interface AddressLine { code: PostalCode; label: string; }",
          "export interface Contact { address: AddressLine; name: string; }",
          "export interface PersonRecord { person: Contact; id: string; }",
          "export interface Team { group: PersonRecord; teamName: string; }",
          "",
          rootTypeDef,
        ].join("\n");
        const result = runSchema(source, postalCodeConfig);
        expectTerminalKeyword(result, rootField, pathSegments, keyword, value);
      }
    );
  });
});

// =============================================================================
// ARRAY TRAVERSAL AT MULTIPLE DEPTHS
//
// NOTE: Array path traversal (`:items.amount`) is NOT currently supported.
// `@minimum :items.amount 0` on an array field produces `UNKNOWN_PATH_TARGET`.
// Tests for array traversal are deferred until the feature is implemented.
//
// TODO: Implement array traversal and add tests here once supported.
// See: https://github.com/mike-north/formspec/issues/395 (follow-up)
// =============================================================================

// =============================================================================
// NULLABLE AT VARIOUS DEPTHS
// =============================================================================

describe("nullable at various depths", () => {
  it("nullable at terminal — MonetaryAmount { amount: Decimal | null }", () => {
    // The terminal is `amount: Decimal | null`. Broadening should still apply
    // (the nullable branch recurses into the non-null arm for capability check).
    // Post-fix: produces decimalMinimum: "0", not minimum: 0.
    const source = [
      NAME_DECIMAL_DECL,
      "export interface MonetaryAmount { amount: Decimal | null; currency: string; }",
      "export interface Root {",
      "  /** @minimum :amount 0 */",
      "  total: MonetaryAmount;",
      "}",
    ].join("\n");

    const result = runSchema(source, nameBasedConfig);
    const terminal = getTerminal(result, "total", "amount");
    expect(terminal, "expected amount sub-schema with nullable terminal").toBeDefined();
    expect(terminal?.["decimalMinimum"]).toBe("0");
  });

  it("nullable at intermediate — LineItem { money: MonetaryAmount | null } with @minimum :money.amount 0", () => {
    // Nullable at an intermediate segment: `money` is `MonetaryAmount | null`.
    // Both resolvers (TS-level `resolvePathTargetType` and IR-level
    // `resolveProperty`) strip the nullable union and continue traversal to
    // the terminal `amount` Decimal. Broadening applies at the terminal.
    const source = [
      NAME_DECIMAL_DECL,
      "export interface MonetaryAmount { amount: Decimal; currency: string; }",
      "export interface LineItem { money: MonetaryAmount | null; qty: number; }",
      "export interface Root {",
      "  /** @minimum :money.amount 0 */",
      "  line: LineItem;",
      "}",
    ].join("\n");

    const result = runSchema(source, nameBasedConfig);
    const terminal = getTerminal(result, "line", "money", "amount");
    expect(terminal, "expected money.amount sub-schema through nullable intermediate").toBeDefined();
    expect(terminal?.["decimalMinimum"]).toBe("0");
  });

  it("nullable at root segment — Order { line: LineItem | null } with @minimum :line.money.amount 0", () => {
    // Nullable at the first segment of the path. Traversal must strip
    // the nullable union on the root before descending into `money.amount`.
    const source = [
      NAME_DECIMAL_DECL,
      "export interface MonetaryAmount { amount: Decimal; currency: string; }",
      "export interface LineItem { money: MonetaryAmount; qty: number; }",
      "export interface Order { line: LineItem | null; orderId: string; }",
      "export interface Root {",
      "  /** @minimum :line.money.amount 0 */",
      "  order: Order;",
      "}",
    ].join("\n");

    const result = runSchema(source, nameBasedConfig);
    const terminal = getTerminal(result, "order", "line", "money", "amount");
    expect(terminal, "expected line.money.amount sub-schema through nullable root segment").toBeDefined();
    expect(terminal?.["decimalMinimum"]).toBe("0");
  });

  it("nullable at multiple levels — doubly-nullable chain with @minimum :line.money.amount 0", () => {
    // Nullable at BOTH the root segment AND the intermediate segment. Each
    // nullable stripping happens at the level it appears; the terminal is
    // non-nullable Decimal.
    const source = [
      NAME_DECIMAL_DECL,
      "export interface MonetaryAmount { amount: Decimal; currency: string; }",
      "export interface LineItem { money: MonetaryAmount | null; qty: number; }",
      "export interface Order { line: LineItem | null; orderId: string; }",
      "export interface Root {",
      "  /** @minimum :line.money.amount 0 */",
      "  order: Order;",
      "}",
    ].join("\n");

    const result = runSchema(source, nameBasedConfig);
    const terminal = getTerminal(result, "order", "line", "money", "amount");
    expect(terminal, "expected terminal through doubly-nullable chain").toBeDefined();
    expect(terminal?.["decimalMinimum"]).toBe("0");
  });
});

// =============================================================================
// MIXED SHAPE COMPOSITION
// =============================================================================

describe("mixed shape composition", () => {
  it("array of MonetaryAmount — @minimum :items.amount 0 on Cart { items: MonetaryAmount[] }", () => {
    // Path traversal strips array-container levels transparently: both
    // `resolvePathTargetType` (TS-level) and `resolveProperty` (IR-level)
    // descend into `ArrayTypeNode.items` without consuming a path segment.
    // The override surfaces inside `items.properties.amount` on the generated
    // array schema.
    const source = [
      NAME_DECIMAL_DECL,
      "export interface MonetaryAmount { amount: Decimal; currency: string; }",
      "export interface Cart { items: MonetaryAmount[]; total: number; }",
      "export interface Root {",
      "  /** @minimum :items.amount 0 */",
      "  cart: Cart;",
      "}",
    ].join("\n");

    const result = runSchema(source, nameBasedConfig);
    // `items` resolves to the array field; the override lives under its
    // `items` (array element) sub-schema, below `properties.amount`.
    const cart = result.jsonSchema.properties?.["cart"] as Record<string, unknown> | undefined;
    const itemsField = (cart?.["properties"] as Record<string, unknown> | undefined)?.["items"] as
      | Record<string, unknown>
      | undefined;
    const arrayItemSchema = itemsField?.["items"] as Record<string, unknown> | undefined;
    const amountSchema = (
      arrayItemSchema?.["properties"] as Record<string, unknown> | undefined
    )?.["amount"] as Record<string, unknown> | undefined;
    expect(amountSchema, "expected items[].amount override schema").toBeDefined();
    expect(amountSchema?.["decimalMinimum"]).toBe("0");
  });

  it("mid-path array — @minimum :orders.money.amount 0 on Account { orders: Order[] }", () => {
    // Array appears mid-path; traversal continues into the array element and
    // descends into its object structure without consuming a path segment.
    const source = [
      NAME_DECIMAL_DECL,
      "export interface MonetaryAmount { amount: Decimal; currency: string; }",
      "export interface Order { money: MonetaryAmount; orderId: string; }",
      "export interface Account { orders: Order[]; holder: string; }",
      "export interface Root {",
      "  /** @minimum :orders.money.amount 0 */",
      "  account: Account;",
      "}",
    ].join("\n");

    const result = runSchema(source, nameBasedConfig);
    const account = result.jsonSchema.properties?.["account"] as
      | Record<string, unknown>
      | undefined;
    const ordersField = (account?.["properties"] as Record<string, unknown> | undefined)?.[
      "orders"
    ] as Record<string, unknown> | undefined;
    const orderItem = ordersField?.["items"] as Record<string, unknown> | undefined;
    const money = (orderItem?.["properties"] as Record<string, unknown> | undefined)?.["money"] as
      | Record<string, unknown>
      | undefined;
    const amount = (money?.["properties"] as Record<string, unknown> | undefined)?.["amount"] as
      | Record<string, unknown>
      | undefined;
    expect(amount, "expected orders[].money.amount override").toBeDefined();
    expect(amount?.["decimalMinimum"]).toBe("0");
  });

  it("array of arrays — @minimum :matrix.amount 0 on Grid { matrix: MonetaryAmount[][] }", () => {
    // Double-array wrapping; each `items` level is traversed transparently.
    const source = [
      NAME_DECIMAL_DECL,
      "export interface MonetaryAmount { amount: Decimal; currency: string; }",
      "export interface Grid { matrix: MonetaryAmount[][]; label: string; }",
      "export interface Root {",
      "  /** @minimum :matrix.amount 0 */",
      "  grid: Grid;",
      "}",
    ].join("\n");

    const result = runSchema(source, nameBasedConfig);
    const grid = result.jsonSchema.properties?.["grid"] as Record<string, unknown> | undefined;
    const matrixField = (grid?.["properties"] as Record<string, unknown> | undefined)?.[
      "matrix"
    ] as Record<string, unknown> | undefined;
    const outerItems = matrixField?.["items"] as Record<string, unknown> | undefined;
    const innerItems = outerItems?.["items"] as Record<string, unknown> | undefined;
    const amount = (innerItems?.["properties"] as Record<string, unknown> | undefined)?.[
      "amount"
    ] as Record<string, unknown> | undefined;
    expect(amount, "expected matrix[][].amount override").toBeDefined();
    expect(amount?.["decimalMinimum"]).toBe("0");
  });
});

// =============================================================================
// MULTIPLE PATH-TARGETED TAGS ON THE SAME FIELD
// =============================================================================

describe("multiple path-targeted tags on the same field", () => {
  it("@minimum + @maximum + @multipleOf on the same :amount sub-path all broaden to distinct keywords", () => {
    // All three tags target `:amount` on the same MonetaryAmount field.
    // The constraint nodes are merged into a single `amount` sub-schema with
    // all three vocabulary keywords present simultaneously.
    // Post-fix: each tag broadens to its camelCase vocabulary keyword + string payload.
    const source = [
      NAME_DECIMAL_DECL,
      "export interface MonetaryAmount { amount: Decimal; currency: string; }",
      "export interface Root {",
      "  /**",
      "   * @minimum :amount 0",
      "   * @maximum :amount 1000000",
      "   * @multipleOf :amount 0.01",
      "   */",
      "  price: MonetaryAmount;",
      "}",
    ].join("\n");

    const result = runSchema(source, nameBasedConfig);
    const terminal = getTerminal(result, "price", "amount");
    expect(terminal, "expected amount sub-schema").toBeDefined();

    // All three vocabulary keywords must be present on the same sub-schema.
    expect(terminal?.["decimalMinimum"], "expected decimalMinimum: '0'").toBe("0");
    expect(terminal?.["decimalMaximum"], "expected decimalMaximum: '1000000'").toBe("1000000");
    expect(terminal?.["decimalMultipleOf"], "expected decimalMultipleOf: '0.01'").toBe("0.01");

    // No stray keywords at the root field level.
    const fieldSchema = result.jsonSchema.properties?.["price"] as
      | Record<string, unknown>
      | undefined;
    expect(
      fieldSchema?.["decimalMinimum"],
      "decimalMinimum must not leak to root field"
    ).toBeUndefined();
    expect(
      fieldSchema?.["decimalMaximum"],
      "decimalMaximum must not leak to root field"
    ).toBeUndefined();
    expect(
      fieldSchema?.["decimalMultipleOf"],
      "decimalMultipleOf must not leak to root field"
    ).toBeUndefined();
  });
});

// =============================================================================
// MULTIPLE SUB-PATHS ON THE SAME FIELD
// =============================================================================

describe("multiple sub-paths on the same field", () => {
  it("@minimum :amount 0 and @maxLength :currency 3 produce separate sub-schemas under the same field", () => {
    // `:amount` resolves to Decimal → broadens to decimalMinimum: "0".
    // `:currency` resolves to plain `string` (NOT broadened) → raw maxLength: 3.
    // Both must appear as separate entries in the field's `properties` override.
    const source = [
      NAME_DECIMAL_DECL,
      "export interface MonetaryAmount { amount: Decimal; currency: string; }",
      "export interface Root {",
      "  /**",
      "   * @minimum :amount 0",
      "   * @maxLength :currency 3",
      "   */",
      "  total: MonetaryAmount;",
      "}",
    ].join("\n");

    const result = runSchema(source, nameBasedConfig);

    // amount sub-schema: receives broadened decimalMinimum
    const amountTerminal = getTerminal(result, "total", "amount");
    expect(amountTerminal, "expected amount sub-schema").toBeDefined();
    // Post-fix: broadened keyword + string payload
    expect(amountTerminal?.["decimalMinimum"]).toBe("0");
    // Must NOT emit the raw built-in keyword
    expect(amountTerminal?.["minimum"]).toBeUndefined();

    // currency sub-schema: receives maxLength from direct string constraint
    const currencyTerminal = getTerminal(result, "total", "currency");
    expect(currencyTerminal, "expected currency sub-schema").toBeDefined();
    expect(currencyTerminal?.["maxLength"]).toBe(3);

    // Neither keyword should appear at the field level.
    const fieldSchema = result.jsonSchema.properties?.["total"] as
      | Record<string, unknown>
      | undefined;
    expect(fieldSchema?.["decimalMinimum"], "decimalMinimum must not appear at field level").toBeUndefined();
    expect(fieldSchema?.["minimum"], "minimum must not appear at field level").toBeUndefined();
    expect(fieldSchema?.["maxLength"], "maxLength must not appear at field level").toBeUndefined();
  });
});

// =============================================================================
// DIRECT + PATH ON THE SAME FIELD
// =============================================================================

describe("direct constraint + path-targeted constraints on the same field", () => {
  it("direct @minimum 0 + path @maximum :amount 9999 on a ref field — both keywords land at their correct locations", () => {
    // This variant: one direct non-path constraint + one path-targeted:
    //   class Root { /**
    //     * @maximum :amount 9999   (path on Decimal subfield → decimalMaximum: "9999")
    //     * @minimum :count 0       (path on plain number subfield → minimum: 0)
    //   */ payment: Payment }
    // Both produce sub-schemas under the Payment $ref's properties.
    const source = [
      NAME_DECIMAL_DECL,
      "export interface Payment { amount: Decimal; count: number; label: string; }",
      "export interface Root {",
      "  /**",
      "   * @maximum :amount 9999",
      "   * @minimum :count 0",
      "   */",
      "  payment: Payment;",
      "}",
    ].join("\n");

    const result = runSchema(source, nameBasedConfig);

    // amount sub-schema: @maximum :amount 9999 (broadened via Decimal → decimalMaximum: "9999")
    const amountTerminal = getTerminal(result, "payment", "amount");
    expect(amountTerminal, "expected amount sub-schema").toBeDefined();
    expect(amountTerminal?.["decimalMaximum"]).toBe("9999");
    // Raw built-in must NOT appear
    expect(amountTerminal?.["maximum"]).toBeUndefined();

    // count sub-schema: @minimum :count 0 (plain numeric, no broadening)
    const countTerminal = getTerminal(result, "payment", "count");
    expect(countTerminal, "expected count sub-schema").toBeDefined();
    expect(countTerminal?.["minimum"]).toBe(0);

    // No cross-contamination.
    expect(
      amountTerminal?.["decimalMinimum"],
      "decimalMinimum must not appear on amount"
    ).toBeUndefined();
    expect(countTerminal?.["decimalMaximum"], "decimalMaximum must not appear on count").toBeUndefined();
  });
});
