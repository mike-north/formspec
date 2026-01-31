/**
 * Tests for min-max-valid-range rule.
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { minMaxValidRange } from "../../rules/min-max-valid-range.js";
import * as vitest from "vitest";

RuleTester.afterAll = vitest.afterAll;
RuleTester.it = vitest.it;
RuleTester.itOnly = vitest.it.only;
RuleTester.describe = vitest.describe;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ["*.ts"],
      },
    },
  },
});

ruleTester.run("min-max-valid-range", minMaxValidRange, {
  valid: [
    // @Min < @Max
    {
      code: `
        function Min(n: number) { return () => {}; }
        function Max(n: number) { return () => {}; }
        class Form {
          @Min(0)
          @Max(100)
          value!: number;
        }
      `,
    },
    // @Min == @Max (equal is valid)
    {
      code: `
        function Min(n: number) { return () => {}; }
        function Max(n: number) { return () => {}; }
        class Form {
          @Min(50)
          @Max(50)
          value!: number;
        }
      `,
    },
    // @MinItems < @MaxItems
    {
      code: `
        function MinItems(n: number) { return () => {}; }
        function MaxItems(n: number) { return () => {}; }
        class Form {
          @MinItems(1)
          @MaxItems(10)
          items!: string[];
        }
      `,
    },
    // Only @Min (no @Max)
    {
      code: `
        function Min(n: number) { return () => {}; }
        class Form {
          @Min(0)
          value!: number;
        }
      `,
    },
    // Only @Max (no @Min)
    {
      code: `
        function Max(n: number) { return () => {}; }
        class Form {
          @Max(100)
          value!: number;
        }
      `,
    },
  ],
  invalid: [
    // @Min > @Max
    {
      code: `
        function Min(n: number) { return () => {}; }
        function Max(n: number) { return () => {}; }
        class Form {
          @Min(100)
          @Max(50)
          value!: number;
        }
      `,
      errors: [{ messageId: "minGreaterThanMax" }],
    },
    // @MinItems > @MaxItems
    {
      code: `
        function MinItems(n: number) { return () => {}; }
        function MaxItems(n: number) { return () => {}; }
        class Form {
          @MinItems(10)
          @MaxItems(5)
          items!: string[];
        }
      `,
      errors: [{ messageId: "minItemsGreaterThanMaxItems" }],
    },
  ],
});
