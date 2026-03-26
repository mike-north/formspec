interface Address {
  street: string;
  city: string;
}

export class InvalidPathTargetForm {
  /**
   * @minLength :zip 5
   */
  address!: Address;
}
