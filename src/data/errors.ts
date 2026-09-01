export type AppErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'DAY_CLOSED'
  | 'RESOURCE_BUSY'
  | 'OUT_OF_STOCK'
  | 'EMPTY_BILL'
  | 'CUSTOMER_REQUIRED'
  | 'INVALID_AMOUNT'
  | 'ALREADY_DONE'
  | 'NO_PRICING'
  | 'CONFLICT';

/** Errors staff are meant to read. `message` is shown verbatim in the UI. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly detail?: string;

  constructor(code: AppErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

export function errorMessage(e: unknown): string {
  if (isAppError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Nothing was saved.';
}
