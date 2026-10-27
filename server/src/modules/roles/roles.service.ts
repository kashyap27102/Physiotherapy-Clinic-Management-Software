import type { AuthContext } from '../../auth/context.js'
import { isPermissionKey, type PermissionKey } from '../../auth/permissionKeys.js'
import { getPrisma } from '../../db/prisma.js'
import type { TenantDb } from '../../db/tenantScope.js'
import { AppError, notFound, validationError } from '../../lib/errors.js'
import { recordAudit } from '../auth/audit.js'

export interface RoleView {
  id: string
  key: string
  name: string
  /** The owner role always holds everything and cannot be edited (BR-USR-4). */
  editable: boolean
  permissions: PermissionKey[]
  userCount: number
}

/**
 * Permissions without which day-to-day work stops for staff. If a change would leave only the owner able to do one of
 * these, the owner is warned first (PRD USR-002 lock-out protection, US-07.4).
 */
const CRITICAL: Partial<Record<PermissionKey, string>> = {
  'payment.record': 'record payments',
  'visit.mark': 'mark attendance',
  'patient.register': 'register patients',
  'patient.view': 'search and open patients',
}

export interface PermissionWarning {
  permission: PermissionKey
  message: string
}

const select = {
  id: true,
  key: true,
  name: true,
  permissions: { select: { permission: { select: { key: true } } } },
  _count: { select: { users: true } },
} as const

type Row = {
  id: string
  key: string
  name: string
  permissions: { permission: { key: string } }[]
  _count: { users: number }
}

const toView = (row: Row): RoleView => ({
  id: row.id,
  key: row.key,
  name: row.name,
  editable: row.key !== 'owner',
  permissions: row.permissions
    .map((p) => p.permission.key)
    .filter(isPermissionKey)
    .sort(),
  userCount: row._count.users,
})

const ORDER = ['owner', 'receptionist', 'physiotherapist']

/** GET /roles (USR-002). */
export async function listRoles(db: TenantDb): Promise<RoleView[]> {
  const rows = await db.role.findMany({ select })
  return rows.map(toView).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key))
}

/** GET /permissions: the fixed catalogue (clinic permissions only; platform.admin is never assignable). */
export async function listPermissions(db: TenantDb): Promise<{ key: string; description: string | null }[]> {
  const rows = await db.permission.findMany({
    where: { key: { not: 'platform.admin' } },
    select: { key: true, description: true },
    orderBy: { key: 'asc' },
  })
  return rows
}

/** Critical permissions that, after the change, no role other than the owner would hold. */
function lockoutWarnings(removed: PermissionKey[], others: RoleView[]): PermissionWarning[] {
  const warnings: PermissionWarning[] = []
  for (const permission of removed) {
    const what = CRITICAL[permission]
    if (what && !others.some((role) => role.key !== 'owner' && role.permissions.includes(permission))) {
      warnings.push({ permission, message: `After this change only the owner could ${what}.` })
    }
  }
  return warnings
}

/**
 * PUT /roles/:id/permissions (USR-002). Replaces the role's set. The owner role cannot change (BR-USR-4, US-07.6).
 * Takes effect on each user's next request because permissions are read per request (US-07.2, US-07.3). Removing a
 * critical permission that leaves only the owner able to use it needs `confirmWarnings` (US-07.4).
 */
export async function setRolePermissions(
  db: TenantDb,
  auth: AuthContext,
  id: string,
  input: { permissions: string[]; confirmWarnings: boolean },
  ip: string | undefined,
): Promise<RoleView> {
  const roles = await listRoles(db)
  const role = roles.find((r) => r.id === id)
  if (!role) throw notFound('Role not found.')
  if (!role.editable) {
    throw new AppError(403, 'PERMISSION_DENIED', 'The owner role always has every permission and cannot be changed.')
  }

  const unknown = input.permissions.filter((key) => !isPermissionKey(key) || key === 'platform.admin')
  if (unknown.length > 0) {
    throw validationError([{ field: 'permissions', message: `Unknown permission: ${unknown.join(', ')}.` }])
  }
  const next = [...new Set(input.permissions)] as PermissionKey[]
  const added = next.filter((key) => !role.permissions.includes(key))
  const removed = role.permissions.filter((key) => !next.includes(key))
  if (added.length === 0 && removed.length === 0) return role

  const warnings = lockoutWarnings(
    removed,
    roles.filter((r) => r.id !== id),
  )
  if (warnings.length > 0 && !input.confirmWarnings) {
    throw new AppError(409, 'PERMISSION_WARNING', 'This change needs your confirmation.', { details: { warnings } })
  }

  // The role was found through the tenant client above, so it belongs to this clinic. The join table has no tenant
  // column of its own, so the write goes through the base client.
  const prisma = getPrisma()
  const catalogue = await prisma.permission.findMany({ where: { key: { in: next } }, select: { id: true } })
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: id } }),
    prisma.rolePermission.createMany({ data: catalogue.map((p) => ({ roleId: id, permissionId: p.id })) }),
  ])
  await recordAudit({
    action: 'role.permissions_changed',
    tenantId: auth.tenantId,
    userId: auth.userId,
    targetType: 'role',
    targetId: id,
    details: { role: role.key, added, removed, confirmedWarnings: warnings.map((w) => w.permission) },
    ip,
  })
  return { ...role, permissions: [...next].sort() }
}
