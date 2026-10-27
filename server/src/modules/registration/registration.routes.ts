import { Router, type Request } from 'express'
import { env } from '../../config/env.js'
import { parseInput } from '../../lib/errors.js'
import { createRateLimiter } from '../../middleware/rateLimit.js'
import type { ClientInfo } from '../auth/auth.service.js'
import { setDeviceCookie, setSessionCookie } from '../auth/cookies.js'
import { registerBody, registrationResendBody, registrationVerifyBody } from './registration.schemas.js'
import { completeRegistration, resendRegistrationCode, startRegistration } from './registration.service.js'

interface RegistrationLimits {
  register: number
  verify: number
  resend: number
}

/** Per-IP limits (SEC-004); the service adds per-email and per-sign-up caps. */
export const defaultRegistrationLimits: RegistrationLimits =
  env.NODE_ENV === 'test'
    ? { register: 10_000, verify: 10_000, resend: 10_000 }
    : { register: 10, verify: 30, resend: 10 }

const clientOf = (req: Request): ClientInfo => ({ ip: req.ip, userAgent: req.get('user-agent') })

/** Public clinic sign-up (TEN-001, self-registration). */
export function createRegistrationRouter(limits: RegistrationLimits = defaultRegistrationLimits): Router {
  const router = Router()
  const per15Minutes = (limit: number) => createRateLimiter({ windowMs: 15 * 60_000, limit })

  // 202 with a registration id in every case; the code arrives by email.
  router.post('/auth/register', per15Minutes(limits.register), async (req, res) => {
    const { acceptTerms: _accepted, ...input } = parseInput(registerBody, req.body)
    res.status(202).json(await startRegistration(input))
  })

  router.post('/auth/register/verify', per15Minutes(limits.verify), async (req, res) => {
    const signedIn = await completeRegistration(parseInput(registrationVerifyBody, req.body), clientOf(req))
    setSessionCookie(res, signedIn.sessionToken)
    if (signedIn.deviceToken) setDeviceCookie(res, signedIn.deviceToken)
    res.status(201).json(signedIn.profile)
  })

  router.post('/auth/register/resend', per15Minutes(limits.resend), async (req, res) => {
    const { registrationId } = parseInput(registrationResendBody, req.body)
    res.json(await resendRegistrationCode(registrationId))
  })

  return router
}
