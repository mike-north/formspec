import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";
import { pathToFileURL } from "node:url";

const fixtureBuildRoot = path.join(os.tmpdir(), "formspec-cli-compiled-fixtures");
const dslModuleUrl = pathToFileURL(
  path.resolve(__dirname, "..", "..", "..", "dsl", "dist", "index.js")
).href;

export function ensureCompiledFixture(tsPath: string): string {
  fs.mkdirSync(fixtureBuildRoot, { recursive: true });

  const compiledPath = path.join(
    fixtureBuildRoot,
    `${path.basename(tsPath, ".ts")}-${createHash("sha1").update(tsPath).digest("hex")}.js`
  );

  if (fs.existsSync(compiledPath)) {
    return compiledPath;
  }

  const source = fs.readFileSync(tsPath, "utf-8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: tsPath,
  }).outputText;

  const rewritten = transpiled.replaceAll(
    /from\s+["']@formspec\/dsl["']/g,
    `from ${JSON.stringify(dslModuleUrl)}`
  );

  fs.writeFileSync(compiledPath, rewritten);
  return compiledPath;
}
