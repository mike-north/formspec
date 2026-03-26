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

export class NumericShippingAddressModel {
  cityCode!: number;
}

export const incompatibleShippingAddressOverlays = formspec(
  field.dynamicEnum("cityCode", "cities")
);

export class NestedShippingAddressModel {
  address!: {
    city: string;
  };
}

export const nestedShippingAddressOverlays = formspec(
  field.object("address", field.dynamicEnum("city", "cities"))
);

export const duplicateShippingAddressOverlays = formspec(
  field.dynamicEnum("city", "cities"),
  field.dynamicEnum("city", "backup-cities")
);

export const unknownShippingAddressOverlays = formspec(field.dynamicEnum("region", "regions"));
