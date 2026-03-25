/**
 * TypeScript type-system edge cases for E2E coverage.
 *
 * This fixture is intentionally compact but exercises the analyzer's current
 * supported surface for inheritance, readonly modifiers, index signatures,
 * finite key unions, and nested interface types.
 */

interface BaseContact {
  name: string;
  email: string;
}

interface ExtendedContact extends BaseContact {
  phone: string;
}

export class BaseEdgeCaseForm {
  baseId!: string;
  readonly baseLabel!: string;
  private secret!: string;
  protected internal!: string;
  static version = 1;
}

export class TsEdgeCaseForm extends BaseEdgeCaseForm {
  readonly readOnlyTitle!: string;

  contact!: ExtendedContact;

  metadata!: Record<string, number>;

  exactStates!: Record<"draft" | "sent", string>;

  patternEnvValues!: Record<`env_${string}`, string>;

  coords!: [number, number];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  anyField!: any;

  unknownField!: unknown;

  neverField!: never;

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  voidField!: void;
}
