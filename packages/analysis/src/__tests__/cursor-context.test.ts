import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  findCommentTagAtOffset,
  findEnclosingDocComment,
  getCommentCompletionContextAtOffset,
  getCommentHoverInfoAtOffset,
  getCommentCursorTargetAtOffset,
  getSemanticCommentCompletionContextAtOffset,
  getTagCompletionPrefixAtOffset,
} from "../index.js";

function createProgram(sourceText: string) {
  const fileName = "/virtual/formspec.ts";
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    strict: true,
  };

  const host = ts.createCompilerHost(compilerOptions, true);
  host.getSourceFile = (requestedFileName, languageVersion) => {
    if (requestedFileName === fileName) {
      return ts.createSourceFile(fileName, sourceText, languageVersion, true, ts.ScriptKind.TS);
    }
    return undefined;
  };
  host.readFile = (requestedFileName) => (requestedFileName === fileName ? sourceText : undefined);
  host.fileExists = (requestedFileName) => requestedFileName === fileName;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  host.writeFile = () => {};

  const program = ts.createProgram([fileName], compilerOptions, host);
  const sourceFile = program.getSourceFile(fileName);
  if (sourceFile === undefined) {
    throw new Error("Expected test source file to be created");
  }

  return {
    checker: program.getTypeChecker(),
    sourceFile,
  };
}

describe("cursor-context", () => {
  it("finds the enclosing doc comment and parses its tags", () => {
    const source = `
      class Foo {
        /** @minimum 0 */
        value!: number;
      }
    `;
    const offset = source.indexOf("@minimum") + 2;
    const comment = findEnclosingDocComment(source, offset);

    expect(comment).not.toBeNull();
    expect(comment?.parsed.tags).toHaveLength(1);
    expect(comment?.parsed.tags[0]?.normalizedTagName).toBe("minimum");
  });

  it("finds the tag under the cursor when hovering the tag name", () => {
    const source = "/** @maximum 100 */";
    const offset = source.indexOf("@maximum") + 3;
    const tag = findCommentTagAtOffset(source, offset);

    expect(tag?.normalizedTagName).toBe("maximum");
  });

  it("returns a tag-name completion prefix when the cursor is after @ letters", () => {
    const source = "/** @mi */";
    const offset = source.indexOf("@mi") + "@mi".length;
    expect(getTagCompletionPrefixAtOffset(source, offset)).toBe("mi");
  });

  it("returns null for completion prefix outside a doc comment", () => {
    expect(getTagCompletionPrefixAtOffset("const value = 1;", 5)).toBeNull();
  });

  it("classifies colon and target positions", () => {
    const source = "/** @minimum :amount 0 */";
    const colonOffset = source.indexOf(":");
    const targetOffset = source.indexOf("amount") + 2;

    expect(getCommentCursorTargetAtOffset(source, colonOffset)?.kind).toBe("colon");
    expect(getCommentCursorTargetAtOffset(source, targetOffset)?.kind).toBe("target");
  });

  it("classifies completion context for target and argument positions", () => {
    const source = "/** @minimum :amount 0 */";
    const targetOffset = source.indexOf("amount") + 2;
    const argumentOffset = source.indexOf("0");

    expect(getCommentCompletionContextAtOffset(source, targetOffset)).toMatchObject({
      kind: "target",
    });
    expect(getCommentCompletionContextAtOffset(source, argumentOffset)).toMatchObject({
      kind: "argument",
    });
  });

  it("surfaces semantic tag-name completion context with available tags", () => {
    const source = "/** @mi */";
    const offset = source.indexOf("@mi") + "@mi".length;
    const context = getSemanticCommentCompletionContextAtOffset(source, offset);

    expect(context.kind).toBe("tag-name");
    if (context.kind === "tag-name") {
      expect(context.prefix).toBe("mi");
      expect(context.availableTags.some((tag) => tag.canonicalName === "minimum")).toBe(true);
    }
  });

  it("surfaces type-compatible path target completions when semantic binding is provided", () => {
    const source = `
      class Foo {
        /**
         * @minimum :amount.currency 0
         */
        value!: {
          amount: {
            currency: number;
          };
          label: string;
        };
      }
    `;
    const offset = source.indexOf("amount.currency") + 2;
    const { checker, sourceFile } = createProgram(source);
    const classDeclaration = sourceFile.statements.find(ts.isClassDeclaration);
    const property = classDeclaration?.members.find(ts.isPropertyDeclaration);
    if (property === undefined) {
      throw new Error("Expected property declaration");
    }

    const subjectType = checker.getTypeAtLocation(property);
    const context = getSemanticCommentCompletionContextAtOffset(source, offset, {
      checker,
      subjectType,
      placement: "class-field",
    });

    expect(context.kind).toBe("target");
    if (context.kind === "target") {
      expect(context.semantic.targetCompletions).toContain("amount.currency");
      expect(context.semantic.targetCompletions).not.toContain("label");
    }
  });

  it("provides target hover details for variant-target tags", () => {
    const source = "/** @apiName :plural homes */";
    const offset = source.indexOf("plural") + 2;
    const hover = getCommentHoverInfoAtOffset(source, offset);

    expect(hover?.kind).toBe("target");
    expect(hover?.markdown).toContain("Target for @apiName");
    expect(hover?.markdown).toContain("singular");
    expect(hover?.markdown).toContain("plural");
  });

  it("provides argument hover details with the expected value label", () => {
    const source = "/** @minimum 0 */";
    const offset = source.indexOf("0");
    const hover = getCommentHoverInfoAtOffset(source, offset);

    expect(hover?.kind).toBe("argument");
    expect(hover?.markdown).toContain("Argument for @minimum");
    expect(hover?.markdown).toContain("<number>");
  });

  it("returns null hover info for unrecognized tags", () => {
    const source = "/** @unknownTag value */";
    const offset = source.indexOf("@unknownTag") + 2;

    expect(getCommentHoverInfoAtOffset(source, offset)).toBeNull();
  });
});
