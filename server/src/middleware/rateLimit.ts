import { rateLimit } from 'express-rate-limit'
import { AppError } from '../lib/errors.js'

interface LimiterOptions {
  windowMs?: number
  limit: number
}

/**
 * Per-IP limiter that answers in the standard API error format.
 * Auth routes will get a much stricter instance later (PRD SEC-004).
 */
export function createRateLimiter({ windowMs = 60_000, limit }: LimiterOptions) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again shortly.')),
  })
}
