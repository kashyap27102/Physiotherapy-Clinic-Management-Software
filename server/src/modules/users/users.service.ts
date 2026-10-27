import type { AuthContext } from '../../auth/context.js'
import { getPrisma } from '../../db/prisma.js'
import type { TenantDb } from '../../db/tenantScope.js'
import { Prisma } from '../../generated/prisma/client.js'
import { appLink } from '../../lib/appLink.js'
import { getEmailSender } from '../../lib/email/index.js'
import { invitationEmail } from '../../lib/email/templates.js'
import { AppError, notFound, validationError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { recordAudit } from '../auth/audit.js'
import { DAY } from '../auth/authConfig.js'
import { hashPassword } from '../auth/password.js'
import { revokeUserSessions } from '../auth/session.service.js'
import { hashToken, newToken } from '../auth/tokens.js'

/** Roles an owner can give to staff (USR-001). There is one owner per clinic until multi-owner is decided. */
export const STAFF_ROLES = ['receptionist', 'physiotherapist'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

const INVITATION_DAYS = 7

export interface StaffView {
  id: string
  fullName: string
  email: string
  role: { key: string; name: string }
  /** Null for the owner, who works across branches (BR-USR-1). */
  branch: { id: string; name: string; code: string } | null
  isActive: boolean
  lastLoginAt: Date | null
  /** Invited but has not signed in yet. */
  invited: boolean
}

const select = {
  id: true,
  fullName: true,
  email: true,
  isActive: true,
  lastLoginAt: true,
  role: { select: { key: true, name: true } },
  branch: { select: { id: true, name: true, code: true } },
} as const

type Row = {
  id: string
  fullName: string
  email: string
  isActive: boolean
  lastLoginAt: Date | null
  role: { key: string; name: string } | null
  branch: { id: string; name: string; code: string } | null
}

const toView = (row: Row): StaffView => ({
  id: row.id,
  fullName: row.fullName,
  email: row.email,
  role: row.role ?? { key: 'owner', name: 'Owner' },
  branch: row.branch,
  isActive: row.isActive,
  lastLoginAt: row.lastLoginAt,
  invited: row.lastLoginAt === null,
})

export interface StaffFilter {
  role?: string | undefined
  branchId?: string | undefined
  active?: boolean | undefined
}

/** GET /users (USR-001): filter by role, branch and active. */
export async function listStaff(db: TenantDb, filter: StaffFilter): Promise<StaffView[]> {
  const rows = await db.userAccount.findMany({
    where: {
      ...(filter.role ? { role: { key: filter.role } } : {}),
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(filter.active === undefined ? {} : { isActive: filter.active }),
    },
    select,
    orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
  })
  return rows.map(toView)
}

async function findUser(db: TenantDb, id: string): Promise<Row> {
  // A user of another clinic is simply not found, so it answers 404.
  const row = await db.userAccount.findFirst({ where: { id }, select })
  if (!row) throw notFound('Staff member not found.')
  return row
}

/** The branch must belong to this clinic and be active; one branch each (BR-USR-1, US-06.2). */
async function requireActiveBranch(db: TenantDb, branchId: string): Promise<void> {
  const branch = await db.branch.findFirst({ where: { id: branchId, isActive: true }, select: { id: true } })
  if (!branch) throw validationError([{ field: 'branchId', message: 'Choose an active branch.' }])
}

const emailTaken = () =>
  validationError([{ field: 'email', message: 'This email already has an account. Use a different one.' }])

/**
 * Gives a staff member a link to choose their password. It reuses the reset-token table: the link works once, and
 * only the newest one does. The user starts with an unusable password, so nothing works until the link is used.
 */
async function sendInvitation(user: { id: string; email: string }, clinicName: string): Promise<void> {
  const db = getPrisma()
  const token = newToken()
  await db.$transaction([
    db.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITATION_DAYS * DAY) },
    }),
  ])
  await getEmailSender().send(
    invitationEmail(user.email, clinicName, appLink('/accept-invitation', { token }), INVITATION_DAYS),
    'invitation',
  )
}

async function clinicName(db: TenantDb): Promise<string> {
  const clinic = await db.tenant.findFirst({ select: { name: true } })
  return clinic?.name ?? 'your clinic'
}

/**
 * POST /users (USR-001, US-06.1): creates the account and emails an invitation. If the email cannot be sent the
 * account still exists and `invitationSent` is false, so the owner can use "Resend invitation".
 */
export async function createStaff(
  db: TenantDb,
  auth: AuthContext,
  input: { fullName: string; email: string; role: StaffRole; branchId: string },
  ip: string | undefined,
): Promise<{ staff: StaffView; invitationSent: boolean }> {
  await requireActiveBranch(db, input.branchId)
  const exists = await getPrisma().userAccount.findFirst({
    where: { email: { equals: input.email, mode: 'insensitive' } },
    select: { id: true },
  })
  if (exists) throw emailTaken()

  const role = await db.role.findFirst({ where: { key: input.role }, select: { id: true } })
  if (!role) throw notFound('Role not found.')

  let row: Row
  try {
    row = await db.userAccount.create({
      data: {
        roleId: role.id,
        branchId: input.branchId,
        email: input.email,
        fullName: input.fullName,
        // Unusable until the invitation link sets a real one.
        passwordHash: await hashPassword(newToken()),
      } as Prisma.UserAccountUncheckedCreateInput,
      select,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw emailTaken()
    throw error
  }
  await recordAudit({
    action: 'user.created',
    tenantId: auth.tenantId,
    userId: auth.userId,
    targetType: 'user',
    targetId: row.id,
    details: { role: input.role, branchId: input.branchId },
    ip,
  })

  let invitationSent = true
  try {
    await sendInvitation(row, await clinicName(db))
    await recordAudit({
      action: 'user.invitation_sent',
      tenantId: auth.tenantId,
      userId: auth.userId,
      targetType: 'user',
      targetId: row.id,
      ip,
    })
  } catch (error) {
    invitationSent = false
    logger.error({ err: error }, 'Staff invitation email could not be sent')
  }
  return { staff: toView(row), invitationSent }
}

export interface StaffChanges {
  fullName?: string
  role?: StaffRole
  branchId?: string
}

/**
 * PATCH /users/:id (USR-001). Moving a branch is a reassignment by the owner (BR-USR-3): old records keep their
 * branch tag, new work uses the new branch (US-06.5). The owner's role and branch are fixed (BR-USR-4).
 */
export async function updateStaff(
  db: TenantDb,
  auth: AuthContext,
  id: string,
  changes: StaffChanges,
  ip: string | undefined,
): Promise<StaffView> {
  const before = await findUser(db, id)
  const isOwner = before.role?.key === 'owner'
  if (isOwner && (changes.role !== undefined || changes.branchId !== undefined)) {
    throw validationError([
      {
        field: changes.role === undefined ? 'branchId' : 'role',
        message: 'The owner’s role and branch cannot change.',
      },
    ])
  }
  if (changes.branchId !== undefined && changes.branchId !== before.branch?.id) {
    await requireActiveBranch(db, changes.branchId)
  }

  let roleId: string | undefined
  if (changes.role !== undefined && changes.role !== before.role?.key) {
    const role = await db.role.findFirst({ where: { key: changes.role }, select: { id: true } })
    if (!role) throw notFound('Role not found.')
    roleId = role.id
  }

  const after = await db.userAccount.update({
    where: { id },
    data: {
      ...(changes.fullName === undefined ? {} : { fullName: changes.fullName }),
      ...(roleId === undefined ? {} : { roleId }),
      ...(changes.branchId === undefined ? {} : { branchId: changes.branchId }),
    },
    select,
  })

  const diff: { before: Record<string, unknown>; after: Record<string, unknown> } = { before: {}, after: {} }
  if (after.fullName !== before.fullName) {
    diff.before['fullName'] = before.fullName
    diff.after['fullName'] = after.fullName
  }
  if (after.role?.key !== before.role?.key) {
    diff.before['role'] = before.role?.key
    diff.after['role'] = after.role?.key
  }
  if (after.branch?.id !== before.branch?.id) {
    diff.before['branch'] = before.branch?.code
    diff.after['branch'] = after.branch?.code
  }
  if (Object.keys(diff.after).length > 0) {
    await recordAudit({
      action: 'user.updated',
      tenantId: auth.tenantId,
      userId: auth.userId,
      targetType: 'user',
      targetId: id,
      details: diff as Prisma.InputJsonValue,
      ip,
    })
  }
  return toView(after)
}

/**
 * POST /users/:id/deactivate (US-06.3, US-06.4). They can no longer sign in and their sessions end at once; their
 * past entries keep their name (BR-USR-2). The last active owner cannot be deactivated.
 */
export async function deactivateStaff(
  db: TenantDb,
  auth: AuthContext,
  id: string,
  ip: string | undefined,
): Promise<StaffView> {
  const user = await findUser(db, id)
  if (!user.isActive) return toView(user)
  if (user.role?.key === 'owner') {
    const otherOwners = await db.userAccount.count({
      where: { id: { not: id }, isActive: true, role: { key: 'owner' } },
    })
    if (otherOwners === 0) {
      throw new AppError(
        409,
        'LAST_OWNER',
        'A clinic needs at least one active owner, so this account cannot be deactivated.',
      )
    }
  }
  const row = await db.userAccount.update({ where: { id }, data: { isActive: false }, select })
  await revokeUserSessions(id)
  await recordAudit({
    action: 'user.deactivated',
    tenantId: auth.tenantId,
    userId: auth.userId,
    targetType: 'user',
    targetId: id,
    ip,
  })
  return toView(row)
}

export async function reactivateStaff(
  db: TenantDb,
  auth: AuthContext,
  id: string,
  ip: string | undefined,
): Promise<StaffView> {
  const user = await findUser(db, id)
  if (user.isActive) return toView(user)
  // A deactivated staff member's branch may have been deactivated since; they need an active one to work.
  if (user.branch) {
    const branch = await db.branch.findFirst({ where: { id: user.branch.id }, select: { isActive: true } })
    if (!branch?.isActive) {
      throw validationError([
        { field: 'branchId', message: 'Their branch is inactive. Move them to an active branch first.' },
      ])
    }
  }
  const row = await db.userAccount.update({ where: { id }, data: { isActive: true }, select })
  await recordAudit({
    action: 'user.reactivated',
    tenantId: auth.tenantId,
    userId: auth.userId,
    targetType: 'user',
    targetId: id,
    ip,
  })
  return toView(row)
}

/** POST /users/:id/resend-invitation: for staff who have not set a password yet. A new link replaces the old one. */
export async function resendInvitation(
  db: TenantDb,
  auth: AuthContext,
  id: string,
  ip: string | undefined,
): Promise<void> {
  const user = await findUser(db, id)
  if (!user.isActive || user.lastLoginAt !== null) {
    throw new AppError(409, 'BAD_REQUEST', 'This person has already signed in. They can reset their password instead.')
  }
  await sendInvitation(user, await clinicName(db))
  await recordAudit({
    action: 'user.invitation_sent',
    tenantId: auth.tenantId,
    userId: auth.userId,
    targetType: 'user',
    targetId: id,
    ip,
  })
}
