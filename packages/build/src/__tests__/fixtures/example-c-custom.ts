import { Field, Minimum } from "@formspec/decorators";
import { Title, Priority } from "./example-c-decorators.js";

export class ExampleCForm {
  @Title
  @Field({ displayName: "Heading" })
  heading!: string;

  @Priority({ level: "high" })
  @Field({ displayName: "Urgency Score" })
  @Minimum(1)
  urgency!: number;
}
