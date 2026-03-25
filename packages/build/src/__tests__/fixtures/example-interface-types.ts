/**
 * Test fixtures for interface and type alias analysis.
 *
 * Tests the TSDoc-based schema extraction pipeline for interfaces,
 * type aliases, nested types, and edge cases.
 */

// --- Interfaces with TSDoc tags ---

export interface SimpleConfig {
  /**
   * @Field_displayName Full Name
   * @Field_description The user's legal name
   * @minLength 1
   * @maxLength 200
   */
  name: string;

  /** @Field_displayName Age @minimum 0 @maximum 150 */
  age: number;

  /** @Field_displayName Email @pattern ^[^@]+@[^@]+$ */
  email?: string;

  /** @Field_displayName Active */
  active: boolean;
}

export interface WithEnumOptions {
  /**
   * @Field_displayName Status
   * @enumOptions ["draft","active","archived"]
   */
  status: "draft" | "active" | "archived";

  /**
   * @Field_displayName Priority
   * @enumOptions [{"id":"low","label":"Low Priority"},{"id":"high","label":"High Priority"}]
   */
  priority: "low" | "high";
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Test fixture for empty interface edge case
export interface EmptyInterface {}

export interface OnlyOptionalFields {
  /** @Field_displayName Notes */
  notes?: string;
  /** @Field_displayName Tags */
  tags?: string;
}

/** @deprecated Use NewConfig instead */
export interface DeprecatedFieldInterface {
  /** @deprecated Use fullName instead */
  name?: string;

  /** @Field_displayName Full Name */
  fullName: string;
}

// --- Type aliases with TSDoc tags ---

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Testing type alias analysis
export type SimpleTypeAlias = {
  /** @Field_displayName Label @minLength 1 */
  label: string;

  /** @Field_displayName Count @minimum 0 */
  count: number;

  /** @Field_displayName Description */
  description?: string;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Testing type alias analysis
export type TypeAliasWithEnumOptions = {
  /**
   * @Field_displayName Color
   * @enumOptions ["red","green","blue"]
   */
  color: "red" | "green" | "blue";
};

// Non-object type aliases (should produce error results)
export type StringAlias = string;
export type UnionAlias = "a" | "b" | "c";

// --- Constrained primitive type aliases ---

/** @minimum 0 @maximum 100 */
export type Percent = number;

/** @minLength 1 @maxLength 255 @pattern ^[^@]+@[^@]+$ */
export type Email = string;

/** @Field_displayName Discount Rate @Field_description Percentage discount applied @minimum 0 @maximum 100 */
export type AnnotatedPercent = number;

export interface ConfigWithAliasedTypes {
  /** @Field_displayName Discount */
  discount: Percent;

  /** @Field_displayName Contact Email */
  contactEmail: Email;

  /** @Field_displayName Tax Rate */
  taxRate: AnnotatedPercent;
}

// --- Nested types ---

export interface Address {
  /** @Field_displayName Street @minLength 1 @maxLength 200 */
  street: string;
  /** @Field_displayName City @minLength 1 */
  city: string;
  /** @Field_displayName Zip @pattern ^[0-9]{5}$ */
  zip?: string;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Testing type alias analysis
export type ContactInfo = {
  /** @Field_displayName Email @pattern ^[^@]+@[^@]+$ */
  email: string;
  /** @Field_displayName Phone @maxLength 20 */
  phone?: string;
};

export interface NestedConfig {
  /** @Field_displayName Name */
  name: string;
  /** @Field_displayName Address */
  address: Address;
  /** @Field_displayName Contact */
  contact: ContactInfo;
}
