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

/**
 * @apiName :singular payment_method
 * @apiName :plural payment_methods
 * @displayName :singular Payment Method
 * @displayName :plural Payment Methods
 */
export interface PaymentMethod {
  id: string;
}

export interface Envelope<T> {
  payload: T;
}

/**
 * @apiName :singular payment_status
 * @apiName :plural payment_statuses
 * @displayName :singular Payment Status
 * @displayName :plural Payment Statuses
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
 * @displayName Quoted Conflicting Submit Input
 */
export type QuotedConflictingSubmitInput = Pick<SubmitInput, "currency"> & {
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
  /**
   * @apiName submit_payment
   * @displayName Submit Payment
   */
  submit(input: SubmitInput): SubmitResult {
    return {
      approved: input.amount > 0,
    };
  }

  async submitAsync(input: SubmitInput): Promise<SubmitResult> {
    await Promise.resolve();
    return {
      approved: input.amount > 0,
    };
  }

  ["submitComputed"](input: SubmitInput): SubmitResult {
    return {
      approved: input.amount > 0,
    };
  }

  async wrappedSubmitAsync(): Promise<Envelope<SubmitInput>> {
    await Promise.resolve();
    return {
      payload: {
        amount: 100,
        currency: "USD",
      },
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

export async function submitPaymentAsync(input: SubmitInput): Promise<SubmitResult> {
  await Promise.resolve();
  return {
    approved: input.amount > 0,
  };
}

export default PaymentService;
