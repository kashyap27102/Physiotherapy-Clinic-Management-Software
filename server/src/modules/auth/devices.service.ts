import { notFound } from '../../lib/errors.js'
import { getPrisma } from '../../db/prisma.js'
import { forTenant } from '../../db/tenantScope.js'
import { recordAudit } from './audit.js'
import type { ClientInfo } from './auth.service.js'
import { revokeUserSessions } from './session.service.js'
import { hashToken } from './tokens.js'

export interface DeviceView {
  id: string
  label: string
  lastUsedAt: Date | null
  expiresAt: Date
  /** True for the device making this request. */
  current: boolean
}

/** AUTH-003 / US-03.1: live (not revoked, not expired) trusted devices of one user. */
export async function listDevices(userId: string, currentDeviceToken?: string): Promise<DeviceView[]> {
  const currentHash = currentDeviceToken ? hashToken(currentDeviceToken) : undefined
  const rows = await getPrisma().trustedDevice.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: [{ lastUsedAt: { sort: 'desc', nulls: 'last' } }],
  })
  return rows.map((row) => ({
    id: row.id,
    label: row.label ?? 'Unknown device',
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    current: currentHash !== undefined && row.tokenHash === currentHash,
  }))
}

/**
 * Revokes one device (US-03.2): its next sign-in needs a code again. Sessions started from it cannot be told
 * apart from the user's others, so all of the user's other sessions end too (API-AUTH-6); `keepSessionId` is the
 * caller's own session when they revoke their own device.
 */
export async function revokeDevice(
  input: {
    actor: { userId: string; tenantId: string | null }
    targetUserId: string
    deviceId: string
    keepSessionId?: string
  },
  client: ClientInfo,
): Promise<void> {
  const result = await getPrisma().trustedDevice.updateMany({
    where: { id: input.deviceId, userId: input.targetUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (result.count !== 1) throw notFound('Device not found.')

  await revokeUserSessions(input.targetUserId, input.keepSessionId)
  await recordAudit({
    action: 'auth.device_revoked',
    tenantId: input.actor.tenantId,
    userId: input.actor.userId,
    targetType: 'trusted_device',
    targetId: input.deviceId,
    details: { targetUserId: input.targetUserId },
    ip: client.ip,
  })
}

/**
 * The owner's view of a staff member (US-03.3). The user is looked up through the tenant-scoped handle, so a user of
 * another clinic answers 404 and never reveals that the account exists.
 */
export async function requireClinicUser(tenantId: string, userId: string): Promise<void> {
  const user = await forTenant(tenantId).userAccount.findFirst({ where: { id: userId }, select: { id: true } })
  if (!user) throw notFound('User not found.')
}
