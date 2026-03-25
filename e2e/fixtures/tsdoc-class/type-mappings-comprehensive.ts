interface Address {
  street: string;
  city: string;
  country: string;
}

export class TypeMappingsForm {
  stringField!: string;
  numberField!: number;
  booleanField!: boolean;

  nullableString!: string | null;
  nullableNumber!: number | null;

  optionalString?: string;
  optionalNumber?: number;

  stringLiteralUnion!: "a" | "b" | "c";
  numberArray!: number[];
  stringArray!: string[];

  inlineObject!: { x: number; y: number };

  namedType!: Address;
  namedTypeOptional?: Address;

  recordType!: Record<string, number>;
}
