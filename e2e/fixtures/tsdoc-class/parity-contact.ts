/** A contact form for parity testing — TSDoc surface. */
export class ParityContact {
  /** @minimum 1 @maximum 100 */
  age!: number;

  /** @minLength 1 @maxLength 200 */
  name!: string;

  /** @pattern ^[^@]+@[^@]+$ */
  email!: string;

  country!: "us" | "ca" | "uk";

  bio?: string;
}
