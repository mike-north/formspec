/**
 * Parity fixture — usd-cents — TSDoc class definition.
 *
 * The alias chain exercises the same shared static semantics as the chain DSL:
 * integer-valued fields represented as numbers plus `@multipleOf 1`, with
 * per-alias minimum bounds flowing to the final field.
 */

/** @multipleOf 1 */
type Integer = number;

/** @minimum 0 */
type USDCents = Integer;

/** @minimum 1 */
type Quantity = Integer;

export class LineItemForm {
  unitPrice!: USDCents;
  quantity!: Quantity;
}
