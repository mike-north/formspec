/**
 * Error for runtime paths that are statically unreachable after TypeScript has
 * checked an exhaustive branch.
 *
 * @internal
 */
export class UnreachableError extends Error {
  public constructor(value: never, message: string) {
    super(message);
    this.name = "UnreachableError";
    void value;
  }
}
