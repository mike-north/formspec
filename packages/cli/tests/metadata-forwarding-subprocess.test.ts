/**
 * CLI-level regression test for issue #522: `config.metadata` (the
 * apiName/displayName/pluralization naming-inference policy) was silently
 * dropped for chain-DSL exports, so two forms in the same project produced
 * differently-inferred names based purely on authoring surface — violating
 * PP5 (two surfaces, one semantic model) and PP11 (consumer-controlled
 * naming inference) from docs/000-principles.md.
 *
 * Writing this test against the full CLI path (rather than calling
 * `loadFormSpecs`/`generateClassSchemas` directly) surfaced that the gap was
 * actually on *both* sides of `src/index.ts`: the runtime loader options for
 * chain-DSL exports had no `metadata` field at all, and the `schemaOptions`
 * object built for class-based generation passed `config: effectiveConfig`
 * to `generateClassSchemas`/`generateMethodSchemas` — lower-level generators
 * that (unlike `config`-aware entry points such as `generateSchemas`) never
 * read `.config`, only a flattened `metadata` field. So class-based
 * generation was silently dropping the policy too, despite the config being
 * "passed through".
 *
 * This exercises `formspec.config.ts` discovery, `resolveConfigForFile`, and
 * both generation surfaces end to end, so a future regression in how either
 * wiring path in `src/index.ts` forwards `effectiveConfig.metadata` would be
 * caught even if the underlying generators still accepted the option
 * correctly.
 */
import { afterAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const packageDir = path.resolve(__dirname, "..");
const cliPath = path.join(packageDir, "dist", "index.js");
const tempRoot = path.join(os.tmpdir(), "formspec-cli-metadata-forwarding-test");
const dslModuleUrl = pathToFileURL(path.resolve(packageDir, "..", "dsl", "dist", "index.js")).href;

function createTempDir(prefix: string): string {
  fs.mkdirSync(tempRoot, { recursive: true });
  return fs.mkdtempSync(path.join(tempRoot, prefix));
}

// The CLI binary (dist/index.js) is built once by tests/global-setup.ts
// before any test file runs, so this suite doesn't need to build it itself.
function runCli(args: string[], cwd: string): { output: string; status: number } {
  const result = spawnSync("node", [cliPath, ...args], {
    cwd,
    encoding: "utf-8",
  });

  const output = `${result.stdout}\n${result.stderr}`;
  return {
    output,
    status: result.status ?? 1,
  };
}

interface GeneratedProperty {
  readonly type?: string;
  readonly title?: string;
}

interface GeneratedSchema {
  readonly properties?: Readonly<Record<string, GeneratedProperty>>;
}

function readSchema(filePath: string): GeneratedSchema {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as GeneratedSchema;
}

describe("config.metadata forwarding (issue #522)", () => {
  afterAll(() => {
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("infers identical field titles for a class and a chain-DSL export under the same custom metadata policy", () => {
    const dir = createTempDir("naming-parity-");

    // A displayName policy that's easy to distinguish from FormSpec's
    // built-in behavior (no policy configured leaves displayName
    // unresolved — see packages/build/src/metadata/policy.ts).
    fs.writeFileSync(
      path.join(dir, "formspec.config.ts"),
      [
        'import { defineFormSpecConfig } from "@formspec/config";',
        "",
        "export default defineFormSpecConfig({",
        "  metadata: {",
        "    field: {",
        "      displayName: {",
        '        mode: "infer-if-missing",',
        "        infer: ({ logicalName }) => `Custom ${logicalName}`,",
        "      },",
        "    },",
        "  },",
        "});",
        "",
      ].join("\n")
    );

    const tsPath = path.join(dir, "widget.ts");
    const jsPath = path.join(dir, "widget.js");

    // Chain-DSL export and class both declare an equivalent `widgetName`
    // field, neither with an explicit label/title, so the only source of a
    // `title` in the generated schema is the config's metadata policy.
    fs.writeFileSync(
      tsPath,
      [
        'import { formspec, field } from "@formspec/dsl";',
        "",
        'export const WidgetForm = formspec(field.text("widgetName", { required: true }));',
        "",
        "export class WidgetProfile {",
        "  widgetName!: string;",
        "}",
        "",
      ].join("\n")
    );
    fs.writeFileSync(
      jsPath,
      [
        `import { formspec, field } from ${JSON.stringify(dslModuleUrl)};`,
        "",
        'export const WidgetForm = formspec(field.text("widgetName", { required: true }));',
        "",
        "export class WidgetProfile {}",
        "",
      ].join("\n")
    );

    const outDir = path.join(dir, "generated");

    // Chain-DSL: no class name argument, so only the FormSpec export is
    // generated.
    const chainResult = runCli(["generate", tsPath, "-o", outDir], dir);
    expect(chainResult.status).toBe(0);
    const chainSchema = readSchema(path.join(outDir, "formspecs", "WidgetForm", "schema.json"));

    // Class-based: explicit class name argument.
    const classResult = runCli(["generate", tsPath, "WidgetProfile", "-o", outDir], dir);
    expect(classResult.status).toBe(0);
    const classSchema = readSchema(path.join(outDir, "WidgetProfile", "schema.json"));

    // Both authoring surfaces must produce identical inferred titles under
    // the same metadata policy. Before the fix, `chainSchema` had no title
    // at all (metadata was dropped for chain-DSL), while `classSchema`
    // already had one — this assertion pins the fix in place.
    expect(chainSchema.properties?.["widgetName"]?.title).toBe("Custom widgetName");
    expect(classSchema.properties?.["widgetName"]?.title).toBe("Custom widgetName");
  });
});
