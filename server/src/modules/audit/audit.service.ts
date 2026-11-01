import type { TenantDb } from '../../db/tenantScope.js'
import type { Prisma } from '../../generated/prisma/client.js'
import { indiaDayStart } from '../patients/patientRules.js'
import type { ListQuery } from './audit.schemas.js'

const select = {
  id: true,
  action: true,
  userId: true,
  branchId: true,
  targetType: true,
  targetId: true,
  details: true,
  ipAddress: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect

/**
 * Records about one patient do not all point at the patient: an episode view targets the episode, a note view the visit,
 * a reprint the document. So the patient filter matches the patient, their episodes, visits and documents, and any row
 * whose details name the patient (payments, refunds, reversals, discharge).
 */
async function patientRowsFilter(db: TenantDb, patientId: string): Promise<Prisma.AuditLogWhereInput> {
  const [episodes, visits, documents] = await Promise.all([
    db.episode.findMany({ where: { patientId }, select: { id: true } }),
    db.visit.findMany({ where: { patientId }, select: { id: true } }),
    db.billingDocument.findMany({ where: { patientId }, select: { id: true } }),
  ])
  const targets = [patientId, ...episodes.map((r) => r.id), ...visits.map((r) => r.id), ...documents.map((r) => r.id)]
  return { OR: [{ targetId: { in: targets } }, { details: { path: ['patientId'], equals: patientId } }] }
}

/** The patient a row is about, when the row says so: the patient itself, or `details.patientId`. */
function patientIdOf(row: { targetType: string | null; targetId: string | null; details: Prisma.JsonValue }) {
  if (row.targetType === 'patient') return row.targetId
  const details = row.details
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    const id = details['patientId']
    if (typeof id === 'string') return id
  }
  return null
}

/**
 * GET /audit-log (AUD-001, US-19). The clinic's log, newest first, narrowed by user, patient, action, branch and
 * India-time dates. The log is read-only: nothing here, or anywhere else, updates or deletes an entry.
 */
export async function listAuditLog(db: TenantDb, input: ListQuery) {
  const and: Prisma.AuditLogWhereInput[] = []
  if (input.userId) and.push({ userId: input.userId })
  if (input.branchId) and.push({ branchId: input.branchId })
  if (input.action) {
    and.push(input.action.endsWith('.') ? { action: { startsWith: input.action } } : { action: input.action })
  }
  if (input.from || input.to) {
    and.push({
      createdAt: {
        ...(input.from && { gte: indiaDayStart(input.from) }),
        ...(input.to && { lt: indiaDayStart(input.to, 1) }),
      },
    })
  }
  if (input.patientId) and.push(await patientRowsFilter(db, input.patientId))
  const where: Prisma.AuditLogWhereInput = and.length ? { AND: and } : {}

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      select,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    db.auditLog.count({ where }),
  ])

  // Names for the page only; an id that is not this clinic's resolves to nothing (tenant scope).
  const patientIds = [...new Set(rows.map(patientIdOf).filter((id): id is string => id !== null))]
  const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => id !== null))]
  const branchIds = [...new Set(rows.map((r) => r.branchId).filter((id): id is string => id !== null))]
  const [patients, users, branches] = await Promise.all([
    patientIds.length
      ? db.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, fullName: true } })
      : [],
    userIds.length
      ? db.userAccount.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
      : [],
    branchIds.length ? db.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } }) : [],
  ])
  const patientName = new Map(patients.map((p) => [p.id, p.fullName]))
  const userName = new Map(users.map((u) => [u.id, u.fullName]))
  const branchName = new Map(branches.map((b) => [b.id, b.name]))

  return {
    items: rows.map((row) => {
      const patientId = patientIdOf(row)
      return {
        id: row.id,
        action: row.action,
        at: row.createdAt.toISOString(),
        user: row.userId ? { id: row.userId, fullName: userName.get(row.userId) ?? null } : null,
        branch: row.branchId ? { id: row.branchId, name: branchName.get(row.branchId) ?? null } : null,
        patient: patientId ? { id: patientId, fullName: patientName.get(patientId) ?? null } : null,
        targetType: row.targetType,
        targetId: row.targetId,
        details: row.details,
        ipAddress: row.ipAddress,
      }
    }),
    page: input.page,
    pageSize: input.pageSize,
    total,
  }
}
