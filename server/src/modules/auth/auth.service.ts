import { randomUUID } from 'node:crypto'
import { getPrisma } from '../../db/prisma.js'
import { AppError, forbidden, unauthenticated } from '../../lib/errors.js'
import { getEmailSender } from '../../lib/email/index.js'
import { otpEmail } from '../../lib/email/templates.js'
import { recordAudit } from './audit.js'
import { authConfig, HOUR, MINUTE, DAY } from './authConfig.js'
import { describeDevice } from './deviceLabel.js'
import { burnPasswordCheck, verifyPassword } from './password.js'
import { createSession, revokeSessionByToken } from './session.service.js'
import { hashOtp, hashToken, newOtpCode, newToken, safeEqual } from './tokens.js'

export interface ClientInfo {
  ip?: string | undefined
  userAgent?: string | undefined
}

export interface Profile {
  id: string
  email: string
  fullName: string
  isSuperAdmin: boolean
  tenant: { id: string; name: string } | null
  branch: { id: string; name: string; code: string } | null
  role: { key: string; name: string } | null
  permissions: string[]
  /** Sent back as `X-CSRF-Token` on every request that changes data. */
  csrfToken: string
}

export interface SignedIn {
  sessionToken: string
  /** Set when the user chose "trust this device"; the route puts it in an httpOnly cookie. */
  deviceToken?: string
  profile: Profile
}

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'The email or password is not correct.')
const invalidCode = (message = 'That code is not correct or has expired.') => new AppError(401, 'OTP_INVALID', message)

type SignInUser = {
  id: string
  tenantId: string | null
  isActive: boolean
  isSuperAdmin: boolean
  tenant: { status: string } | null
}

/** US-01.4 and US-01.5: a deactivated user or a suspended clinic cannot start a session. */
function assertMaySignIn(user: SignInUser): void {
  if (!user.isActive) throw forbidden('This account is deactivated. Please contact your clinic owner.')
  if (!user.isSuperAdmin && user.tenant?.status !== 'active') {
    throw new AppError(403, 'TENANT_SUSPENDED', 'This clinic is not active. Please contact support.')
  }
}

async function loadProfile(userId: string, csrfToken: string, permissions: Iterable<string>): Promise<Profile> {
  const user = await getPrisma().userAccount.findUniqueOrThrow({
    where: { id: userId },
    include: { tenant: true, branch: true, role: true },
  })
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    isSuperAdmin: user.isSuperAdmin,
    tenant: user.tenant ? { id: user.tenant.id, name: user.tenant.name } : null,
    branch: user.branch ? { id: user.branch.id, name: user.branch.name, code: user.branch.code } : null,
    role: user.role ? { key: user.role.key, name: user.role.name } : null,
    permissions: [...permissions].sort(),
    csrfToken,
  }
}

/** Permission keys of a user, read the same way the session middleware does. */
async function permissionsFor(userId: string): Promise<string[]> {
  const user = await getPrisma().userAccount.findUniqueOrThrow({
    where: { id: userId },
    select: {
      isSuperAdmin: true,
      role: { select: { permissions: { select: { permission: { select: { key: true } } } } } },
    },
  })
  if (user.isSuperAdmin) return ['platform.admin']
  return user.role?.permissions.map((row) => row.permission.key) ?? []
}

async function startSession(user: SignInUser & { id: string }, client: ClientInfo): Promise<SignedIn> {
  const { token, csrfToken } = await createSession(user.id)
  await getPrisma().userAccount.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await recordAudit({ action: 'auth.login', tenantId: user.tenantId, userId: user.id, ip: client.ip })
  return { sessionToken: token, profile: await loadProfile(user.id, csrfToken, await permissionsFor(user.id)) }
}

/**
 * AUTH-001 and AUTH-002. Checks the password, then either starts a session (trusted device) or emails a
 * code and answers 401 OTP_REQUIRED with the challenge id the client must send back.
 */
export async function login(
  input: { email: string; password: string; deviceToken?: string | undefined },
  client: ClientInfo,
): Promise<SignedIn> {
  const db = getPrisma()
  const user = await db.userAccount.findFirst({
    where: { email: { equals: input.email, mode: 'insensitive' } },
    include: { tenant: { select: { status: true } } },
  })

  if (!user) {
    await burnPasswordCheck(input.password)
    await recordAudit({ action: 'auth.login_failed', ip: client.ip })
    throw invalidCredentials()
  }

  // BR-AUTH-1: while locked, even the right password is refused (US-01.3).
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new AppError(403, 'ACCOUNT_LOCKED', 'Too many failed attempts. Please try again later.')
  }

  if (!(await verifyPassword(input.password, user.passwordHash))) {
    const { failedLoginCount } = await db.userAccount.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    })
    await recordAudit({ action: 'auth.login_failed', tenantId: user.tenantId, userId: user.id, ip: client.ip })
    if (failedLoginCount >= authConfig.maxFailedLogins) {
      await db.userAccount.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + authConfig.lockMinutes * MINUTE) },
      })
      await recordAudit({ action: 'auth.account_locked', tenantId: user.tenantId, userId: user.id, ip: client.ip })
    }
    throw invalidCredentials()
  }

  if (user.failedLoginCount > 0 || user.lockedUntil) {
    await db.userAccount.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } })
  }
  assertMaySignIn(user)

  if (input.deviceToken && (await touchTrustedDevice(user.id, input.deviceToken))) {
    return startSession(user, client)
  }

  const challengeId = await sendOtp(user.id, user.email, user.tenantId, client)
  throw new AppError(401, 'OTP_REQUIRED', 'We emailed you a 6-digit code. Enter it to finish signing in.', {
    details: { challengeId },
  })
}

/** True when the cookie names a live trusted device of this user; also records the use. */
async function touchTrustedDevice(userId: string, deviceToken: string): Promise<boolean> {
  const result = await getPrisma().trustedDevice.updateMany({
    where: { tokenHash: hashToken(deviceToken), userId, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { lastUsedAt: new Date() },
  })
  return result.count === 1
}

/** Creates a fresh code (older ones stop working), emails it, and returns the challenge id. */
async function sendOtp(userId: string, email: string, tenantId: string | null, client: ClientInfo): Promise<string> {
  const db = getPrisma()
  const now = Date.now()

  // Challenges expire after otpMinutes, so "created within the last hour" is "expires after now - (1h - otpMinutes)".
  const recent = await db.otpChallenge.count({
    where: { userId, expiresAt: { gt: new Date(now - HOUR + authConfig.otpMinutes * MINUTE) } },
  })
  if (recent >= authConfig.otpMaxPerHour) {
    throw new AppError(429, 'RATE_LIMITED', 'Too many codes requested. Please try again later.')
  }

  const code = newOtpCode()
  const challengeId = randomUUID()
  await db.$transaction([
    db.otpChallenge.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date(now) } }),
    db.otpChallenge.create({
      data: {
        id: challengeId,
        userId,
        codeHash: hashOtp(challengeId, code),
        expiresAt: new Date(now + authConfig.otpMinutes * MINUTE),
      },
    }),
  ])

  // An unconfigured or failing mail service answers 503 (see lib/email); the user can sign in again to retry.
  await getEmailSender().send(otpEmail(email, code, authConfig.otpMinutes), 'otp')
  await recordAudit({ action: 'auth.otp_sent', tenantId, userId, ip: client.ip })
  return challengeId
}

/** AUTH-002: checks the emailed code and completes the login. */
export async function verifyOtp(
  input: { challengeId: string; code: string; trustDevice: boolean },
  client: ClientInfo,
): Promise<SignedIn> {
  const db = getPrisma()
  const challenge = await db.otpChallenge.findUnique({
    where: { id: input.challengeId },
    include: { user: { include: { tenant: { select: { status: true } } } } },
  })
  const now = new Date()
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= now) throw invalidCode()
  if (challenge.attempts >= authConfig.otpMaxAttempts) {
    throw invalidCode('Too many wrong codes. Please request a new code.')
  }

  // Count the attempt before comparing, atomically, so parallel guesses cannot exceed the limit.
  const counted = await db.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, attempts: { lt: authConfig.otpMaxAttempts } },
    data: { attempts: { increment: 1 } },
  })
  if (counted.count !== 1) throw invalidCode('Too many wrong codes. Please request a new code.')

  const { user } = challenge
  if (!safeEqual(hashOtp(challenge.id, input.code), challenge.codeHash)) {
    await recordAudit({ action: 'auth.otp_failed', tenantId: user.tenantId, userId: user.id, ip: client.ip })
    throw invalidCode()
  }

  // Single use (US-02.6): only one request can flip consumed_at.
  const claimed = await db.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: now },
  })
  if (claimed.count !== 1) throw invalidCode()

  assertMaySignIn(user)

  let deviceToken: string | undefined
  if (input.trustDevice) {
    deviceToken = newToken()
    const device = await db.trustedDevice.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(deviceToken),
        label: describeDevice(client.userAgent),
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + authConfig.deviceTrustDays * DAY),
      },
    })
    await recordAudit({
      action: 'auth.device_trusted',
      tenantId: user.tenantId,
      userId: user.id,
      targetType: 'trusted_device',
      targetId: device.id,
      ip: client.ip,
    })
  }

  const signedIn = await startSession(user, client)
  return deviceToken ? { ...signedIn, deviceToken } : signedIn
}

/** AUTH-002 resend: a new code for the same sign-in attempt, spaced out and capped per hour. */
export async function resendOtp(challengeId: string, client: ClientInfo): Promise<{ challengeId: string }> {
  const challenge = await getPrisma().otpChallenge.findUnique({
    where: { id: challengeId },
    include: { user: { select: { id: true, email: true, tenantId: true, isActive: true } } },
  })
  const now = Date.now()
  // An old or finished attempt cannot be resent; the user starts again from the password step.
  const createdAt = challenge ? challenge.expiresAt.getTime() - authConfig.otpMinutes * MINUTE : 0
  // A finished or replaced attempt (consumed) cannot be resent either; the client uses the newest id.
  if (!challenge || challenge.consumedAt || !challenge.user.isActive || now - createdAt > HOUR) {
    throw invalidCode('This sign-in attempt has expired. Please sign in again.')
  }
  if (now - createdAt < authConfig.otpResendSeconds * 1000) {
    throw new AppError(
      429,
      'RATE_LIMITED',
      `Please wait ${authConfig.otpResendSeconds} seconds before asking for another code.`,
    )
  }
  const { user } = challenge
  return { challengeId: await sendOtp(user.id, user.email, user.tenantId, client) }
}

export async function logout(
  sessionToken: string,
  userId: string,
  tenantId: string | null,
  client: ClientInfo,
): Promise<void> {
  await revokeSessionByToken(sessionToken)
  await recordAudit({ action: 'auth.logout', tenantId, userId, ip: client.ip })
}

/** GET /auth/me: the session's own user, with the CSRF token so a reloaded page can keep working. */
export async function getProfile(userId: string, csrfToken: string): Promise<Profile> {
  const user = await getPrisma().userAccount.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw unauthenticated()
  return loadProfile(userId, csrfToken, await permissionsFor(userId))
}
