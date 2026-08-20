declare const __integerBrand: unique symbol;

export type Integer = number & {
  readonly [__integerBrand]: true;
};

export interface Decimal {
  readonly __decimalBrand: "Decimal";
}
