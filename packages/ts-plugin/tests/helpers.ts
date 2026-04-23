import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as ts from "typescript";
import { expect } from "vitest";
import type { FormSpecPluginService } from "../src/service.js";

export const FORM_SPEC_PLUGIN_TEST_SOCKET_TIMEOUT_MS = 1_000;

interface TestProgramContext {
  readonly workspaceRoot: string;
  readonly filePath: string;
  readonly program: ts.Program;
}

export async function createProgramContext(sourceText: string): Promise<TestProgramContext> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "formspec-ts-plugin-"));
  const filePath = path.join(workspaceRoot, "example.ts");
  await fs.writeFile(filePath, sourceText, "utf8");

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    strict: true,
  };

  return {
    workspaceRoot,
    filePath,
    program: ts.createProgram([filePath], compilerOptions),
  };
}

export function expectErrorResponse(
  response: ReturnType<FormSpecPluginService["handleQuery"]>,
  fragment: string
): void {
  expect(response.kind).toBe("error");
  if (response.kind !== "error") {
    throw new Error("Expected an error response");
  }
  expect(response.error).toContain(fragment);
}
