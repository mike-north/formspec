import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
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
 * @param {ts.Expression} expression
 * @returns {boolean}
 */
function isFlagsAccessExpression(expression) {
  const stripped = stripExpressionWrappers(expression);
  return ts.isPropertyAccessExpression(stripped) && stripped.name.text === "flags";
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
  /** @type {Finding[]} */
  const findings = [];
  const seenPositions = new Set();

  /**
   * @param {ts.Expression} expression
   * @returns {void}
   */
  function collectNumericMaskLiterals(expression) {
    const stripped = stripExpressionWrappers(expression);

    if (ts.isNumericLiteral(stripped)) {
      const position = stripped.getStart(sourceFile);
      if (!seenPositions.has(position)) {
        const location = sourceFile.getLineAndCharacterOfPosition(position);
        findings.push({
          filePath,
          line: location.line + 1,
          column: location.character + 1,
          literal: stripped.getText(sourceFile),
        });
        seenPositions.add(position);
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

const targets = process.argv.slice(2);
const scanTargets = targets.length === 0 ? DEFAULT_TARGETS : targets;
/** @type {Finding[]} */
const findings = [];

for (const target of scanTargets) {
  if (!existsSync(target)) {
    globalThis.console.error(`Error: Scan target does not exist: ${target}`);
    process.exit(2);
  }

  for (const filePath of walkSourceFiles(target)) {
    findings.push(...findMagicTypeFlagMasks(filePath));
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    const relativePath = path.relative(process.cwd(), finding.filePath);
    const location = [relativePath, String(finding.line), String(finding.column)].join(":");
    globalThis.console.error(
      `${location} Use a named TypeScript compiler flag enum member, such as ts.TypeFlags.String, instead of hardcoded numeric bitmasks (found ${finding.literal}).`
    );
  }
  process.exit(1);
}
