import * as fs from "node:fs";
import * as path from "node:path";
import { generateSchemasFromClass } from "@formspec/build";

const formsPath = path.resolve(import.meta.dirname, "../src/forms.ts");
const schemasDir = path.resolve(import.meta.dirname, "../schemas");

// Ensure schemas directory exists
if (!fs.existsSync(schemasDir)) {
  fs.mkdirSync(schemasDir, { recursive: true });
}

// Generate schemas for UserRegistrationForm
const result = generateSchemasFromClass({
  filePath: formsPath,
  className: "UserRegistrationForm",
});

fs.writeFileSync(
  path.join(schemasDir, "UserRegistrationForm.schema.json"),
  JSON.stringify(result.jsonSchema, null, 2) + "\n"
);

fs.writeFileSync(
  path.join(schemasDir, "UserRegistrationForm.ui.json"),
  JSON.stringify(result.uiSchema, null, 2) + "\n"
);

console.log("Generated schemas for UserRegistrationForm");
