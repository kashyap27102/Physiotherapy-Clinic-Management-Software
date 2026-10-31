import { isIP } from 'node:net'
import type { AuthContext } from '../../auth/context.js'
import type { TenantDb } from '../../db/tenantScope.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { AuthAuditAction } from '../auth/audit.js'
import {
  financialYear,
  formatDocNumber,
  netPaise,
  parseMoney,
  toBalance,
  type BalanceView,
  type DocType,
  type EntryType,
  type LedgerFigure,
} from './billingRules.js'
import { validationError } from '../../lib/errors.js'
import { indiaToday } from '../patients/patientRules.js'

/** The handle inside `db.$transaction(...)`: same tenant-scoped models, bound to one transaction. */
export type Tx = Parameters<Parameters<TenantDb['$transaction']>[0]>[0]
type LedgerDb = Pick<TenantDb, 'ledgerEntry'>

const ZERO: BalanceView = { amount: '0.00', state: 'zero' }

/** Every entry of the given patients as figures, with the type of the entry each reversal cancels. */
async function figuresFor(db: LedgerDb, patientIds: string[]): Promise<Map<string, LedgerFigure[]>> {
  const byPatient = new Map<string, LedgerFigure[]>()
  if (patientIds.length === 0) return byPatient
  const rows = await db.ledgerEntry.findMany({
    where: { patientId: { in: patientIds } },
    select: { patientId: true, entryType: true, amount: true, reverses: { select: { entryType: true } } },
  })
  for (const row of rows) {
    const list = byPatient.get(row.patientId) ?? []
    list.push({
      entryType: row.entryType as EntryType,
      amountPaise: parseMoney(row.amount.toFixed(2)) ?? 0,
      reversedType: (row.reverses?.entryType as EntryType | undefined) ?? null,
    })
    byPatient.set(row.patientId, list)
  }
  return byPatient
}

/**
 * Balances computed from the ledger (BILL-002, ER section 4): dues, advance credit or zero. All branches count,
 * because the account belongs to the patient and not to a branch (BILL-008). Nothing is stored, so nothing can drift.
 */
export async function balancesFor(db: LedgerDb, patientIds: string[]): Promise<Map<string, BalanceView>> {
  const figures = await figuresFor(db, patientIds)
  return new Map(patientIds.map((id) => [id, toBalance(netPaise(figures.get(id) ?? []))]))
}

/** One patient's balance in paise (positive is dues), for checks inside a transaction. */
export async function netPaiseFor(db: LedgerDb, patientId: string): Promise<number> {
  return netPaise((await figuresFor(db, [patientId])).get(patientId) ?? [])
}

export const balanceOrNull = (auth: AuthContext, balance: BalanceView | undefined): BalanceView | null =>
  auth.permissions.has('ledger.view') ? (balance ?? ZERO) : null

/** An audit row written in the same transaction as the money event, so neither can exist without the other. */
export function auditIn(
  tx: Pick<Tx, 'auditLog'>,
  auth: AuthContext,
  ip: string | undefined,
  action: AuthAuditAction,
  targetType: string,
  targetId: string,
  details?: Prisma.InputJsonValue,
) {
  return tx.auditLog.create({
    data: {
      action,
      userId: auth.userId,
      branchId: auth.branchId,
      targetType,
      targetId,
      ...(details === undefined ? {} : { details }),
      ipAddress: ip && isIP(ip) ? ip : null,
    } as Prisma.AuditLogUncheckedCreateInput,
  })
}

/**
 * Makes sure the counter row for a series exists. Done before the money transaction: two first-ever receipts racing to
 * create it would otherwise abort one transaction. A lost race here is harmless, so the duplicate error is ignored.
 */
export async function ensureSequence(db: TenantDb, branchId: string, docType: DocType, fy: string): Promise<void> {
  const exists = await db.numberSequence.findFirst({
    where: { branchId, docType, financialYear: fy },
    select: { id: true },
  })
  if (exists) return
  try {
    await db.numberSequence.create({
      data: { branchId, docType, financialYear: fy, lastNumber: 0 } as Prisma.NumberSequenceUncheckedCreateInput,
    })
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'P2002') throw error
  }
}

/** The financial year of today in India, for example 2026-27. */
export function currentFinancialYear(now: Date = new Date()): string {
  const today = indiaToday(now)
  return financialYear(today.year, today.month)
}

/**
 * Takes the next number of a series and issues the document, inside the caller's transaction (ER section 6, BR-BILL-17,
 * BR-BILL-18). The counter update locks its row until commit, so two clerks never get the same number, and a failed
 * save rolls the number back with everything else, so no gap appears.
 */
export async function issueDocument(
  tx: Tx,
  input: {
    branch: { id: string; code: string }
    patientId: string
    docType: DocType
    fy: string
    ledgerEntryId: string | null
    issuedById: string
    linesSnapshot?: Prisma.InputJsonValue
    periodFrom?: Date
    periodTo?: Date
  },
) {
  const counter = await tx.numberSequence.update({
    where: {
      branchId_docType_financialYear: { branchId: input.branch.id, docType: input.docType, financialYear: input.fy },
    },
    data: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  })
  return tx.billingDocument.create({
    data: {
      branchId: input.branch.id,
      patientId: input.patientId,
      ledgerEntryId: input.ledgerEntryId,
      docType: input.docType,
      financialYear: input.fy,
      seqNo: counter.lastNumber,
      docNumber: formatDocNumber(input.branch.code, input.docType, input.fy, counter.lastNumber),
      issuedById: input.issuedById,
      ...(input.linesSnapshot === undefined ? {} : { linesSnapshot: input.linesSnapshot }),
      ...(input.periodFrom === undefined ? {} : { periodFrom: input.periodFrom }),
      ...(input.periodTo === undefined ? {} : { periodTo: input.periodTo }),
    } as Prisma.BillingDocumentUncheckedCreateInput,
    select: { id: true, docNumber: true, docType: true },
  })
}

/**
 * Serialises money writes for one patient: the update takes the patient row's lock until the transaction ends, so a
 * refund limit or a reversal check cannot be passed twice against the same balance (API-Requirements section 10).
 */
export async function lockPatientLedger(tx: Pick<Tx, 'patient'>, patientId: string): Promise<void> {
  await tx.patient.update({
    where: { id: patientId },
    data: { ledgerRevision: { increment: 1 } },
    select: { id: true },
  })
}

/**
 * The branch a visit or money entry belongs to. Branch-assigned staff always act in their own branch (BR-USR-1,
 * API-Requirements principle 4); an owner may name one, otherwise the given fallback is used.
 */
export async function actingBranch(
  db: TenantDb,
  auth: AuthContext,
  requested: string | undefined,
  fallbackBranchId: string,
): Promise<{ id: string; code: string; name: string }> {
  const id = auth.branchId ?? requested ?? fallbackBranchId
  const branch = await db.branch.findFirst({
    where: { id, isActive: true },
    select: { id: true, code: true, name: true },
  })
  if (!branch) throw validationError([{ field: 'branchId', message: 'Choose an active branch.' }])
  return branch
}

/** The clinic's current default session fee in paise; 0 until the owner sets one. */
export async function defaultFeePaise(db: Pick<TenantDb, 'feeSetting'>): Promise<number> {
  const row = await db.feeSetting.findFirst({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { defaultFee: true },
  })
  return row ? (parseMoney(row.defaultFee.toFixed(2)) ?? 0) : 0
}

/**
 * Money transactions queue behind the patient's ledger lock, so they get more room than Prisma's 5 second default;
 * otherwise a burst of requests for one patient could time out and answer 500 even though nothing is wrong.
 */
export const MONEY_TX = { timeout: 20_000, maxWait: 10_000 } as const
