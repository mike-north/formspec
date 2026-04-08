/**
 * @displayName Submit Input
 */
export interface SubmitInput {
  /** @apiName amount_cents */
  amount: number;

  /** @displayName Currency */
  currency: string;
}

/**
 * @displayName Submit Result
 */
export interface SubmitResult {
  /** @apiName approved_flag */
  approved: boolean;
}

export interface Envelope<T> {
  payload: T;
}

/**
 * @apiName payment_status
 */
export type PaymentStatus = "ok" | "error";

/**
 * @displayName Aliased Submit Input
 */
export type AliasedSubmitInput = SubmitInput;

/**
 * @displayName Partial Submit Input
 */
export type PartialSubmitInput = Partial<SubmitInput>;

/**
 * @displayName Amount Only Submit Input
 */
export type AmountOnlySubmitInput = Pick<SubmitInput, "amount">;

/**
 * @displayName Audited Submit Input
 */
export type AuditedSubmitInput = Partial<SubmitInput> & {
  /** @displayName Audit Id */
  auditId: string;
};

/**
 * @displayName Conflicting Submit Input
 */
export type ConflictingSubmitInput = Pick<SubmitInput, "currency"> & {
  currency: number;
};

/**
 * @displayName Callable Submit Input
 */
export type CallableSubmitInput = (() => void) & {
  amount: number;
};

/**
 * @minimum 1
 */
export type InvalidTaggedStatus = "ok" | "error";

// eslint-disable-next-line @typescript-eslint/no-namespace -- merged export fixture for resolution tests
export namespace MergedConfig {
  export const version = 1;
}

export interface MergedConfig {
  enabled: boolean;
}

export class PaymentService {
  submit(input: SubmitInput): SubmitResult {
    return {
      approved: input.amount > 0,
    };
  }

  inline(input: {
    /** @apiName inline_amount_cents */
    amount: number;
    /** @displayName Inline Currency */
    currency: string;
  }): {
    /** @apiName inline_ok */
    ok: boolean;
  } {
    return {
      ok: input.currency.length > 0,
    };
  }

  status(): PaymentStatus {
    return "ok";
  }

  wrappedSubmit(): Envelope<SubmitInput> {
    return {
      payload: {
        amount: 100,
        currency: "USD",
      },
    };
  }
}

export function submitPayment(input: SubmitInput): SubmitResult {
  return {
    approved: input.amount > 0,
  };
}

export default PaymentService;
