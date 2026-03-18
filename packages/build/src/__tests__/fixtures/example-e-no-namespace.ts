import { Field } from "@formspec/decorators";
import { Highlight, Metadata } from "./example-e-decorators.js";

export class ExampleEForm {
  @Highlight
  @Field({ displayName: "Featured Title" })
  title!: string;

  @Metadata({ key: "priority" })
  @Field({ displayName: "Notes" })
  notes!: string;
}
