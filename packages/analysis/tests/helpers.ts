import * as ts from "typescript";

export function createProgram(sourceText: string, fileName = "/virtual/formspec.ts") {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    strict: true,
  };

  const host = ts.createCompilerHost(compilerOptions, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  host.getSourceFile = (requestedFileName, languageVersion) => {
    if (requestedFileName === fileName) {
      return ts.createSourceFile(fileName, sourceText, languageVersion, true, ts.ScriptKind.TS);
    }
    return originalGetSourceFile(requestedFileName, languageVersion);
  };
  host.readFile = (requestedFileName) =>
    requestedFileName === fileName ? sourceText : originalReadFile(requestedFileName);
  host.fileExists = (requestedFileName) =>
    requestedFileName === fileName || originalFileExists(requestedFileName);
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  host.writeFile = () => {};

  const program = ts.createProgram([fileName], compilerOptions, host);
  const sourceFile = program.getSourceFile(fileName);
  if (sourceFile === undefined) {
    throw new Error("Expected virtual source file");
  }

  return {
    checker: program.getTypeChecker(),
    sourceFile,
    program,
  };
}
