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
  | 'DUPLICATE_VISIT_TODAY'
  | 'FEE_REASON_REQUIRED'
  | 'UNAUTHENTICATED'
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
