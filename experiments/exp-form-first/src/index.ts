/**
 * @formspec/exp-form-first
 *
 * Form-first form authoring for React.
 * Define your fields, get types + validation + UI for free.
 *
 * USAGE (Auto-rendered):
 *
 *   import { defineForm, text, number, AutoForm } from "@formspec/exp-form-first";
 *
 *   const myForm = defineForm({
 *     name: text({ label: "Name" }),
 *     age: number({ label: "Age" }),
 *   });
 *
 *   export const MyForm = () => (
 *     <AutoForm definition={myForm} onSubmit={console.log} />
 *   );
 *
 * USAGE (Custom layout):
 *
 *   const { Form, fields } = myForm;
 *
 *   export const MyForm = () => (
 *     <Form onSubmit={console.log}>
 *       <TextField name="name" {...fields.name} />
 *       <NumberField name="age" {...fields.age} />
 *       <button type="submit">Submit</button>
 *     </Form>
 *   );
 *
 * That's it! Types are inferred, validation is automatic.
 */

// Field builders
export { text, number, select, checkbox, group } from "./_internal/field-builders.js";

// Form definition
export { defineForm, AutoForm } from "./_internal/components.js";

// Individual field components (for custom layouts)
export { TextField, NumberField, SelectField, CheckboxField } from "./_internal/components.js";

// Types
export type { FormDefinition, InferFormValues } from "./_internal/components.js";
export type { FieldDefs, AnyFieldDef } from "./_internal/field-builders.js";
