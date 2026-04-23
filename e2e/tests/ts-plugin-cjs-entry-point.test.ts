import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface CjsEntryPointReport {
  readonly type: string;
  readonly name: string;
  readonly initSame: boolean;
  readonly types: Record<string, string>;
}

/**
 * Verifies that the CJS entry point (`index.cjs`) exposes the full public API
 * surface alongside the callable `init` function.
 *
 * `tsserver` loads the plugin via `require("@formspec/ts-plugin")` and calls
 * the result directly as `init(modules)`. The hybrid `Object.assign(plugin, api)`
 * pattern preserves that contract while also making named exports available for
 * downstream CJS consumers that destructure the module.
 */
describe("@formspec/ts-plugin CJS entry point surface", () => {
  const entryPath = path.join(repoRoot, "packages/ts-plugin/index.cjs");

  const script = `
    const m = require(${JSON.stringify(entryPath)});
    console.log(JSON.stringify({
      type: typeof m,
      name: m.name,
      initSame: m.init === m,
      types: {
        FormSpecPluginService: typeof m.FormSpecPluginService,
        FormSpecSemanticService: typeof m.FormSpecSemanticService,
        createLanguageServiceProxy: typeof m.createLanguageServiceProxy,
        FORMSPEC_ANALYSIS_PROTOCOL_VERSION: typeof m.FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
        FORMSPEC_ANALYSIS_SCHEMA_VERSION: typeof m.FORMSPEC_ANALYSIS_SCHEMA_VERSION,
      },
    }));
  `;

  let report: CjsEntryPointReport;

  beforeAll(async () => {
    const { stdout } = await execFileAsync(process.execPath, ["-e", script], {
      cwd: repoRoot,
    });
    report = JSON.parse(stdout.trim()) as CjsEntryPointReport;
  });

  it("default export is a callable function (tsserver backwards compat)", () => {
    expect(report.type).toBe("function");
  });

  it("preserves the init function name", () => {
    expect(report.name).toBe("init");
  });

  it("init property is the same reference as the default export", () => {
    expect(report.initSame).toBe(true);
  });

  it("exposes FormSpecPluginService class", () => {
    expect(report.types.FormSpecPluginService).toBe("function");
  });

  it("exposes FormSpecSemanticService class", () => {
    expect(report.types.FormSpecSemanticService).toBe("function");
  });

  it("exposes createLanguageServiceProxy function", () => {
    expect(report.types.createLanguageServiceProxy).toBe("function");
  });

  it("exposes FORMSPEC_ANALYSIS_PROTOCOL_VERSION constant", () => {
    expect(report.types.FORMSPEC_ANALYSIS_PROTOCOL_VERSION).toBe("number");
  });

  it("exposes FORMSPEC_ANALYSIS_SCHEMA_VERSION constant", () => {
    expect(report.types.FORMSPEC_ANALYSIS_SCHEMA_VERSION).toBe("number");
  });
});
