import type { AuthContext } from '../../auth/context.js'
import type { TenantDb } from '../../db/tenantScope.js'
import { entryEffect, formatMoney, indiaDayRange, parseMoney, type EntryType } from '../billing/billingRules.js'
import { dateOnly, indiaToday } from '../patients/patientRules.js'
import { notReversed } from '../visits/visits.service.js'
import { summariseDues, tallyCash, type CashEntry, type DueRow } from './dashboardRules.js'

const paise = (amount: { toFixed(digits: number): string }): number => parseMoney(amount.toFixed(2)) ?? 0

/**
 * Net balance of every patient who has ledger entries, in paise (positive is dues). Computed in the database as sums by
 * entry type, so a clinic with years of entries does not load them all; only reversals, which are few, are read row by
 * row because each one cancels an entry of another type (ER section 4).
 */
async function patientNets(db: TenantDb, branchId: string | undefined): Promise<DueRow[]> {
  const patientWhere = branchId ? { patient: { registeredBranchId: branchId } } : {}
  const [sums, reversals] = await Promise.all([
    db.ledgerEntry.groupBy({
      by: ['patientId', 'entryType'],
      where: { entryType: { in: ['CHARGE', 'PAYMENT', 'REFUND'] }, ...patientWhere },
      _sum: { amount: true },
    }),
    db.ledgerEntry.findMany({
      where: { entryType: 'REVERSAL', ...patientWhere },
      select: { patientId: true, amount: true, reverses: { select: { entryType: true } } },
    }),
  ])
  const nets = new Map<string, number>()
  const add = (patientId: string, delta: number) => nets.set(patientId, (nets.get(patientId) ?? 0) + delta)
  for (const row of sums) {
    if (row._sum.amount) add(row.patientId, entryEffect(row.entryType as EntryType, paise(row._sum.amount), null))
  }
  for (const row of reversals) {
    add(
      row.patientId,
      entryEffect('REVERSAL', paise(row.amount), (row.reverses?.entryType as EntryType | undefined) ?? null),
    )
  }
  return [...nets].map(([patientId, netPaise]) => ({ patientId, netPaise }))
}

/**
 * GET /dashboard/today (REP-001, US-26): patients seen, collections and dues for today in India time. An owner sees
 * every branch together or one chosen branch; a branch-assigned user holding `report.view` always sees their own.
 *
 * - Patients seen: distinct patients with a visit today whose charge was not reversed.
 * - Collections: cash basis (BR-REP-1), payments dated today less reversals and refunds entered today.
 * - Dues: what patients owe in total. An account belongs to the patient (BILL-008), so a branch filter counts the
 *   patients registered at that branch.
 */
export async function getTodaySummary(db: TenantDb, auth: AuthContext, requestedBranchId: string | undefined) {
  const today = indiaToday()
  const { start, end } = indiaDayRange(today.year, today.month, today.day)
  const branchId = auth.branchId ?? requestedBranchId
  const byBranchFilter = branchId ? { branchId } : {}

  const [visits, newPatients, entries, nets, branches] = await Promise.all([
    db.visit.findMany({
      where: { visitedAt: { gte: start, lt: end }, ...byBranchFilter, ...notReversed },
      select: { patientId: true, branchId: true },
    }),
    db.patient.count({
      where: { createdAt: { gte: start, lt: end }, ...(branchId ? { registeredBranchId: branchId } : {}) },
    }),
    db.ledgerEntry.findMany({
      where: {
        entryDate: dateOnly(today.year, today.month, today.day),
        entryType: { in: ['PAYMENT', 'REFUND', 'REVERSAL'] },
        ...byBranchFilter,
      },
      select: {
        branchId: true,
        entryType: true,
        amount: true,
        paymentMethod: true,
        reverses: { select: { entryType: true, paymentMethod: true } },
      },
    }),
    patientNets(db, branchId),
    db.branch.findMany({ select: { id: true, name: true, isActive: true }, orderBy: { name: 'asc' } }),
  ])

  const cash = entries.map((row) => ({
    branchId: row.branchId,
    entry: {
      entryType: row.entryType as EntryType,
      amountPaise: paise(row.amount),
      method: row.paymentMethod,
      reversed: row.reverses
        ? { entryType: row.reverses.entryType as EntryType, method: row.reverses.paymentMethod }
        : null,
    } satisfies CashEntry,
  }))
  const tally = tallyCash(cash.map((row) => row.entry))

  const dues = summariseDues(nets)
  const names = dues.top.length
    ? await db.patient.findMany({
        where: { id: { in: dues.top.map((row) => row.patientId) } },
        select: { id: true, fullName: true },
      })
    : []
  const nameOf = new Map(names.map((patient) => [patient.id, patient.fullName]))

  // One row per branch, only when looking at every branch (US-26.3). Quiet inactive branches are left out.
  const perBranch = branchId
    ? null
    : branches
        .map((branch) => {
          const here = visits.filter((visit) => visit.branchId === branch.id)
          const collected = tallyCash(cash.filter((row) => row.branchId === branch.id).map((row) => row.entry)).net
          return {
            branchId: branch.id,
            name: branch.name,
            isActive: branch.isActive,
            patientsSeen: new Set(here.map((visit) => visit.patientId)).size,
            sessions: here.length,
            collected: formatMoney(collected),
            collectedPaise: collected,
          }
        })
        .filter((row) => row.isActive || row.sessions > 0 || row.collectedPaise !== 0)
        .map(({ isActive: _isActive, collectedPaise: _collectedPaise, ...row }) => row)

  return {
    date: `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`,
    branchId: branchId ?? null,
    patientsSeen: new Set(visits.map((visit) => visit.patientId)).size,
    sessions: visits.length,
    newPatients,
    collections: {
      net: formatMoney(tally.net),
      payments: formatMoney(tally.payments),
      reversed: formatMoney(tally.reversed),
      refunded: formatMoney(tally.refunded),
      byMethod: Object.entries(tally.byMethod).map(([method, amount]) => ({ method, amount: formatMoney(amount) })),
    },
    dues: {
      total: formatMoney(dues.totalPaise),
      patients: dues.patients,
      top: dues.top.map((row) => ({
        patientId: row.patientId,
        fullName: nameOf.get(row.patientId) ?? null,
        amount: formatMoney(row.netPaise),
      })),
    },
    byBranch: perBranch,
  }
}
