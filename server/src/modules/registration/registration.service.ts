import { randomUUID } from 'node:crypto'
import { ROLE_TEMPLATES } from '../../auth/roleTemplates.js'
import { getPrisma } from '../../db/prisma.js'
import { Prisma } from '../../generated/prisma/client.js'
import { appLink } from '../../lib/appLink.js'
import { getEmailSender } from '../../lib/email/index.js'
import { accountExistsEmail, registrationCodeEmail } from '../../lib/email/templates.js'
import { AppError, validationError } from '../../lib/errors.js'
import { recordAudit } from '../auth/audit.js'
import { authConfig, DAY, HOUR, MINUTE } from '../auth/authConfig.js'
import { signInAfterCode, type ClientInfo, type SignedIn } from '../auth/auth.service.js'
import { hashPassword, passwordProblem } from '../auth/password.js'
import { hashOtp, newOtpCode, safeEqual } from '../auth/tokens.js'

/**
 * Clinic self-registration (TEN-001, revised 2026-10-27: clinics sign up themselves instead of being created by the
 * super-admin). Creating a clinic is a platform action, not a tenant one, so this module uses the unscoped client,
 * like the auth module. Nothing exists until the emailed code is verified.
 */

const TRIAL_DAYS = 14
const DEFAULT_PLAN = 'Pilot'
const MAX_SIGNUPS_PER_EMAIL_PER_HOUR = 5

const invalidCode = (message = 'That code is not correct or has expired.') => new AppError(401, 'OTP_INVALID', message)
const tooMany = (message: string) => new AppError(429, 'RATE_LIMITED', message)

export interface RegisterInput {
  clinicName: string
  fullName: string
  email: string
  phone: string
  password: string
}

/**
 * Step 1. Emails a 6-digit code and returns the id the client sends back with it. When the email already has an
 * account, that person gets a "you already have an account" email instead and the caller gets an id that never
 * verifies, so the page cannot be used to find out who is registered.
 */
export async function startRegistration(input: RegisterInput): Promise<{ registrationId: string }> {
  const problem = passwordProblem(input.password, input.email)
  if (problem) throw validationError([{ field: 'password', message: problem }])

  const db = getPrisma()
  const now = Date.now()
  const recent = await db.pendingRegistration.count({
    where: { email: { equals: input.email, mode: 'insensitive' }, createdAt: { gt: new Date(now - HOUR) } },
  })
  if (recent >= MAX_SIGNUPS_PER_EMAIL_PER_HOUR) {
    throw tooMany('Too many sign-up attempts for this email. Please try again later.')
  }

  // Hash first in both branches so both take the same time.
  const passwordHash = await hashPassword(input.password)
  const existing = await db.userAccount.findFirst({
    where: { email: { equals: input.email, mode: 'insensitive' } },
    select: { id: true },
  })
  if (existing) {
    await getEmailSender().send(
      accountExistsEmail(input.email, appLink('/login'), appLink('/forgot-password')),
      'other',
    )
    return { registrationId: randomUUID() }
  }

  const id = randomUUID()
  const code = newOtpCode()
  await db.$transaction([
    // Only the newest sign-up for an email can be completed.
    db.pendingRegistration.updateMany({
      where: { email: { equals: input.email, mode: 'insensitive' }, consumedAt: null },
      data: { consumedAt: new Date(now) },
    }),
    db.pendingRegistration.create({
      data: {
        id,
        email: input.email,
        clinicName: input.clinicName,
        fullName: input.fullName,
        phone: input.phone,
        passwordHash,
        codeHash: hashOtp(id, code),
        expiresAt: new Date(now + authConfig.otpMinutes * MINUTE),
      },
    }),
  ])
  // Unconfigured or failing email answers 503; the person can submit the form again.
  await getEmailSender().send(registrationCodeEmail(input.email, code, authConfig.otpMinutes), 'otp')
  return { registrationId: id }
}

/** A new code for the same sign-up, spaced out and capped like the login code (AUTH-002). */
export async function resendRegistrationCode(registrationId: string): Promise<{ registrationId: string }> {
  const db = getPrisma()
  const row = await db.pendingRegistration.findUnique({ where: { id: registrationId } })
  // Unknown ids (including the decoy for an existing account) look like a normal resend.
  if (!row || row.consumedAt) return { registrationId }

  const now = Date.now()
  if (now - row.lastSentAt.getTime() < authConfig.otpResendSeconds * 1000) {
    throw tooMany(`Please wait ${authConfig.otpResendSeconds} seconds before asking for another code.`)
  }
  if (row.sendCount >= authConfig.otpMaxPerHour) throw tooMany('Too many codes requested. Please start again later.')

  const code = newOtpCode()
  await db.pendingRegistration.update({
    where: { id: row.id },
    data: {
      codeHash: hashOtp(row.id, code),
      attempts: 0,
      sendCount: { increment: 1 },
      lastSentAt: new Date(now),
      expiresAt: new Date(now + authConfig.otpMinutes * MINUTE),
    },
  })
  await getEmailSender().send(registrationCodeEmail(row.email, code, authConfig.otpMinutes), 'otp')
  return { registrationId }
}

/**
 * Step 2. Checks the code (single use, five attempts), then creates in one transaction: the clinic, its 14-day
 * trial, the three roles with default permissions (BR-USR-7) and the owner account. The owner is signed in.
 */
export async function completeRegistration(
  input: { registrationId: string; code: string; trustDevice: boolean },
  client: ClientInfo,
): Promise<SignedIn> {
  const db = getPrisma()
  const row = await db.pendingRegistration.findUnique({ where: { id: input.registrationId } })
  if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now()) throw invalidCode()
  if (row.attempts >= authConfig.otpMaxAttempts) throw invalidCode('Too many wrong codes. Please request a new code.')

  const counted = await db.pendingRegistration.updateMany({
    where: { id: row.id, consumedAt: null, attempts: { lt: authConfig.otpMaxAttempts } },
    data: { attempts: { increment: 1 } },
  })
  if (counted.count !== 1) throw invalidCode('Too many wrong codes. Please request a new code.')
  if (!safeEqual(hashOtp(row.id, input.code), row.codeHash)) throw invalidCode()

  const claimed = await db.pendingRegistration.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  if (claimed.count !== 1) throw invalidCode()

  let owner: { id: string; tenantId: string | null }
  try {
    owner = await db.$transaction(async (tx) => {
      const plan =
        (await tx.plan.findFirst({ where: { name: DEFAULT_PLAN, isActive: true } })) ??
        (await tx.plan.create({ data: { name: DEFAULT_PLAN } }))
      const tenant = await tx.tenant.create({ data: { name: row.clinicName, phone: row.phone } })
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: 'trial',
          trialEndsOn: new Date(Date.now() + TRIAL_DAYS * DAY),
        },
      })

      const catalogue = await tx.permission.findMany({ select: { id: true, key: true } })
      const permissionId = new Map(catalogue.map((p) => [p.key, p.id]))
      let ownerRoleId = ''
      for (const key of ['owner', 'receptionist', 'physiotherapist'] as const) {
        const template = ROLE_TEMPLATES[key]
        const role = await tx.role.create({ data: { tenantId: tenant.id, key, name: template.name } })
        await tx.rolePermission.createMany({
          data: template.permissions.flatMap((permission) => {
            const id = permissionId.get(permission)
            return id ? [{ roleId: role.id, permissionId: id }] : []
          }),
        })
        if (key === 'owner') ownerRoleId = role.id
      }

      return tx.userAccount.create({
        data: {
          tenantId: tenant.id,
          roleId: ownerRoleId,
          email: row.email,
          fullName: row.fullName,
          passwordHash: row.passwordHash,
        },
        select: { id: true, tenantId: true },
      })
    })
  } catch (error) {
    // Someone else registered this email between the two steps; the unique index on lower(email) caught it.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'BAD_REQUEST', 'An account with this email already exists. Please sign in.')
    }
    throw error
  }

  await recordAudit({
    action: 'tenant.registered',
    tenantId: owner.tenantId,
    userId: owner.id,
    targetType: 'tenant',
    ...(owner.tenantId ? { targetId: owner.tenantId } : {}),
    details: { trialDays: TRIAL_DAYS },
    ip: client.ip,
  })
  return signInAfterCode(owner, input.trustDevice, client)
}
