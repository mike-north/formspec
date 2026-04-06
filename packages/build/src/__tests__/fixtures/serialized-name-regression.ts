export interface PostalAddress {
  /**
   * @apiName postal_code
   */
  postalCode: string;
}

export interface RenamedAmount {
  /**
   * @apiName amount_value
   */
  value: number;
}

export class SerializedNameForm {
  /**
   * @apiName first_name
   */
  firstName!: string;

  /**
   * @minimum :value 0
   */
  total!: RenamedAmount;

  address!: PostalAddress;
}
