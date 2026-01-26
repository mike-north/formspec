/**
 * @formspec/exp-schema-first
 *
 * Schema-first form authoring for React.
 *
 * USAGE:
 *
 *   import { z } from "zod";
 *   import { createForm } from "@formspec/exp-schema-first";
 *
 *   const Schema = z.object({
 *     name: z.string(),
 *     age: z.number(),
 *   });
 *
 *   const { Form, TextField, NumberField } = createForm(Schema);
 *
 *   export const MyForm = () => (
 *     <Form onSubmit={console.log}>
 *       <TextField path="name" label="Name" />
 *       <NumberField path="age" label="Age" />
 *     </Form>
 *   );
 *
 * That's it! Full type safety, zero boilerplate.
 */

export { createForm } from "./_internal/components.js";
export type { FormComponents, FormProps } from "./_internal/components.js";
