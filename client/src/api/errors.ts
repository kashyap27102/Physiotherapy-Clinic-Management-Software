export interface FieldError {
  field: string
  message: string
}

/** Error codes from docs/API-Requirements.md section 2.2 that the UI reacts to. */
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'OTP_REQUIRED'
  | 'OTP_INVALID'
  | 'PERMISSION_DENIED'
  | 'TENANT_SUSPENDED'
  | 'NOT_FOUND'
  | 'DUPLICATE_PATIENT_WARNING'
  | 'NO_ACTIVE_EPISODE'
  | 'EPISODE_ALREADY_ACTIVE'
  | 'VERSION_CONFLICT'
  | 'DUPLICATE_VISIT_TODAY'
  | 'FEE_REASON_REQUIRED'
  | 'REFUND_EXCEEDS_CREDIT'
  | 'ALREADY_REVERSED'
  | 'CANNOT_REVERSE_REVERSAL'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'LAST_OWNER'
  | 'LAST_BRANCH'
  | 'BRANCH_HAS_STAFF'
  | 'BRANCH_CODE_LOCKED'
  | 'PERMISSION_WARNING'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNAUTHENTICATED'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'BAD_REQUEST'
  | 'NETWORK'
  | 'UNKNOWN'

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly fields: FieldError[]
  readonly details: unknown

  constructor(status: number, code: ApiErrorCode, message: string, fields: FieldError[] = [], details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
    this.details = details
  }
}

export const isApiError = (error: unknown, code?: ApiErrorCode): error is ApiError =>
  error instanceof ApiError && (code === undefined || error.code === code)

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

/** The `details` object some error codes carry (duplicate candidates, permission warnings); empty when absent. */
export function errorDetails<T extends object>(error: ApiError): Partial<T> {
  return (error.details ?? {}) as Partial<T>
}
