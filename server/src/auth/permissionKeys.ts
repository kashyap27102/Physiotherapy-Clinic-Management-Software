/**
 * The fixed permission catalogue (docs/API-Requirements.md section 4). The same keys are seeded into the
 * `permission` table by the first migration; a database test keeps the two in step.
 */
export const PERMISSION_KEYS = [
  'clinic.manage',
  'staff.manage',
  'role.manage',
  'device.manage',
  'patient.register',
  'patient.edit',
  'patient.view',
  'clinical.view',
  'clinical.edit',
  'episode.manage',
  'visit.mark',
  'visit.backdate',
  'visit.bulk',
  'fee.override',
  'ledger.view',
  'payment.record',
  'refund.process',
  'entry.reverse',
  'document.issue',
  'report.view',
  'data.import',
  'data.export',
  'audit.view',
  'platform.admin',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

const known = new Set<string>(PERMISSION_KEYS)

export const isPermissionKey = (value: string): value is PermissionKey => known.has(value)
