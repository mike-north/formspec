import { CustomField, Floor, Ceiling } from "./example-b-decorators.js";

export class ExampleBForm {
  @CustomField({ displayName: "Amount", description: "Total amount in cents" })
  @Floor(0)
  @Ceiling(1000000)
  amount!: number;

  @CustomField({ displayName: "Label" })
  label!: string;
}
