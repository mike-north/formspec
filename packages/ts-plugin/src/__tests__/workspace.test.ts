import { describe, expect, it } from "vitest";
import { getFormSpecWorkspaceRuntimePaths } from "../workspace.js";

describe("workspace runtime paths", () => {
  it("builds a unix-socket endpoint on unix-like platforms", () => {
    const runtimePaths = getFormSpecWorkspaceRuntimePaths("/workspace/formspec", "linux");

    expect(runtimePaths.runtimeDirectory).toBe("/workspace/formspec/.cache/formspec/tooling");
    expect(runtimePaths.endpoint.kind).toBe("unix-socket");
    expect(runtimePaths.endpoint.address).toContain("formspec-");
    expect(runtimePaths.endpoint.address).toContain(".sock");
  });

  it("builds a named-pipe endpoint on windows", () => {
    const runtimePaths = getFormSpecWorkspaceRuntimePaths("C:\\workspace\\formspec", "win32");

    expect(runtimePaths.endpoint.kind).toBe("windows-pipe");
    expect(runtimePaths.endpoint.address).toMatch(/^\\\\\.\\pipe\\formspec-/u);
  });
});
