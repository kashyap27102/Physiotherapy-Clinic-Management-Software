import type { ZodError, ZodType } from 'zod'

/** Machine-readable codes from docs/API-Requirements.md section 2.2, plus generic transport errors. */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'OTP_REQUIRED'
  | 'OTP_INVALID'
  | 'PERMISSION_DENIED'
  | 'TENANT_SUSPENDED'
  | 'PLAN_LIMIT_REACHED'
  | 'NOT_FOUND'
  | 'DUPLICATE_PATIENT_WARNING'
  | 'NO_ACTIVE_EPISODE'
  | 'EPISODE_ALREADY_ACTIVE'
  | 'DUPLICATE_VISIT_TODAY'
  | 'FEE_REASON_REQUIRED'
  | 'ALREADY_REVERSED'
  | 'CANNOT_REVERSE_REVERSAL'
  | 'REFUND_EXCEEDS_CREDIT'
  | 'BRANCH_CODE_LOCKED'
  | 'LAST_OWNER'
  | 'LAST_BRANCH'
  | 'BRANCH_HAS_STAFF'
  | 'PERMISSION_WARNING'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_REPLAY'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR'

export interface FieldError {
  field: string
  message: string
}

interface AppErrorOptions {
  fields?: FieldError[]
  /** Extra structured data the client may use, for example duplicate-patient candidates. */
  details?: unknown
}

/** An error whose message is safe to show to the user. Anything else becomes a generic 500. */
export class AppError extends Error {
  readonly status: number
  readonly code: ErrorCode
  readonly fields: FieldError[]
  readonly details: unknown

  constructor(status: number, code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.fields = options.fields ?? []
    this.details = options.details
  }
}

export const badRequest = (message = 'The request could not be understood.') =>
  new AppError(400, 'BAD_REQUEST', message)
export const unauthenticated = (message = 'Please sign in.') => new AppError(401, 'UNAUTHENTICATED', message)
export const forbidden = (message = 'Your role does not have permission for this action.') =>
  new AppError(403, 'PERMISSION_DENIED', message)
/** Also used for records that belong to another clinic, so their existence is never revealed. */
export const notFound = (message = 'Not found.') => new AppError(404, 'NOT_FOUND', message)
export const unavailable = (message = 'The service is temporarily unavailable.') =>
  new AppError(503, 'SERVICE_UNAVAILABLE', message)

export function validationError(fields: FieldError[], message = 'Please fix the highlighted fields.'): AppError {
  return new AppError(422, 'VALIDATION_FAILED', message, { fields })
}

export function fromZodError(error: ZodError): AppError {
  return validationError(
    error.issues.map((issue) => ({
      field: issue.path.join('.') || '_',
      message: issue.message,
    })),
  )
}

/** Validates untrusted input (body, query, params) and throws a 422 in the API error format. */
export function parseInput<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) throw fromZodError(result.error)
  return result.data
}
