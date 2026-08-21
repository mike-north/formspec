import type { Decimal, Integer } from "./types.js";

export class NumericConstraintConsumer {
  /** @minimum 0 */
  integer!: Integer;

  /** @maximum 100 */
  optionalInteger?: Integer;

  /** @exclusiveMinimum 0 */
  nullableInteger!: Integer | null;

  /** @exclusiveMaximum 100 @multipleOf 1 */
  nullishInteger!: Integer | null | undefined;

  /** @minimum 0 */
  decimal!: Decimal;

  /** @minimum 0 */
  optionalDecimal?: Decimal;

  /** @minimum 0 */
  nullableDecimal!: Decimal | null;

  /** @minimum 0 */
  nullishDecimal!: Decimal | null | undefined;

  /** @minimum 0 */
  prices!: (Decimal | null)[];
}
