import { field, formspec } from "@formspec/dsl";

/**
 * Static shipping-address model for mixed-authoring composition tests.
 */
export class ShippingAddressModel {
  /** @displayName Country */
  country!: string;

  /** @displayName City */
  city!: string;

  /** @displayName Postal Code */
  postalCode?: string;
}

/**
 * ChainDSL overlay for the runtime-backed city field.
 */
export const shippingAddressOverlays = formspec(
  field.dynamicEnum("city", "cities", {
    params: ["country"],
  })
);
