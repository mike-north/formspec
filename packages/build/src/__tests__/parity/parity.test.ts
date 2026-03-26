/**
 * Parity tests.
 *
 * Proves that both authoring surfaces (chain DSL and TSDoc/class annotations)
 * produce identical intermediate representations (IR) for equivalent form
 * definitions, modulo provenance metadata.
 *
 * Three-test pattern per fixture:
 *   1. Chain DSL → IR matches expected IR
 *   2. TSDoc class → IR matches expected IR
 *   3. Chain DSL IR === TSDoc IR (modulo provenance)
 */

import { describe, it, expect } from "vitest";
import * as nodePath from "node:path";

import { canonicalizeChainDSL, canonicalizeTSDoc } from "../../canonicalize/index.js";
import { createProgramContext, findClassByName } from "../../analyzer/program.js";
import { analyzeClassToIR } from "../../analyzer/class-analyzer.js";

import { stripProvenance, compareIR } from "./utils.js";

import { field as dslField, formspec as dslFormspec } from "@formspec/dsl";

// Fixtures — chain DSL forms
import { addressForm } from "./fixtures/address/chain-dsl.js";
import { userRegistrationForm } from "./fixtures/user-registration/chain-dsl.js";
import { productConfigForm } from "./fixtures/product-config/chain-dsl.js";
import { planStatusForm } from "./fixtures/plan-status/chain-dsl.js";
import { usdCentsForm } from "./fixtures/usd-cents/chain-dsl.js";

// Fixtures — expected IRs
import { expectedIR as addressExpected } from "./fixtures/address/expected-ir.js";
import { expectedIR as userRegistrationExpected } from "./fixtures/user-registration/expected-ir.js";
import { expectedIR as productConfigExpected } from "./fixtures/product-config/expected-ir.js";
import { expectedIR as planStatusExpected } from "./fixtures/plan-status/expected-ir.js";
import { expectedIR as usdCentsExpected } from "./fixtures/usd-cents/expected-ir.js";

// Base directory for TSDoc fixture files
const fixturesDir = nodePath.join(import.meta.dirname, "fixtures");

// =============================================================================
// Helpers
// =============================================================================

/**
 * Canonicalizes a named class from a TSDoc fixture file into a `FormIR`.
 *
 * Uses `createProgramContext` to build a TypeScript program from the fixture
 * file, then `analyzeClassToIR` to extract IR fields from the class
 * declaration, then `canonicalizeTSDoc` to wrap them into a `FormIR`.
 */
function canonicalizeFixtureClass(fixtureFile: string, className: string) {
  const ctx = createProgramContext(fixtureFile);
  const classDecl = findClassByName(ctx.sourceFile, className);
  if (!classDecl) {
    throw new Error(`Class "${className}" not found in fixture: ${fixtureFile}`);
  }
  const analysis = analyzeClassToIR(classDecl, ctx.checker, fixtureFile);
  return canonicalizeTSDoc(analysis, { file: fixtureFile });
}

// =============================================================================
// address parity
// =============================================================================

describe("address parity", () => {
  it("chain DSL produces expected IR", () => {
    const ir = canonicalizeChainDSL(addressForm);
    const actual = stripProvenance(ir);

    expect(actual).toEqual(addressExpected);
  });

  it("TSDoc produces expected IR", () => {
    const fixturePath = nodePath.join(fixturesDir, "address", "tsdoc.ts");
    const ir = canonicalizeFixtureClass(fixturePath, "AddressForm");
    const actual = stripProvenance(ir);

    expect(actual).toEqual(addressExpected);
  });

  it("both surfaces produce identical IR", () => {
    const chainIR = canonicalizeChainDSL(addressForm);

    const fixturePath = nodePath.join(fixturesDir, "address", "tsdoc.ts");
    const tsdocIR = canonicalizeFixtureClass(fixturePath, "AddressForm");

    const differences = compareIR(chainIR, tsdocIR);
    expect(differences).toEqual([]);
  });
});

// =============================================================================
// user-registration parity
// =============================================================================

describe("user-registration parity", () => {
  it("chain DSL produces expected IR", () => {
    const ir = canonicalizeChainDSL(userRegistrationForm);
    const actual = stripProvenance(ir);

    expect(actual).toEqual(userRegistrationExpected);
  });

  it("TSDoc produces expected IR", () => {
    const fixturePath = nodePath.join(fixturesDir, "user-registration", "tsdoc.ts");
    const ir = canonicalizeFixtureClass(fixturePath, "UserRegistrationForm");
    const actual = stripProvenance(ir);

    expect(actual).toEqual(userRegistrationExpected);
  });

  it("both surfaces produce identical IR", () => {
    const chainIR = canonicalizeChainDSL(userRegistrationForm);

    const fixturePath = nodePath.join(fixturesDir, "user-registration", "tsdoc.ts");
    const tsdocIR = canonicalizeFixtureClass(fixturePath, "UserRegistrationForm");

    const differences = compareIR(chainIR, tsdocIR);
    expect(differences).toEqual([]);
  });
});

// =============================================================================
// product-config parity
// =============================================================================

describe("product-config parity", () => {
  it("chain DSL produces expected IR", () => {
    const ir = canonicalizeChainDSL(productConfigForm);
    const actual = stripProvenance(ir);

    expect(actual).toEqual(productConfigExpected);
  });

  it("TSDoc produces expected IR", () => {
    const fixturePath = nodePath.join(fixturesDir, "product-config", "tsdoc.ts");
    const ir = canonicalizeFixtureClass(fixturePath, "ProductConfigForm");
    const actual = stripProvenance(ir);

    expect(actual).toEqual(productConfigExpected);
  });

  it("both surfaces produce identical IR", () => {
    const chainIR = canonicalizeChainDSL(productConfigForm);

    const fixturePath = nodePath.join(fixturesDir, "product-config", "tsdoc.ts");
    const tsdocIR = canonicalizeFixtureClass(fixturePath, "ProductConfigForm");

    const differences = compareIR(chainIR, tsdocIR);
    expect(differences).toEqual([]);
  });
});

// =============================================================================
// plan-status parity
// =============================================================================

describe("plan-status parity", () => {
  it("chain DSL produces expected IR", () => {
    const ir = canonicalizeChainDSL(planStatusForm);
    const actual = stripProvenance(ir);

    expect(actual).toEqual(planStatusExpected);
  });

  it("TSDoc produces expected IR", () => {
    const fixturePath = nodePath.join(fixturesDir, "plan-status", "tsdoc.ts");
    const ir = canonicalizeFixtureClass(fixturePath, "SubscriptionForm");
    const actual = stripProvenance(ir);

    expect(actual).toEqual(planStatusExpected);
  });

  it("both surfaces produce identical IR", () => {
    const chainIR = canonicalizeChainDSL(planStatusForm);

    const fixturePath = nodePath.join(fixturesDir, "plan-status", "tsdoc.ts");
    const tsdocIR = canonicalizeFixtureClass(fixturePath, "SubscriptionForm");

    const differences = compareIR(chainIR, tsdocIR);
    expect(differences).toEqual([]);
  });
});

// =============================================================================
// usd-cents parity
// =============================================================================

describe("usd-cents parity", () => {
  it("chain DSL produces expected IR", () => {
    const ir = canonicalizeChainDSL(usdCentsForm);
    const actual = stripProvenance(ir);

    expect(actual).toEqual(usdCentsExpected);
  });

  it("TSDoc produces expected IR", () => {
    const fixturePath = nodePath.join(fixturesDir, "usd-cents", "tsdoc.ts");
    const ir = canonicalizeFixtureClass(fixturePath, "LineItemForm");
    const actual = stripProvenance(ir);

    expect(actual).toEqual(usdCentsExpected);
  });

  it("both surfaces produce identical IR", () => {
    const chainIR = canonicalizeChainDSL(usdCentsForm);

    const fixturePath = nodePath.join(fixturesDir, "usd-cents", "tsdoc.ts");
    const tsdocIR = canonicalizeFixtureClass(fixturePath, "LineItemForm");

    const differences = compareIR(chainIR, tsdocIR);
    expect(differences).toEqual([]);
  });
});

// =============================================================================
// compareIR utility tests
// =============================================================================

describe("compareIR utility", () => {
  it("returns empty array for identical IRs", () => {
    const ir = canonicalizeChainDSL(addressForm);
    const differences = compareIR(ir, ir);
    expect(differences).toEqual([]);
  });

  it("returns differences when IRs diverge", () => {
    const formA = dslFormspec(dslField.text("name", { required: true }));
    const formB = dslFormspec(dslField.text("name", { required: false }));

    const irA = canonicalizeChainDSL(formA);
    const irB = canonicalizeChainDSL(formB);

    const differences = compareIR(irA, irB);
    expect(differences.length).toBeGreaterThan(0);
    // The `required` field on the first element should differ
    const requiredDiff = differences.find((d) => d.path.includes("required"));
    expect(requiredDiff).toBeDefined();
  });
});
