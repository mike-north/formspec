/** Tests that type-incompatible constraints are detected. */
export class TypeMismatchConstraints {
  /** @minimum 0 */
  nameIsString!: string;

  /** @minLength 1 */
  countIsNumber!: number;

  /** @minItems 1 */
  notAnArray!: string;
}
