/**
 * Browser-based ESLint linting for FormSpec code.
 *
 * Uses the real @formspec/eslint-plugin rules to validate code
 * against constraints in the browser.
 */

import { Linter } from "eslint/universal";
import * as tsParser from "@typescript-eslint/parser";
import formspecPlugin from "@formspec/eslint-plugin";
import type { ConstraintsConfig } from "../components/Constraints";

type RulesRecord = Record<string, Linter.RuleEntry>;

/**
 * Minimal type for ESLint rule modules.
 * We define this inline to avoid importing from "eslint" which pulls in Node.js modules.
 */
interface RuleModule {
  create: (context: unknown) => Record<string, (node: unknown) => void>;
  meta?: {
    type?: string;
    docs?: { description?: string };
    messages?: Record<string, string>;
    schema?: unknown[];
  };
}

/**
 * Represents a lint diagnostic message from ESLint.
 * Contains location information for displaying in Monaco editor markers.
 */
export interface LintMessage {
  /** The human-readable error or warning message */
  message: string;
  /** Line number (1-indexed) where the issue occurs */
  line: number;
  /** Column number (1-indexed) where the issue starts */
  column: number;
  /** Severity level of the diagnostic */
  severity: "error" | "warning";
  /** The ESLint rule ID that generated this message, or null for parser errors */
  ruleId: string | null;
}

/**
 * Converts UI constraint config to ESLint rule options.
 */
function constraintsToFieldTypeOptions(config: ConstraintsConfig): Record<string, "error" | "off"> {
  return {
    text: config.fieldTypes.text ? "off" : "error",
    number: config.fieldTypes.number ? "off" : "error",
    boolean: config.fieldTypes.boolean ? "off" : "error",
    staticEnum: config.fieldTypes.enum ? "off" : "error",
    dynamicEnum: config.fieldTypes.dynamicEnum ? "off" : "error",
    dynamicSchema: config.fieldTypes.dynamicSchema ? "off" : "error",
    array: config.fieldTypes.array ? "off" : "error",
    object: config.fieldTypes.object ? "off" : "error",
  };
}

function constraintsToLayoutOptions(config: ConstraintsConfig): Record<string, unknown> {
  return {
    group: config.layout.group ? "off" : "error",
    conditionals: config.layout.when ? "off" : "error",
    maxNestingDepth: config.layout.maxNestingDepth,
  };
}

/**
 * Lints FormSpec code using real ESLint rules from @formspec/eslint-plugin.
 *
 * This function runs the actual ESLint constraint rules in the browser,
 * providing real validation feedback based on the configured constraints.
 *
 * @param code - The FormSpec TypeScript code to lint
 * @param constraints - The constraint configuration from the UI
 * @returns Array of lint messages with line/column information
 */
export function lintFormSpec(code: string, constraints: ConstraintsConfig): LintMessage[] {
  // Get the constraint rules from the plugin
  const fieldTypesRule = formspecPlugin.rules["constraints-allowed-field-types"];
  const layoutsRule = formspecPlugin.rules["constraints-allowed-layouts"];

  // Build rule config based on constraints
  const fieldTypeOptions = constraintsToFieldTypeOptions(constraints);
  const layoutOptions = constraintsToLayoutOptions(constraints);

  // Check if any field types are actually restricted
  const hasFieldTypeRestrictions = Object.values(fieldTypeOptions).some(v => v === "error");
  const hasLayoutRestrictions = layoutOptions.group === "error" || layoutOptions.conditionals === "error";

  // If no restrictions, return empty
  if (!hasFieldTypeRestrictions && !hasLayoutRestrictions) {
    return [];
  }

  // Build rules config with the plugin inline (ESLint 9 flat config style)
  // In flat config, we must provide rules via the plugins property, not defineRule()
  const rules: RulesRecord = {};
  const pluginRules: Record<string, RuleModule> = {};

  if (hasFieldTypeRestrictions) {
    pluginRules["constraints-allowed-field-types"] = fieldTypesRule as unknown as RuleModule;
    rules["@formspec/constraints-allowed-field-types"] = ["error", fieldTypeOptions];
  }
  if (hasLayoutRestrictions) {
    pluginRules["constraints-allowed-layouts"] = layoutsRule as unknown as RuleModule;
    rules["@formspec/constraints-allowed-layouts"] = ["error", layoutOptions];
  }

  // Create linter instance
  const linter = new Linter();

  // Run the linter with flat config
  // Wrap in try/catch to handle parser errors gracefully - if parsing fails,
  // the TypeScript compiler will catch it during compilation anyway
  try {
    // Build config object - we use type assertion because ESLint's types
    // don't fully capture the flat config structure for in-memory plugins
    const config = {
      // In flat config, files pattern determines which files this config applies to
      files: ["**/*.ts", "**/*.tsx"],
      plugins: {
        "@formspec": {
          rules: pluginRules,
        },
      },
      languageOptions: {
        parser: tsParser as Linter.Parser,
        parserOptions: {
          ecmaVersion: "latest" as const,
          sourceType: "module" as const,
        },
      },
      rules,
    } as Linter.Config;

    const messages = linter.verify(
      code,
      config,
      { filename: "form.ts" }
    );

    return messages.map((msg: Linter.LintMessage): LintMessage => ({
      message: msg.message,
      line: msg.line,
      column: msg.column,
      severity: msg.severity === 2 ? "error" : "warning",
      ruleId: msg.ruleId,
    }));
  } catch (_error) {
    // Parser failed - likely invalid syntax. The TypeScript compiler
    // will catch and report syntax errors during compilation, so we
    // just return empty and let that handle it.
    return [];
  }
}
