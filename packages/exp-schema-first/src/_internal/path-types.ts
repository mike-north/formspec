/**
 * Internal path utility types - users never see this
 */

type Primitive = string | number | boolean | null | undefined | Date;

/** All valid dot-notation paths through T */
export type PathsOf<T, Prefix extends string = ""> = T extends Primitive
  ? never
  : T extends unknown[]
    ? never
    : T extends object
      ? {
          [K in keyof T & string]:
            | (Prefix extends "" ? K : `${Prefix}.${K}`)
            | PathsOf<T[K], Prefix extends "" ? K : `${Prefix}.${K}`>;
        }[keyof T & string]
      : never;

/** Get the type at a path */
export type TypeAtPath<T, P extends string> = P extends `${infer Head}.${infer Tail}`
  ? Head extends keyof T
    ? TypeAtPath<T[Head], Tail>
    : never
  : P extends keyof T
    ? T[P]
    : never;

/** Filter paths by value type */
export type PathsToType<T, V, Prefix extends string = ""> = T extends Primitive
  ? never
  : T extends unknown[]
    ? never
    : T extends object
      ? {
          [K in keyof T & string]:
            | (T[K] extends V ? (Prefix extends "" ? K : `${Prefix}.${K}`) : never)
            | PathsToType<T[K], V, Prefix extends "" ? K : `${Prefix}.${K}`>;
        }[keyof T & string]
      : never;
