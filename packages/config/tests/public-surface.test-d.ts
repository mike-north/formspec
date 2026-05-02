import { expectAssignable, expectError, expectType } from "tsd";
import {
  loadFormSpecConfig,
  resolveConfigForFile,
  type DSLPolicy,
  type FileSystem,
  type FormSpecConfig,
  type LoadConfigFoundResult,
  type LoadConfigNotFoundResult,
  type LoadConfigOptions,
  type LoadConfigResult,
  type ResolvedFormSpecConfig,
} from "@formspec/config";

const fileSystem: FileSystem = {
  exists: () => Promise.resolve(true),
  readFile: () => Promise.resolve("export default {}"),
  resolve(...segments) {
    return segments.join("/");
  },
  dirname(path) {
    return path.split("/").slice(0, -1).join("/");
  },
};

expectAssignable<LoadConfigOptions>({
  searchFrom: ".",
  fileSystem,
});
expectError<LoadConfigOptions>({ searchFrom: 42, fileSystem });
expectError<LoadConfigOptions>({
  fileSystem: {
    ...fileSystem,
    exists: () => true,
  },
});

expectType<Promise<LoadConfigResult>>(loadFormSpecConfig({ fileSystem }));
expectAssignable<LoadConfigFoundResult>({
  found: true,
  config: {},
  configPath: "/project/formspec.config.ts",
});
expectAssignable<LoadConfigNotFoundResult>({ found: false });
expectError<LoadConfigFoundResult>({ found: true, config: {} });
expectError<LoadConfigNotFoundResult>({
  found: false,
  configPath: "/project/formspec.config.ts",
});

const config: FormSpecConfig = {
  constraints: {
    fieldTypes: { dynamicEnum: "error" },
  } satisfies DSLPolicy,
};

expectType<ResolvedFormSpecConfig>(
  resolveConfigForFile(config, "/project/src/form.ts", "/project")
);
expectError(resolveConfigForFile(config, "/project/src/form.ts"));
