import { Field, MinLength, MaxLength, Pattern } from "@formspec/decorators";

// --- Leaf classes ---

export class Address {
  @Field({ displayName: "Street" })
  @MinLength(1)
  @MaxLength(200)
  street!: string;

  @Field({ displayName: "City" })
  @MinLength(1)
  city!: string;

  @Field({ displayName: "Zip Code" })
  @Pattern("^\\d{5}(-\\d{4})?$")
  zip?: string;
}

export class Dimensions {
  /** @Minimum 0 @Maximum 10000 */
  @Field({ displayName: "Width" })
  width!: number;

  /** @Minimum 0 @Maximum 10000 */
  @Field({ displayName: "Height" })
  height!: number;

  /** @Minimum 0 */
  @Field({ displayName: "Depth" })
  depth!: number;
}

// --- Single nesting level ---

export class UserWithAddress {
  @Field({ displayName: "Username" })
  @MinLength(1)
  username!: string;

  @Field({ displayName: "Address" })
  address!: Address;
}

export class ProductWithDimensions {
  @Field({ displayName: "Product Name" })
  name!: string;

  @Field({ displayName: "Dimensions" })
  dimensions!: Dimensions;
}

// --- Three levels deep: Order → Customer → Address ---

export class Customer {
  @Field({ displayName: "Customer Name" })
  @MinLength(1)
  name!: string;

  @Field({ displayName: "Customer Address" })
  address!: Address;
}

export class Order {
  @Field({ displayName: "Order ID" })
  orderId!: string;

  @Field({ displayName: "Customer" })
  customer!: Customer;
}

// --- Circular reference ---

export class NodeA {
  @Field({ displayName: "Name" })
  @MinLength(1)
  name!: string;

  sibling?: NodeB;
}

export class NodeB {
  @Field({ displayName: "Label" })
  label!: string;

  sibling?: NodeA;
}

// --- Non-class object type (regression guard) ---

export class WithInlineObject {
  @Field({ displayName: "Title" })
  title!: string;

  metadata!: { key: string; value: string };
}
