/**
 * Form for collecting user feedback.
 * @description Collect detailed feedback from users about their experience.
 */
export class FeedbackForm {
  /**
   * @description The user's full name as it appears on their ID.
   */
  name!: string;

  /**
   * @remarks This field accepts markdown-formatted text.
   */
  comments!: string;

  /**
   * @description Explicit description wins.
   * @remarks This remarks should be ignored when description is present.
   */
  subject!: string;

  rating!: number;
}
