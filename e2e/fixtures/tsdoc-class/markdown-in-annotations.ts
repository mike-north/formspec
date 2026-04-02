/**
 * Tests that inline code spans in free-form text tags are preserved.
 *
 * TSDoc parses backtick-wrapped text as `DocCodeSpan` nodes. The summary,
 * remarks, and deprecated message extractors should preserve that markdown
 * content rather than stripping it.
 */

/**
 * Use `calculateDiscount(amount)` to compute the result.
 */
export class MarkdownInSummaryForm {
  /** @displayName Amount */
  amount!: number;
}

/**
 * @remarks Use `formatCurrency(value)` for display purposes.
 */
export class MarkdownInRemarksForm {
  /** @displayName Value */
  value!: number;
}

/**
 * @deprecated Use `NewDiscountConfig` instead of this class.
 */
export class MarkdownInDeprecatedForm {
  /** @displayName Rate */
  rate!: number;
}
