// GitHub issue #517 — @defaultValue parsing must be type-directed against
// the resolved target type (spec 002 §3.2), not parsed independently of it.
export class TypeDirectedDefaultsForm {
  /** @defaultValue 6 */
  code?: string;

  /** @defaultValue 6 */
  quantity?: number;

  // AC2: an explicit quoted JSON string is always a string, even though the
  // target type also permits a number.
  /** @defaultValue "6" */
  codeOrQuantity?: string | number;

  // Complement of AC2: the same union, but unquoted — coerces to the
  // permitted non-string member (number) first.
  /** @defaultValue 6 */
  numericCodeOrQuantity?: string | number;

  /** @defaultValue true */
  flag?: boolean;

  /** @defaultValue true */
  flagLabel?: string;
}
