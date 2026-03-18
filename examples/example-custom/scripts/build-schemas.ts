import * as fs from "node:fs";
import * as path from "node:path";
import { generateSchemasFromClass } from "@formspec/build";

const formsPath = path.resolve(import.meta.dirname, "../src/forms.ts");
const schemasDir = path.resolve(import.meta.dirname, "../schemas");

if (!fs.existsSync(schemasDir)) {
  fs.mkdirSync(schemasDir, { recursive: true });
}

const result = generateSchemasFromClass({
  filePath: formsPath,
  className: "TaskForm",
});

fs.writeFileSync(
  path.join(schemasDir, "TaskForm.schema.json"),
  JSON.stringify(result.jsonSchema, null, 2) + "\n"
);

fs.writeFileSync(
  path.join(schemasDir, "TaskForm.ui.json"),
  JSON.stringify(result.uiSchema, null, 2) + "\n"
);

console.log("Generated schemas for TaskForm");
