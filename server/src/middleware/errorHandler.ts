import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError } from 'zod'
import { logger } from '../lib/logger.js'
import { AppError, fromZodError, notFound, type ErrorCode } from '../lib/errors.js'

interface ErrorBody {
  error: {
    code: ErrorCode
    message: string
    fields?: { field: string; message: string }[]
    details?: unknown
    requestId: string
  }
}

/** Unknown routes answer in the same error format as everything else. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(notFound('Route not found.'))
}

/** Turns body-parser failures (bad JSON, body too large) into API errors. */
function normalise(error: unknown): AppError | null {
  if (error instanceof AppError) return error
  if (error instanceof ZodError) return fromZodError(error)
  if (typeof error === 'object' && error !== null && 'type' in error) {
    const type = (error as { type: unknown }).type
    if (type === 'entity.parse.failed') return new AppError(400, 'BAD_REQUEST', 'The request body is not valid JSON.')
    if (type === 'entity.too.large') return new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.')
  }
  return null
}

/**
 * Single place that shapes every error response (docs/API-Requirements.md section 2.1).
 * Unexpected errors are logged with the request id, and the client only ever sees a generic message.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error)
    return
  }
  const requestId = String(req.id)
  const known = normalise(error)

  if (!known) {
    logger.error({ err: error, requestId }, 'Unhandled error')
    const body: ErrorBody = {
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', requestId },
    }
    res.status(500).json(body)
    return
  }

  const body: ErrorBody = {
    error: {
      code: known.code,
      message: known.message,
      ...(known.fields.length > 0 ? { fields: known.fields } : {}),
      ...(known.details !== undefined ? { details: known.details } : {}),
      requestId,
    },
  }
  res.status(known.status).json(body)
}
