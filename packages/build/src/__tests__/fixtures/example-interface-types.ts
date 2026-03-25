/**
 * Test fixtures for interface and type alias analysis.
 *
 * Tests the TSDoc-based schema extraction pipeline for interfaces,
 * type aliases, nested types, and edge cases.
 */

// --- Interfaces with TSDoc tags ---

export interface SimpleConfig {
  /**
   * @displayName Full Name
   * @description The user's legal name
   * @minLength 1
   * @maxLength 200
   */
  name: string;

  /** @displayName Age @minimum 0 @maximum 150 */
  age: number;

  /** @displayName Email @pattern ^[^@]+@[^@]+$ */
  email?: string;

  /** @displayName Active */
  active: boolean;
}

export interface WithEnumOptions {
  /**
   * @displayName Status
   * @enumOptions ["draft","active","archived"]
   */
  status: "draft" | "active" | "archived";

  /**
   * @displayName Priority
   * @enumOptions [{"id":"low","label":"Low Priority"},{"id":"high","label":"High Priority"}]
   */
  priority: "low" | "high";
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Test fixture for empty interface edge case
export interface EmptyInterface {}

export interface OnlyOptionalFields {
  /** @displayName Notes */
  notes?: string;
  /** @displayName Tags */
  tags?: string;
}

/** @deprecated Use NewConfig instead */
export interface DeprecatedFieldInterface {
  /** @deprecated Use fullName instead */
  name?: string;

  /** @displayName Full Name */
  fullName: string;
}

// --- Type aliases with TSDoc tags ---

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Testing type alias analysis
export type SimpleTypeAlias = {
  /** @displayName Label @minLength 1 */
  label: string;

  /** @displayName Count @minimum 0 */
  count: number;

  /** @displayName Description */
  description?: string;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Testing type alias analysis
export type TypeAliasWithEnumOptions = {
  /**
   * @displayName Color
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

/** @displayName Discount Rate @description Percentage discount applied @minimum 0 @maximum 100 */
export type AnnotatedPercent = number;

export interface ConfigWithAliasedTypes {
  /** @displayName Discount */
  discount: Percent;

  /** @displayName Contact Email */
  contactEmail: Email;

  /** @displayName Tax Rate */
  taxRate: AnnotatedPercent;
}

// --- Nested types ---

export interface Address {
  /** @displayName Street @minLength 1 @maxLength 200 */
  street: string;
  /** @displayName City @minLength 1 */
  city: string;
  /** @displayName Zip @pattern ^[0-9]{5}$ */
  zip?: string;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Testing type alias analysis
export type ContactInfo = {
  /** @displayName Email @pattern ^[^@]+@[^@]+$ */
  email: string;
  /** @displayName Phone @maxLength 20 */
  phone?: string;
};

export interface NestedConfig {
  /** @displayName Name */
  name: string;
  /** @displayName Address */
  address: Address;
  /** @displayName Contact */
  contact: ContactInfo;
}
