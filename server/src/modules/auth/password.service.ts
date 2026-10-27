import { getPrisma } from '../../db/prisma.js'
import { env } from '../../config/env.js'
import { getEmailSender } from '../../lib/email/index.js'
import { passwordResetEmail } from '../../lib/email/templates.js'
import { AppError, validationError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { recordAudit } from './audit.js'
import { authConfig, HOUR, MINUTE } from './authConfig.js'
import type { ClientInfo } from './auth.service.js'
import { hashPassword, passwordProblem, verifyPassword } from './password.js'
import { revokeUserSessions } from './session.service.js'
import { hashToken, newToken } from './tokens.js'

function newPasswordProblem(password: string, email: string): void {
  const problem = passwordProblem(password, email)
  if (problem) throw validationError([{ field: 'newPassword', message: problem }])
}

function resetLink(token: string): string {
  const base = env.APP_URL ?? env.CORS_ORIGINS[0] ?? 'http://localhost:5173'
  const url = new URL('/reset-password', base)
  url.searchParams.set('token', token)
  return url.toString()
}

/**
 * AUTH-004, step 1. Always completes the same way whether or not the email has an account (US-03a.1), so the
 * caller learns nothing. Sending problems are logged, never reported, for the same reason.
 */
export async function requestPasswordReset(email: string, client: ClientInfo): Promise<void> {
  const db = getPrisma()
  const user = await db.userAccount.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, isActive: true },
    select: { id: true, email: true, tenantId: true },
  })
  if (!user) return

  // Reset tokens live resetMinutes, so "created within the last hour" is "expires after now - (1h - resetMinutes)".
  const now = Date.now()
  const recent = await db.passwordResetToken.count({
    where: { userId: user.id, expiresAt: { gt: new Date(now - HOUR + authConfig.resetMinutes * MINUTE) } },
  })
  if (recent >= authConfig.resetMaxPerHour) return

  const token = newToken()
  await db.$transaction([
    // Only the newest link works.
    db.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date(now) } }),
    db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(now + authConfig.resetMinutes * MINUTE),
      },
    }),
  ])
  await recordAudit({
    action: 'auth.password_reset_requested',
    tenantId: user.tenantId,
    userId: user.id,
    ip: client.ip,
  })
  try {
    await getEmailSender().send(
      passwordResetEmail(user.email, resetLink(token), authConfig.resetMinutes),
      'password-reset',
    )
  } catch (error) {
    logger.error({ err: error }, 'Password reset email could not be sent')
  }
}

/** AUTH-004, step 2: the link is single use and short lived; every session of the user ends. */
export async function resetPassword(input: { token: string; newPassword: string }, client: ClientInfo): Promise<void> {
  const db = getPrisma()
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
    include: { user: { select: { id: true, email: true, tenantId: true, isActive: true } } },
  })
  const expired = new AppError(400, 'BAD_REQUEST', 'This link is not valid any more. Ask for a new one.')
  if (!record || record.usedAt || record.expiresAt <= new Date() || !record.user.isActive) throw expired

  newPasswordProblem(input.newPassword, record.user.email)
  const passwordHash = await hashPassword(input.newPassword)

  // Whoever flips used_at first wins; a second use of the same link fails (US-03a.2).
  const claimed = await db.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  })
  if (claimed.count !== 1) throw expired

  await db.userAccount.update({
    where: { id: record.user.id },
    data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
  })
  await revokeUserSessions(record.user.id)
  await recordAudit({
    action: 'auth.password_reset',
    tenantId: record.user.tenantId,
    userId: record.user.id,
    ip: client.ip,
  })
}

/** AUTH-004 change: needs the current password; the user's other sessions end (US-03a.4). */
export async function changePassword(
  input: { userId: string; sessionId: string; currentPassword: string; newPassword: string },
  client: ClientInfo,
): Promise<void> {
  const db = getPrisma()
  const user = await db.userAccount.findUniqueOrThrow({
    where: { id: input.userId },
    select: { id: true, email: true, tenantId: true, passwordHash: true },
  })
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw validationError([{ field: 'currentPassword', message: 'That is not your current password.' }])
  }
  newPasswordProblem(input.newPassword, user.email)
  if (input.newPassword === input.currentPassword) {
    throw validationError([{ field: 'newPassword', message: 'Choose a password you have not used just now.' }])
  }

  await db.userAccount.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword) } })
  await revokeUserSessions(user.id, input.sessionId)
  await recordAudit({ action: 'auth.password_changed', tenantId: user.tenantId, userId: user.id, ip: client.ip })
}
