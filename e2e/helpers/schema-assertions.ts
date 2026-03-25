import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_ROOT = path.resolve(__dirname, "..");

/**
 * Assert that a schema is a valid FormSpec-generated JSON Schema object.
 * Currently validates 2020-12 structure.
 */
export function assertValidJsonSchema(schema: Record<string, unknown>): void {
  expect(schema).toHaveProperty("type", "object");
  expect(schema).toHaveProperty("properties");
}

/** @deprecated Use assertValidJsonSchema instead */
export const assertValidJsonSchema2020 = assertValidJsonSchema;

export function assertPropertyConstraints(
  schema: Record<string, unknown>,
  propName: string,
  expected: Record<string, unknown>
): void {
  const properties = schema["properties"] as Record<string, Record<string, unknown>> | undefined;
  expect(properties).toBeDefined();
  if (!properties) return;
  const prop = properties[propName];
  expect(prop).toBeDefined();
  if (!prop) return;
  for (const [key, value] of Object.entries(expected)) {
    expect(prop[key]).toEqual(value);
  }
}

export interface RunCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export function runCli(args: string[], opts?: { cwd?: string }): RunCliResult {
  const cliPath = resolveCliPath();
  try {
    const stdout = execFileSync("node", [cliPath, ...args], {
      encoding: "utf-8",
      cwd: opts?.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error) {
    const execError = error as {
      status: number | null;
      stdout: string | undefined;
      stderr: string | undefined;
    };
    return {
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      exitCode: execError.status ?? 1,
    };
  }
}

export function resolveFixture(...segments: string[]): string {
  return path.join(E2E_ROOT, "fixtures", ...segments);
}

export function resolveCliPath(): string {
  return path.resolve(E2E_ROOT, "..", "packages", "cli", "dist", "index.js");
}

export function resolveBuildCliPath(): string {
  return path.resolve(E2E_ROOT, "..", "packages", "build", "dist", "cli.js");
}

/**
 * Traverse nested `properties` by dot-separated path and assert expected shape.
 * E.g., `assertNestedProperty(schema, "customer.address.street", { type: "string" })`
 */
export function assertNestedProperty(
  schema: Record<string, unknown>,
  dotPath: string,
  expected: Record<string, unknown>
): void {
  const segments = dotPath.split(".");
  let current: Record<string, unknown> = schema;

  for (const segment of segments) {
    const properties = current["properties"] as Record<string, Record<string, unknown>> | undefined;
    expect(
      properties,
      `Missing "properties" at segment "${segment}" in path "${dotPath}"`
    ).toBeDefined();
    if (!properties) return;
    const next = properties[segment];
    expect(next, `Missing property "${segment}" in path "${dotPath}"`).toBeDefined();
    if (!next) return;
    current = next;
  }

  for (const [key, value] of Object.entries(expected)) {
    expect(current[key]).toEqual(value);
  }
}

/**
 * Recursively find a file matching a suffix in a directory.
 * Extracted from individual test files into shared helper.
 */
export function findSchemaFile(dir: string, suffix: string): string | undefined {
  if (!fs.existsSync(dir)) return undefined;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findSchemaFile(fullPath, suffix);
      if (found) return found;
    } else if (entry.name === suffix) {
      return fullPath;
    }
  }
  return undefined;
}

/**
 * Assert a UI Schema element at a given scope has the expected rule.
 * Searches recursively through elements/groups.
 */
export function assertUiSchemaRule(
  uiSchema: Record<string, unknown>,
  fieldScope: string,
  expectedEffect: string,
  expectedCondition: { scope: string; schema: Record<string, unknown> }
): void {
  const element = findUiElement(uiSchema, fieldScope);
  expect(element, `UI element with scope "${fieldScope}" not found`).toBeDefined();
  if (!element) return;

  const rule = element["rule"] as Record<string, unknown> | undefined;
  expect(rule, `UI element "${fieldScope}" has no rule`).toBeDefined();
  if (!rule) return;

  expect(rule["effect"]).toBe(expectedEffect);
  expect(rule["condition"]).toEqual(expectedCondition);
}

/** Recursively search UI Schema elements for a Control with the given scope. */
export function findUiElement(
  node: Record<string, unknown>,
  scope: string
): Record<string, unknown> | undefined {
  if (node["scope"] === scope) return node;
  const elements = node["elements"] as Record<string, unknown>[] | undefined;
  if (!elements) return undefined;
  for (const el of elements) {
    const found = findUiElement(el, scope);
    if (found) return found;
  }
  return undefined;
}
