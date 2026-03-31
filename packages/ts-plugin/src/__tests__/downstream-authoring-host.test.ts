import fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import * as ts from "typescript";
import {
  collectDownstreamAuthoringFeedback,
  renderDownstreamAuthoringDiagnostic,
} from "../reference-host-example.js";
import { FormSpecSemanticService } from "../semantic-service.js";
import { createProgramContext } from "./helpers.js";

describe("downstream authoring host reference example", () => {
  const workspaces: string[] = [];
  const services: FormSpecSemanticService[] = [];

  afterEach(async () => {
    services.forEach((service) => {
      service.dispose();
    });
    services.length = 0;

    await Promise.all(
      workspaces.map(async (workspaceRoot) => {
        await fs.rm(workspaceRoot, { recursive: true, force: true });
      })
    );
    workspaces.length = 0;
  });

  it("reuses the host program and renders custom summaries from code plus facts", async () => {
    const source = `
      class Checkout {
        /**
         * @minimum :label 0
         * @minLength :zip 3
         */
        discount!: {
          amount: number;
          label: string;
        };
      }
    `;
    const context = await createProgramContext(source);
    workspaces.push(context.workspaceRoot);

    const service = new FormSpecSemanticService({
      workspaceRoot: context.workspaceRoot,
      typescriptVersion: ts.version,
      getProgram: () => context.program,
    });
    services.push(service);

    const canonicalDiagnostics = service.getDiagnostics(context.filePath).diagnostics;
    const feedback = collectDownstreamAuthoringFeedback(service, context.filePath);

    expect(feedback).toHaveLength(2);
    expect(feedback.map((entry) => entry.code)).toEqual(["TYPE_MISMATCH", "UNKNOWN_PATH_TARGET"]);

    const typeMismatch = feedback.find((entry) => entry.code === "TYPE_MISMATCH");
    expect(typeMismatch?.summary).toBe(
      'Reject @minimum for path "label" because that target resolves to an incompatible type.'
    );
    expect(typeMismatch?.details).toContain("Placement: class-field");
    expect(typeMismatch?.details).toContain("Target path: label");
    expect(typeMismatch?.summary).not.toBe(canonicalDiagnostics[0]?.message);

    const missingPath = feedback.find((entry) => entry.code === "UNKNOWN_PATH_TARGET");
    expect(missingPath?.summary).toBe(
      'Reject @minLength because the requested path segment "zip" does not exist on the resolved subject type.'
    );
    expect(missingPath?.facts["missingPathSegment"]).toBe("zip");
  });

  it("can render one canonical diagnostic at a time in a custom feedback layer", () => {
    const rendered = renderDownstreamAuthoringDiagnostic({
      code: "TYPE_MISMATCH",
      category: "type-compatibility",
      message: "Default FormSpec message that the downstream host does not need to show.",
      range: { start: 4, end: 12 },
      severity: "error",
      relatedLocations: [],
      data: {
        tagName: "pattern",
        placement: "property",
        targetKind: "path",
        targetText: "code",
        typescriptDiagnosticCode: 2345,
      },
    });

    expect(rendered.summary).toBe(
      'Reject @pattern for path "code" because that target resolves to an incompatible type.'
    );
    expect(rendered.details).toEqual([
      "Placement: property",
      "Target path: code",
      "TypeScript diagnostic: TS2345",
    ]);
    expect(rendered.facts["tagName"]).toBe("pattern");
  });
});
