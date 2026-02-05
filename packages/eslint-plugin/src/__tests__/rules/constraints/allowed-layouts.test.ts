/**
 * Tests for constraints/allowed-layouts rule.
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { allowedLayouts } from "../../../rules/constraints/allowed-layouts.js";
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

ruleTester.run("constraints-allowed-layouts", allowedLayouts, {
  valid: [
    // All layouts allowed by default (no constraints)
    {
      code: `
        function group(label: string, ...elements: unknown[]) {
          return { label, elements };
        }
        function when(predicate: unknown, ...elements: unknown[]) {
          return { predicate, elements };
        }
        group("Contact", { name: "name" });
        when({ field: "type", value: "business" }, { name: "company" });
      `,
    },
    // Layouts allowed when explicitly set to "off"
    {
      code: `
        function group(label: string, ...elements: unknown[]) {
          return { label, elements };
        }
        group("Contact", { name: "name" });
      `,
      options: [{ group: "off" }],
    },
    // Non-group/when function calls should be ignored
    {
      code: `
        function myGroup(items: unknown[]) { return items; }
        function myWhen(condition: boolean) { return condition; }
        myGroup([1, 2, 3]);
        myWhen(true);
      `,
      options: [{ group: "error", conditionals: "error" }],
    },
    // Method calls with same names should be ignored
    {
      code: `
        const obj = {
          group: (label: string) => ({ label }),
          when: (predicate: unknown) => ({ predicate }),
        };
        obj.group("Contact");
        obj.when({ field: "type" });
      `,
      options: [{ group: "error", conditionals: "error" }],
    },
  ],
  invalid: [
    // group() disallowed
    {
      code: `
        function group(label: string, ...elements: unknown[]) {
          return { label, elements };
        }
        group("Contact", { name: "name" });
      `,
      options: [{ group: "error" }],
      errors: [{ messageId: "disallowedGroup" }],
    },
    // when() disallowed
    {
      code: `
        function when(predicate: unknown, ...elements: unknown[]) {
          return { predicate, elements };
        }
        when({ field: "type", value: "business" }, { name: "company" });
      `,
      options: [{ conditionals: "error" }],
      errors: [{ messageId: "disallowedConditional" }],
    },
    // Multiple group() calls
    {
      code: `
        function group(label: string, ...elements: unknown[]) {
          return { label, elements };
        }
        group("Contact", { name: "name" });
        group("Address", { name: "street" });
      `,
      options: [{ group: "error" }],
      errors: [
        { messageId: "disallowedGroup" },
        { messageId: "disallowedGroup" },
      ],
    },
    // Both group() and when() disallowed
    {
      code: `
        function group(label: string, ...elements: unknown[]) {
          return { label, elements };
        }
        function when(predicate: unknown, ...elements: unknown[]) {
          return { predicate, elements };
        }
        group("Contact", { name: "name" });
        when({ field: "type" }, { name: "company" });
      `,
      options: [{ group: "error", conditionals: "error" }],
      errors: [
        { messageId: "disallowedGroup" },
        { messageId: "disallowedConditional" },
      ],
    },
    // Nested group() calls
    {
      code: `
        function group(label: string, ...elements: unknown[]) {
          return { label, elements };
        }
        group("Outer", group("Inner", { name: "field" }));
      `,
      options: [{ group: "error" }],
      errors: [
        { messageId: "disallowedGroup" },
        { messageId: "disallowedGroup" },
      ],
    },
  ],
});
