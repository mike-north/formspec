import { expectAssignable, expectType } from "tsd";
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
} from "../src/index.js";

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

expectType<Promise<LoadConfigResult>>(loadFormSpecConfig({ fileSystem }));
expectAssignable<LoadConfigFoundResult>({
  found: true,
  config: {},
  configPath: "/project/formspec.config.ts",
});
expectAssignable<LoadConfigNotFoundResult>({ found: false });

const config: FormSpecConfig = {
  constraints: {
    fieldTypes: { dynamicEnum: "error" },
  } satisfies DSLPolicy,
};

expectType<ResolvedFormSpecConfig>(
  resolveConfigForFile(config, "/project/src/form.ts", "/project")
);
