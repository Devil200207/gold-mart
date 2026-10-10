const STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  AMOUNT_TOO_SMALL: 400,
  INVALID_OTP: 400,
  OTP_EXPIRED: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  INVALID_SIGNATURE: 401,
  FORBIDDEN: 403,
  KYC_REQUIRED: 403,
  BANK_ACCOUNT_REQUIRED: 403,
  SELF_APPROVAL_FORBIDDEN: 403,
  NOT_FOUND: 404,
  QUOTE_INVALID: 409,
  INSUFFICIENT_GOLD: 409,
  INVALID_TRANSITION: 409,
  DELIVERY_MIN_NOT_MET: 409,
  CHARGES_UNPAID: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  IDEMPOTENCY_KEY_REUSED: 422,
  RATE_LIMITED: 429,
  GATEWAY_ERROR: 502,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: string,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? code);
    this.status = STATUS[code] ?? 500;
  }
}

export const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
