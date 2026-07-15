#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const DEFAULT_TARGETS = ["packages"];
const IGNORED_DIRECTORY_NAMES = new Set(["coverage", "dist", "node_modules", "temp"]);
const TYPE_SCRIPT_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

/**
 * @typedef {object} Finding
 * @property {string} filePath
 * @property {number} line
 * @property {number} column
 * @property {string} literal
 *
 * @typedef {object} CheckTypeFlagsMagicNumbersResult
 * @property {boolean} ok
 * @property {Finding[]} findings
 * @property {string} report
 */

/**
 * @param {string} entryPath
 * @returns {Iterable<string>}
 */
function* walkSourceFiles(entryPath) {
  const entryStat = statSync(entryPath);
  if (entryStat.isDirectory()) {
    if (IGNORED_DIRECTORY_NAMES.has(path.basename(entryPath))) {
      return;
    }

    for (const child of readdirSync(entryPath).sort()) {
      yield* walkSourceFiles(path.join(entryPath, child));
    }
    return;
  }

  if (isPackageSourceFile(entryPath)) {
    yield entryPath;
  }
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function isPackageSourceFile(filePath) {
  if (filePath.endsWith(".d.ts")) {
    return false;
  }

  if (!TYPE_SCRIPT_EXTENSIONS.some((extension) => filePath.endsWith(extension))) {
    return false;
  }

  const parts = path.resolve(filePath).split(path.sep);
  const packagesIndex = parts.lastIndexOf("packages");
  return packagesIndex >= 0 && parts[packagesIndex + 2] === "src";
}

/**
 * @param {ts.Expression} expression
 * @returns {ts.Expression}
 */
function stripExpressionWrappers(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/**
 * Matches `<expr>.flags` and `<expr>.getFlags()` alike — both surface a
 * TypeScript compiler flag bitmask (TypeFlags, SymbolFlags, ModifierFlags,
 * ObjectFlags, ...) regardless of which compiler entity `<expr>` refers to.
 * Detection is deliberately family-agnostic: the receiver name is not used to
 * distinguish `ts.TypeFlags` from `ts.SymbolFlags` etc., so the diagnostic
 * message must not assume a specific family either (see `formatReport`).
 *
 * @param {ts.Expression} expression
 * @returns {boolean}
 */
function isFlagsAccessExpression(expression) {
  const stripped = stripExpressionWrappers(expression);

  if (ts.isPropertyAccessExpression(stripped) && stripped.name.text === "flags") {
    return true;
  }

  return (
    ts.isCallExpression(stripped) &&
    ts.isPropertyAccessExpression(stripped.expression) &&
    stripped.expression.name.text === "getFlags"
  );
}

/**
 * Collects same-file `const NAME = <NumericLiteral>;` bindings so a magic
 * number reached through one level of indirection (`const NULL = 8; type.flags
 * & NULL`) is still caught. This is intentionally shallow: only a direct
 * numeric-literal initializer is resolved — no cross-file lookups and no
 * multi-hop data flow (e.g. `const NULL = ts.TypeFlags.Null;` or
 * `const A = 4; const B = A;` are not resolved), matching the checker's
 * stated non-goals.
 *
 * @param {ts.SourceFile} sourceFile
 * @returns {Map<string, string>}
 */
function collectConstNumericBindings(sourceFile) {
  /** @type {Map<string, string>} */
  const bindings = new Map();

  /**
   * @param {ts.Node} node
   * @returns {void}
   */
  function visit(node) {
    if (ts.isVariableStatement(node) && (node.declarationList.flags & ts.NodeFlags.Const) !== 0) {
      for (const declaration of node.declarationList.declarations) {
        if (declaration.initializer === undefined || !ts.isIdentifier(declaration.name)) {
          continue;
        }

        const initializer = stripExpressionWrappers(declaration.initializer);
        if (ts.isNumericLiteral(initializer)) {
          bindings.set(declaration.name.text, initializer.getText(sourceFile));
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return bindings;
}

/**
 * The guard parses TypeScript instead of grepping so examples in comments and
 * unrelated numeric comparisons such as `(type.flags & ts.TypeFlags.Null) !== 0`,
 * `type.flags & lookup(4)`, or `object.flags & value` do not trigger false
 * positives.
 *
 * @param {string} filePath
 * @returns {Finding[]}
 */
function findMagicTypeFlagMasks(filePath) {
  const sourceText = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const constBindings = collectConstNumericBindings(sourceFile);
  /** @type {Finding[]} */
  const findings = [];
  const seenPositions = new Set();

  /**
   * @param {ts.Node} node
   * @param {string} literalText
   * @returns {void}
   */
  function recordFinding(node, literalText) {
    const position = node.getStart(sourceFile);
    if (seenPositions.has(position)) {
      return;
    }
    seenPositions.add(position);

    const location = sourceFile.getLineAndCharacterOfPosition(position);
    findings.push({
      filePath,
      line: location.line + 1,
      column: location.character + 1,
      literal: literalText,
    });
  }

  /**
   * @param {ts.Expression} expression
   * @returns {void}
   */
  function collectNumericMaskLiterals(expression) {
    const stripped = stripExpressionWrappers(expression);

    if (ts.isNumericLiteral(stripped)) {
      recordFinding(stripped, stripped.getText(sourceFile));
      return;
    }

    if (ts.isIdentifier(stripped) && constBindings.has(stripped.text)) {
      const resolvedText = constBindings.get(stripped.text);
      if (resolvedText !== undefined) {
        recordFinding(stripped, resolvedText);
      }
      return;
    }

    if (ts.isBinaryExpression(stripped) && stripped.operatorToken.kind === ts.SyntaxKind.BarToken) {
      collectNumericMaskLiterals(stripped.left);
      collectNumericMaskLiterals(stripped.right);
    }
  }

  /**
   * @param {ts.Node} node
   * @returns {void}
   */
  function visit(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandToken) {
      if (isFlagsAccessExpression(node.left)) {
        collectNumericMaskLiterals(node.right);
      }
      if (isFlagsAccessExpression(node.right)) {
        collectNumericMaskLiterals(node.left);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

/**
 * @param {Finding[]} findings
 * @returns {string}
 */
function formatReport(findings) {
  if (findings.length === 0) {
    return "[check-typeflags-magic-numbers] No hardcoded compiler flag bitmasks found.";
  }

  // One line per finding, no summary header — the CLI prints this verbatim to
  // stderr, and downstream tooling (packages/eslint-plugin/tests/typeflags-guard.test.ts)
  // parses it line-by-line, so every non-empty line must match the per-finding format.
  return findings
    .map((finding) => {
      const relativePath = path.relative(process.cwd(), finding.filePath);
      const location = [relativePath, String(finding.line), String(finding.column)].join(":");
      // Deliberately flag-family-agnostic: detection matches any `.flags` /
      // `.getFlags()` receiver (TypeFlags, SymbolFlags, ModifierFlags,
      // ObjectFlags, ...), so the fix suggestion must not assume TypeFlags.
      return `${location} Use a named TypeScript compiler flag enum member (e.g. ts.TypeFlags.String, ts.SymbolFlags.Class, ts.ModifierFlags.Static) instead of hardcoded numeric bitmasks (found ${finding.literal}).`;
    })
    .join("\n");
}

/**
 * @param {{ targets?: string[] }} [options]
 * @returns {CheckTypeFlagsMagicNumbersResult}
 */
export function checkTypeFlagsMagicNumbers(options = {}) {
  const scanTargets = options.targets ?? DEFAULT_TARGETS;
  /** @type {Finding[]} */
  const findings = [];

  for (const target of scanTargets) {
    if (!existsSync(target)) {
      throw new Error(`Scan target does not exist: ${target}`);
    }

    for (const filePath of walkSourceFiles(target)) {
      findings.push(...findMagicTypeFlagMasks(filePath));
    }
  }

  return {
    ok: findings.length === 0,
    findings,
    report: formatReport(findings),
  };
}

const cliPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
const isCliEntry = cliPath === fileURLToPath(import.meta.url);

if (isCliEntry) {
  const targets = process.argv.slice(2);

  try {
    const result = checkTypeFlagsMagicNumbers({
      targets: targets.length === 0 ? undefined : targets,
    });
    if (!result.ok) {
      globalThis.console.error(result.report);
      process.exit(1);
    }
  } catch (error) {
    globalThis.console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}
