import { timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'
import { env } from '../config/env.js'
import { AppError } from '../lib/errors.js'
import { authConfig } from '../modules/auth/authConfig.js'
import { clearSessionCookie, readCookie } from '../modules/auth/cookies.js'
import { resolveSession } from '../modules/auth/session.service.js'

/**
 * Turns the session cookie into `req.auth`. This is the only place that sets it. A missing, expired or revoked
 * session simply leaves the request anonymous, and routes that need a user answer 401 through `requireSignedIn`
 * or `requirePermission`.
 */
export const sessionMiddleware: RequestHandler = async (req, res, next) => {
  const token = readCookie(req, authConfig.sessionCookie)
  if (!token) {
    next()
    return
  }
  const resolved = await resolveSession(token)
  if (!resolved) {
    clearSessionCookie(res)
    next()
    return
  }
  req.auth = resolved.auth
  req.authSession = { id: resolved.sessionId, csrfToken: resolved.csrfToken }
  next()
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const csrfFailure = () =>
  new AppError(403, 'PERMISSION_DENIED', 'The security check failed. Refresh the page and try again.')

/**
 * CSRF defence for cookie sessions (PRD SEC-005, API-AUTH-1), two layers:
 *  1. A browser that sends an Origin header must send one of our own client origins.
 *  2. A signed-in request that changes data must echo the session's CSRF token in `X-CSRF-Token`.
 *     The token is only ever handed to the signed-in page (login and /auth/me), never in a cookie.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next()
    return
  }
  const origin = req.headers.origin
  if (origin && !env.CORS_ORIGINS.includes(origin)) {
    next(csrfFailure())
    return
  }
  if (req.authSession) {
    const sent = req.get('x-csrf-token') ?? ''
    const expected = req.authSession.csrfToken
    const ok = sent.length === expected.length && timingSafeEqual(Buffer.from(sent), Buffer.from(expected))
    if (!ok) {
      next(csrfFailure())
      return
    }
  }
  next()
}
