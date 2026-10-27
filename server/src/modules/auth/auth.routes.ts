import { Router, type Request } from 'express'
import { requireAuthContext } from '../../auth/context.js'
import { env } from '../../config/env.js'
import { parseInput, unauthenticated } from '../../lib/errors.js'
import { createRateLimiter } from '../../middleware/rateLimit.js'
import { requirePermission, requireSignedIn } from '../../middleware/authorize.js'
import { authConfig } from './authConfig.js'
import {
  changeBody,
  deviceParams,
  forgotBody,
  loginBody,
  otpResendBody,
  otpVerifyBody,
  resetBody,
  userDeviceParams,
  userParams,
} from './auth.schemas.js'
import * as authService from './auth.service.js'
import { clearSessionCookie, readCookie, setDeviceCookie, setSessionCookie } from './cookies.js'
import { listDevices, requireClinicUser, revokeDevice } from './devices.service.js'
import { changePassword, requestPasswordReset, resetPassword } from './password.service.js'

interface AuthLimits {
  login: number
  otpVerify: number
  otpResend: number
  forgot: number
  reset: number
  change: number
}

const MINUTES = 60_000

/**
 * Per-IP limits on top of the per-account controls (lockout, code attempts, resend caps) — PRD SEC-004,
 * API-AUTH-7. They are generous for a clinic behind one shared address but stop scripted guessing.
 */
export const defaultAuthLimits: AuthLimits =
  env.NODE_ENV === 'test'
    ? { login: 10_000, otpVerify: 10_000, otpResend: 10_000, forgot: 10_000, reset: 10_000, change: 10_000 }
    : { login: 30, otpVerify: 30, otpResend: 10, forgot: 10, reset: 20, change: 10 }

const clientOf = (req: Request): authService.ClientInfo => ({ ip: req.ip, userAgent: req.get('user-agent') })

export function createAuthRouter(limits: AuthLimits = defaultAuthLimits): Router {
  const router = Router()
  const limiter = (limit: number, minutes: number) => createRateLimiter({ windowMs: minutes * MINUTES, limit })
  const limit = {
    login: limiter(limits.login, 15),
    otpVerify: limiter(limits.otpVerify, 10),
    otpResend: limiter(limits.otpResend, 10),
    forgot: limiter(limits.forgot, 15),
    reset: limiter(limits.reset, 15),
    change: limiter(limits.change, 15),
  }

  function finishSignIn(res: Parameters<typeof setSessionCookie>[0], signedIn: authService.SignedIn) {
    setSessionCookie(res, signedIn.sessionToken)
    if (signedIn.deviceToken) setDeviceCookie(res, signedIn.deviceToken)
    res.json(signedIn.profile)
  }

  // AUTH-001: answers 200 with the profile, or 401 OTP_REQUIRED with details.challengeId.
  router.post('/auth/login', limit.login, async (req, res) => {
    const body = parseInput(loginBody, req.body)
    const deviceToken = readCookie(req, authConfig.deviceCookie)
    finishSignIn(res, await authService.login({ ...body, deviceToken }, clientOf(req)))
  })

  // AUTH-002
  router.post('/auth/otp/verify', limit.otpVerify, async (req, res) => {
    finishSignIn(res, await authService.verifyOtp(parseInput(otpVerifyBody, req.body), clientOf(req)))
  })

  router.post('/auth/otp/resend', limit.otpResend, async (req, res) => {
    const { challengeId } = parseInput(otpResendBody, req.body)
    res.json(await authService.resendOtp(challengeId, clientOf(req)))
  })

  router.post('/auth/logout', requireSignedIn, async (req, res) => {
    const auth = requireAuthContext(req)
    const token = readCookie(req, authConfig.sessionCookie)
    if (token) await authService.logout(token, auth.userId, auth.tenantId, clientOf(req))
    clearSessionCookie(res)
    res.status(204).end()
  })

  router.get('/auth/me', requireSignedIn, async (req, res) => {
    const auth = requireAuthContext(req)
    if (!req.authSession) throw unauthenticated()
    res.json(await authService.getProfile(auth.userId, req.authSession.csrfToken))
  })

  // AUTH-004
  router.post('/auth/password/forgot', limit.forgot, async (req, res) => {
    const { email } = parseInput(forgotBody, req.body)
    await requestPasswordReset(email, clientOf(req))
    res.status(202).json({ message: 'If the account exists, an email with a reset link has been sent.' })
  })

  router.post('/auth/password/reset', limit.reset, async (req, res) => {
    await resetPassword(parseInput(resetBody, req.body), clientOf(req))
    res.json({ message: 'Your password has been changed. Please sign in.' })
  })

  router.post('/auth/password/change', requireSignedIn, limit.change, async (req, res) => {
    const auth = requireAuthContext(req)
    if (!req.authSession) throw unauthenticated()
    const body = parseInput(changeBody, req.body)
    await changePassword({ userId: auth.userId, sessionId: req.authSession.id, ...body }, clientOf(req))
    res.json({ message: 'Your password has been changed. Your other devices were signed out.' })
  })

  // AUTH-003: own devices
  router.get('/auth/devices', requireSignedIn, async (req, res) => {
    const auth = requireAuthContext(req)
    res.json({ devices: await listDevices(auth.userId, readCookie(req, authConfig.deviceCookie)) })
  })

  router.delete('/auth/devices/:id', requireSignedIn, async (req, res) => {
    const auth = requireAuthContext(req)
    const { id } = parseInput(deviceParams, req.params)
    await revokeDevice(
      {
        actor: auth,
        targetUserId: auth.userId,
        deviceId: id,
        ...(req.authSession ? { keepSessionId: req.authSession.id } : {}),
      },
      clientOf(req),
    )
    res.status(204).end()
  })

  // AUTH-003: the owner looks at and revokes a colleague's devices (US-03.3, US-03.4)
  router.get('/users/:userId/devices', requirePermission('device.manage'), async (req, res) => {
    const auth = requireAuthContext(req)
    const { userId } = parseInput(userParams, req.params)
    if (auth.tenantId) await requireClinicUser(auth.tenantId, userId)
    res.json({ devices: await listDevices(userId) })
  })

  router.delete('/users/:userId/devices/:id', requirePermission('device.manage'), async (req, res) => {
    const auth = requireAuthContext(req)
    const { userId, id } = parseInput(userDeviceParams, req.params)
    if (!auth.tenantId) throw unauthenticated()
    await requireClinicUser(auth.tenantId, userId)
    await revokeDevice(
      {
        actor: auth,
        targetUserId: userId,
        deviceId: id,
        ...(userId === auth.userId && req.authSession ? { keepSessionId: req.authSession.id } : {}),
      },
      clientOf(req),
    )
    res.status(204).end()
  })

  return router
}
