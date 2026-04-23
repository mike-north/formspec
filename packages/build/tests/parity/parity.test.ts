/**
 * Parity tests.
 *
 * Proves that both authoring surfaces (chain DSL and TSDoc/class annotations)
 * produce identical intermediate representations (IR) for equivalent shared
 * form constructs, modulo provenance metadata.
 *
 * TSDoc-only helper types that the chain DSL cannot express directly, such as
 * constrained primitive aliases, are normalized to their effective field
 * semantics before parity comparison.
 *
 * Three-test pattern per fixture:
 *   1. Chain DSL → IR matches expected IR
 *   2. TSDoc class → IR matches expected IR
 *   3. Chain DSL IR === TSDoc IR (modulo provenance)
 */

import { describe, it, expect } from "vitest";
import * as nodePath from "node:path";

import { canonicalizeChainDSL, canonicalizeTSDoc } from "../../src/canonicalize/index.js";
import { createProgramContext, findClassByName } from "../../src/analyzer/program.js";
import { analyzeClassToIR } from "../../src/analyzer/class-analyzer.js";

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

interface ParityFixture {
  readonly name: string;
  readonly chainForm: Parameters<typeof canonicalizeChainDSL>[0];
  readonly expectedIR: ReturnType<typeof stripProvenance>;
  readonly className: string;
}

const parityFixtures: readonly ParityFixture[] = [
  {
    name: "address",
    chainForm: addressForm,
    expectedIR: addressExpected,
    className: "AddressForm",
  },
  {
    name: "user-registration",
    chainForm: userRegistrationForm,
    expectedIR: userRegistrationExpected,
    className: "UserRegistrationForm",
  },
  {
    name: "product-config",
    chainForm: productConfigForm,
    expectedIR: productConfigExpected,
    className: "ProductConfigForm",
  },
  {
    name: "plan-status",
    chainForm: planStatusForm,
    expectedIR: planStatusExpected,
    className: "SubscriptionForm",
  },
  {
    name: "usd-cents",
    chainForm: usdCentsForm,
    expectedIR: usdCentsExpected,
    className: "LineItemForm",
  },
] as const;

for (const fixture of parityFixtures) {
  describe(`${fixture.name} parity`, () => {
    it("chain DSL produces expected IR", () => {
      const ir = canonicalizeChainDSL(fixture.chainForm);
      const actual = stripProvenance(ir);

      expect(actual).toEqual(fixture.expectedIR);
    });

    it("TSDoc produces expected IR", () => {
      const fixturePath = nodePath.join(fixturesDir, fixture.name, "tsdoc.ts");
      const ir = canonicalizeFixtureClass(fixturePath, fixture.className);
      const actual = stripProvenance(ir);

      expect(actual).toEqual(fixture.expectedIR);
    });

    it("both surfaces produce identical IR", () => {
      const chainIR = canonicalizeChainDSL(fixture.chainForm);
      const fixturePath = nodePath.join(fixturesDir, fixture.name, "tsdoc.ts");
      const tsdocIR = canonicalizeFixtureClass(fixturePath, fixture.className);

      const differences = compareIR(chainIR, tsdocIR);
      expect(differences).toEqual([]);
    });
  });
}

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
