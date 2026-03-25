export class MetadataForm {
  /**
   * @placeholder Enter your email address
   */
  email!: string;

  /**
   * @placeholder 0
   */
  quantity!: number;

  /**
   * @deprecated Use newField instead
   */
  oldField?: string;

  /**
   * @deprecated
   */
  anotherOldField?: string;

  /**
   * @defaultValue "pending"
   */
  status?: string;

  /**
   * @defaultValue 0
   */
  count?: number;

  /**
   * @defaultValue false
   */
  enabled?: boolean;

  /**
   * @defaultValue null
   */
  nickname?: string | null;

  requiredField!: string;
}
