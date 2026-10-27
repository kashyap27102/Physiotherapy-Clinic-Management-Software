import type { AuthContext } from '../../auth/context.js'
import { loadRolePermissions } from '../../auth/permissions.js'
import type { PermissionKey } from '../../auth/permissionKeys.js'
import { forTenant } from '../../db/tenantScope.js'
import { getPrisma } from '../../db/prisma.js'
import { authConfig, HOUR, MINUTE } from './authConfig.js'
import { hashToken, newToken } from './tokens.js'

export interface ResolvedSession {
  sessionId: string
  csrfToken: string
  auth: AuthContext
}

/** Starts a server-side session. Only the hash of the cookie token is stored. */
export async function createSession(userId: string): Promise<{ token: string; csrfToken: string }> {
  const token = newToken()
  const csrfToken = newToken()
  await getPrisma().userSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      csrfToken,
      expiresAt: new Date(Date.now() + authConfig.sessionMaxHours * HOUR),
    },
  })
  return { token, csrfToken }
}

/**
 * Loads the signed-in user for one request, or null when the cookie is unknown, revoked, idle too long, past its
 * hard limit, or its user or clinic is no longer active. Permissions are read fresh on every call, so a change
 * to a role applies on the user's next request (API-AUTH-5), and a deactivated user is out at once.
 */
export async function resolveSession(token: string): Promise<ResolvedSession | null> {
  const db = getPrisma()
  const session = await db.userSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { tenant: { select: { status: true } } } } },
  })
  if (!session || session.revokedAt) return null

  const now = Date.now()
  const idleLimit = now - authConfig.sessionIdleMinutes * MINUTE
  if (session.expiresAt.getTime() <= now || session.lastSeenAt.getTime() <= idleLimit) return null

  const { user } = session
  if (!user.isActive) return null
  if (!user.isSuperAdmin && user.tenant?.status !== 'active') return null

  if (now - session.lastSeenAt.getTime() > authConfig.sessionTouchSeconds * 1000) {
    await db.userSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } })
  }

  let permissions: ReadonlySet<PermissionKey>
  if (user.isSuperAdmin) permissions = new Set<PermissionKey>(['platform.admin'])
  else if (user.tenantId && user.roleId) permissions = await loadRolePermissions(forTenant(user.tenantId), user.roleId)
  else permissions = new Set<PermissionKey>()

  return {
    sessionId: session.id,
    csrfToken: session.csrfToken,
    auth: {
      userId: user.id,
      tenantId: user.tenantId,
      branchId: user.branchId,
      isSuperAdmin: user.isSuperAdmin,
      permissions,
    },
  }
}

export async function revokeSessionByToken(token: string): Promise<void> {
  await getPrisma().userSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/** Ends every live session of a user (password change or reset, device revoke), optionally keeping one. */
export async function revokeUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  await getPrisma().userSession.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  })
}
