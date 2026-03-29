import { describe, expect, it } from "vitest";
import { createFormSpecAnalysisManifest, getFormSpecWorkspaceRuntimePaths } from "../workspace.js";

describe("workspace runtime paths", () => {
  it("builds a unix-socket endpoint on unix-like platforms", () => {
    const runtimePaths = getFormSpecWorkspaceRuntimePaths("/workspace/formspec", "linux", "alice");

    expect(runtimePaths.runtimeDirectory).toBe("/workspace/formspec/.cache/formspec/tooling");
    expect(runtimePaths.endpoint.kind).toBe("unix-socket");
    expect(runtimePaths.endpoint.address).toContain("formspec-alice-");
    expect(runtimePaths.endpoint.address).toContain(".sock");
  });

  it("builds a named-pipe endpoint on windows", () => {
    const runtimePaths = getFormSpecWorkspaceRuntimePaths(
      "C:\\workspace\\formspec",
      "win32",
      "alice"
    );

    expect(runtimePaths.endpoint.kind).toBe("windows-pipe");
    expect(runtimePaths.endpoint.address).toMatch(/^\\\\\.\\pipe\\formspec-alice-/u);
  });

  it("sanitizes the user scope before embedding it in endpoint names", () => {
    const runtimePaths = getFormSpecWorkspaceRuntimePaths(
      "/workspace/formspec",
      "linux",
      "Alice Example"
    );

    expect(runtimePaths.endpoint.address).toContain("formspec-alice-example-");
  });

  it("derives deterministic runtime paths for the same workspace", () => {
    const left = getFormSpecWorkspaceRuntimePaths("/workspace/formspec", "linux", "alice");
    const right = getFormSpecWorkspaceRuntimePaths("/workspace/formspec", "linux", "alice");

    expect(left).toEqual(right);
  });

  it("creates a manifest matching the runtime endpoint", () => {
    const manifest = createFormSpecAnalysisManifest("/workspace/formspec", "5.9.3", 42);

    expect(manifest.workspaceRoot).toBe("/workspace/formspec");
    expect(manifest.workspaceId.length).toBeGreaterThan(0);
    expect(manifest.endpoint.address.length).toBeGreaterThan(0);
    expect(manifest.generation).toBe(42);
  });
});
