import { isIP } from 'node:net'
import { getPrisma } from '../../db/prisma.js'
import type { Prisma } from '../../generated/prisma/client.js'

/** Audit actions written so far (PRD AUD-001, API-Requirements section 7): sign-in, registration, clinic setup. */
export type AuthAuditAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.account_locked'
  | 'auth.otp_sent'
  | 'auth.otp_failed'
  | 'auth.device_trusted'
  | 'auth.device_revoked'
  | 'auth.password_reset_requested'
  | 'auth.password_reset'
  | 'auth.password_changed'
  | 'auth.logout'
  | 'tenant.registered'
  | 'clinic.updated'
  | 'clinic.logo_changed'
  | 'branch.created'
  | 'branch.updated'
  | 'branch.deactivated'
  | 'branch.reactivated'
  | 'user.created'
  | 'user.updated'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'user.invitation_sent'
  | 'role.permissions_changed'

interface AuditEntry {
  action: AuthAuditAction
  tenantId?: string | null
  userId?: string | null
  targetType?: string
  targetId?: string
  /** Never put emails, passwords, codes or tokens here (PRD NFR-010). */
  details?: Prisma.InputJsonValue
  ip?: string | undefined
}

/** Appends one audit row. The audit table is insert-only (PRD SEC-008). */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  await getPrisma().auditLog.create({
    data: {
      action: entry.action,
      tenantId: entry.tenantId ?? null,
      userId: entry.userId ?? null,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      ...(entry.details === undefined ? {} : { details: entry.details }),
      // The column is inet; anything that is not an IP address would fail the insert.
      ipAddress: entry.ip && isIP(entry.ip) ? entry.ip : null,
    },
  })
}
