import { Field, Minimum } from "@formspec/decorators";

/**
 * Simulates a non-FormSpec decorator (e.g., from class-validator, typeorm, etc.).
 * The pipeline should silently ignore it.
 */
function ExternalValidator(_message: string) {
  return (_value: undefined, _context: ClassFieldDecoratorContext): void => {
    // no-op
  };
}

export class ExampleDForm {
  @ExternalValidator("must be a valid name")
  @Field({ displayName: "Username" })
  username!: string;

  @Minimum(0)
  @ExternalValidator("must be positive")
  score!: number;

  @ExternalValidator("required field")
  plain!: string;
}
