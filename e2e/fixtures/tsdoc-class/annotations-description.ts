/**
 * Form for collecting user feedback.
 */
export class FeedbackForm {
  /** The user's full name as it appears on their ID. */
  name!: string;

  /**
   * Free-form comments about the experience.
   * @remarks This field accepts markdown-formatted text.
   */
  comments!: string;

  /**
   * @remarks Remarks only, no summary text.
   */
  notes!: string;

  rating!: number;
}
