import type { TenantDb } from '../db/tenantScope.js'
import { isPermissionKey, type PermissionKey } from './permissionKeys.js'

/**
 * Permission keys granted to a role of the signed-in clinic. A role of another clinic resolves to
 * an empty set, because the tenant client cannot see it.
 */
export async function loadRolePermissions(db: TenantDb, roleId: string): Promise<Set<PermissionKey>> {
  const rows = await db.rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { key: true } } },
  })
  const keys = new Set<PermissionKey>()
  for (const row of rows) {
    if (isPermissionKey(row.permission.key)) keys.add(row.permission.key)
  }
  return keys
}
