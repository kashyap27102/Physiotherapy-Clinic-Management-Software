import type { AuthContext } from '../../auth/context.js'
import type { TenantDb } from '../../db/tenantScope.js'
import { Prisma } from '../../generated/prisma/client.js'
import { AppError, forbidden, notFound, validationError } from '../../lib/errors.js'
import { recordAudit } from '../auth/audit.js'
import { dateOnly, indiaToday } from '../patients/patientRules.js'
import {
  formatMoney,
  indiaDayRange,
  parseIsoDate,
  invoiceFingerprint,
  parseMoney,
  toBalance,
  type BalanceView,
  type DocType,
  type EntryType,
  type PaymentMethod,
} from './billingRules.js'
import { renderDocumentPdf, rupees, type DocumentPdfData } from './documentPdf.js'
import {
  actingBranch,
  auditIn,
  balancesFor,
  currentFinancialYear,
  defaultFeePaise,
  ensureSequence,
  issueDocument,
  lockPatientLedger,
  MONEY_TX,
  netPaiseFor,
} from './ledger.js'
import { financialYear } from './billingRules.js'

/* ---------------------------------------------------------------- shapes */

const entrySelect = {
  id: true,
  patientId: true,
  entryType: true,
  amount: true,
  paymentMethod: true,
  reference: true,
  reason: true,
  createdAt: true,
  visitId: true,
  reversesEntryId: true,
  branch: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  reversedBy: { select: { id: true } },
  documents: { select: { id: true, docNumber: true }, take: 1, orderBy: { issuedAt: 'asc' } },
} as const

type EntryRow = Prisma.LedgerEntryGetPayload<{ select: typeof entrySelect }>

export interface LedgerRecordDto {
  id: string
  type: EntryType
  amount: string
  method: PaymentMethod | null
  reference: string | null
  reason: string | null
  branchName: string
  createdAt: Date
  createdByName: string
  visitId: string | null
  reversesEntryId: string | null
  reversedByEntryId: string | null
  documentId: string | null
  documentNumber: string | null
}

export const toLedgerRecord = (row: EntryRow): LedgerRecordDto => ({
  id: row.id,
  type: row.entryType as EntryType,
  amount: row.amount.toFixed(2),
  method: row.paymentMethod as PaymentMethod | null,
  reference: row.reference,
  reason: row.reason,
  branchName: row.branch.name,
  createdAt: row.createdAt,
  createdByName: row.createdBy.fullName,
  visitId: row.visitId,
  reversesEntryId: row.reversesEntryId,
  reversedByEntryId: row.reversedBy?.id ?? null,
  documentId: row.documents[0]?.id ?? null,
  documentNumber: row.documents[0]?.docNumber ?? null,
})

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

const alreadyReversed = () => new AppError(409, 'ALREADY_REVERSED', 'This entry has already been reversed.')

/** Balance shown to a user, or null when they may not see balances (BILL-002 permission ledger.view). */
const visibleBalance = (auth: AuthContext, balance: BalanceView): BalanceView | null =>
  auth.permissions.has('ledger.view') ? balance : null

async function findPatientRef(db: TenantDb, id: string) {
  const row = await db.patient.findFirst({
    where: { id },
    select: { id: true, fullName: true, registeredBranchId: true },
  })
  if (!row) throw notFound('Patient not found.')
  return row
}

/** Today in India as a plain calendar date, which is how the ledger dates its entries. */
function today() {
  const parts = indiaToday()
  return { parts, date: dateOnly(parts.year, parts.month, parts.day) }
}

/* ------------------------------------------------------------ default fee */

/** GET /clinic/fee (BILL-001): the fee a new visit is charged unless overridden. "0.00" until the owner sets one. */
export async function getDefaultFee(db: TenantDb): Promise<{ defaultFee: string; isSet: boolean }> {
  const row = await db.feeSetting.findFirst({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { defaultFee: true },
  })
  return { defaultFee: row ? row.defaultFee.toFixed(2) : '0.00', isSet: row !== null }
}

/**
 * PUT /clinic/fee (BILL-001). Inserts a new row, so the history stays. Visits already marked keep the fee they were
 * charged: only future visits use the new one (BR-BILL-1).
 */
export async function setDefaultFee(db: TenantDb, auth: AuthContext, paise: number, ip: string | undefined) {
  const before = await defaultFeePaise(db)
  const { date } = today()
  const row = await db.feeSetting.create({
    data: {
      defaultFee: formatMoney(paise),
      effectiveFrom: date,
      setById: auth.userId,
    } as Prisma.FeeSettingUncheckedCreateInput,
    select: { id: true, defaultFee: true },
  })
  await recordAudit({
    action: 'fee.default_changed',
    tenantId: auth.tenantId,
    userId: auth.userId,
    branchId: auth.branchId,
    targetType: 'fee_setting',
    targetId: row.id,
    details: { from: formatMoney(before), to: formatMoney(paise) },
    ip,
  })
  return { defaultFee: row.defaultFee.toFixed(2), isSet: true }
}

/* --------------------------------------------------------------- payments */

export interface PaymentInput {
  patientId: string
  amountPaise: number
  method: PaymentMethod
  reference: string | null
  date: { year: number; month: number; day: number } | null
  branchId?: string | undefined
}

/**
 * POST /payments (BILL-003). The ledger entry and its numbered receipt are written in one transaction, so a failure
 * leaves neither and burns no receipt number (BR-BILL-18). Advance payments are allowed: the balance simply turns
 * into credit (BILL-002). Back-dating is for the owner only (A-10).
 */
export async function recordPayment(db: TenantDb, auth: AuthContext, input: PaymentInput, ip: string | undefined) {
  const patient = await findPatientRef(db, input.patientId)
  const now = today()
  let entryDay = now.parts
  if (input.date) {
    const sameDay = ['year', 'month', 'day'].every((k) => input.date![k as 'year'] === now.parts[k as 'year'])
    if (!sameDay) {
      if (auth.branchId !== null) throw forbidden('Only the owner can date a payment on another day.')
      const given = dateOnly(input.date.year, input.date.month, input.date.day)
      if (given.getTime() > now.date.getTime()) {
        throw validationError([{ field: 'date', message: 'A payment cannot be dated in the future.' }])
      }
      entryDay = input.date
    }
  }
  const branch = await actingBranch(db, auth, input.branchId, patient.registeredBranchId)
  const fy = financialYear(entryDay.year, entryDay.month)
  await ensureSequence(db, branch.id, 'RECEIPT', fy)

  const result = await db.$transaction(async (tx) => {
    await lockPatientLedger(tx, patient.id)
    const entry = await tx.ledgerEntry.create({
      data: {
        branchId: branch.id,
        patientId: patient.id,
        entryType: 'PAYMENT',
        amount: formatMoney(input.amountPaise),
        paymentMethod: input.method,
        reference: input.reference,
        entryDate: dateOnly(entryDay.year, entryDay.month, entryDay.day),
        createdById: auth.userId,
      } as Prisma.LedgerEntryUncheckedCreateInput,
      select: entrySelect,
    })
    const receipt = await issueDocument(tx, {
      branch,
      patientId: patient.id,
      docType: 'RECEIPT',
      fy,
      ledgerEntryId: entry.id,
      issuedById: auth.userId,
    })
    await auditIn(tx, auth, ip, 'payment.recorded', 'ledger_entry', entry.id, {
      patientId: patient.id,
      amount: formatMoney(input.amountPaise),
      method: input.method,
      receipt: receipt.docNumber,
    })
    return { entry, receipt, balance: toBalance(await netPaiseFor(tx, patient.id)) }
  }, MONEY_TX)

  return {
    entry: toLedgerRecord({
      ...result.entry,
      documents: [{ id: result.receipt.id, docNumber: result.receipt.docNumber }],
    }),
    receipt: { id: result.receipt.id, number: result.receipt.docNumber },
    balanceAfter: visibleBalance(auth, result.balance),
  }
}

/* ---------------------------------------------------------------- refunds */

export interface RefundInput {
  patientId: string
  amountPaise: number
  method: PaymentMethod
  reason: string
  branchId?: string | undefined
}

/**
 * POST /refunds (BILL-004). Only unused advance credit can be refunded (BR-BILL-12); the check and the insert share one
 * transaction that holds the patient's ledger lock, so two refunds cannot both spend the same credit.
 */
export async function processRefund(db: TenantDb, auth: AuthContext, input: RefundInput, ip: string | undefined) {
  const patient = await findPatientRef(db, input.patientId)
  const branch = await actingBranch(db, auth, input.branchId, patient.registeredBranchId)
  const { date } = today()

  const result = await db.$transaction(async (tx) => {
    await lockPatientLedger(tx, patient.id)
    const credit = Math.max(-(await netPaiseFor(tx, patient.id)), 0)
    if (input.amountPaise > credit) {
      throw new AppError(
        409,
        'REFUND_EXCEEDS_CREDIT',
        credit === 0
          ? 'This patient has no advance credit to refund.'
          : `Only ${rupees(formatMoney(credit))} of advance credit is available to refund.`,
        { details: { available: formatMoney(credit) } },
      )
    }
    const entry = await tx.ledgerEntry.create({
      data: {
        branchId: branch.id,
        patientId: patient.id,
        entryType: 'REFUND',
        amount: formatMoney(input.amountPaise),
        paymentMethod: input.method,
        reason: input.reason,
        entryDate: date,
        createdById: auth.userId,
      } as Prisma.LedgerEntryUncheckedCreateInput,
      select: entrySelect,
    })
    await auditIn(tx, auth, ip, 'refund.processed', 'ledger_entry', entry.id, {
      patientId: patient.id,
      amount: formatMoney(input.amountPaise),
      method: input.method,
      reason: input.reason,
    })
    return { entry, balance: toBalance(await netPaiseFor(tx, patient.id)) }
  }, MONEY_TX)
  return { entry: toLedgerRecord(result.entry), balanceAfter: visibleBalance(auth, result.balance) }
}

/* -------------------------------------------------------------- reversals */

/**
 * POST /ledger-entries/:id/reverse and POST /visits/:id/reverse (BILL-005). Never edits or deletes: a REVERSAL entry
 * is added that points at the original, which stays visible. One reversal per entry, and a reversal cannot itself be
 * reversed. Reversing a payment also issues a reversal receipt with its own number (BR-BILL-17). Branch-assigned staff
 * can only reverse entries of their own branch (BR-USR-1).
 */
export async function reverseEntry(
  db: TenantDb,
  auth: AuthContext,
  entryId: string,
  reason: string,
  ip: string | undefined,
) {
  const original = await db.ledgerEntry.findFirst({
    where: { id: entryId },
    select: {
      id: true,
      patientId: true,
      branchId: true,
      episodeId: true,
      visitId: true,
      entryType: true,
      amount: true,
      reversedBy: { select: { id: true } },
      branch: { select: { id: true, code: true } },
    },
  })
  if (!original) throw notFound('Entry not found.')
  if (original.entryType === 'REVERSAL') {
    throw new AppError(409, 'CANNOT_REVERSE_REVERSAL', 'A reversal cannot be reversed. Record a new entry instead.')
  }
  if (original.reversedBy) throw alreadyReversed()
  if (auth.branchId !== null && auth.branchId !== original.branchId) {
    throw forbidden('You can only reverse entries made at your own branch.')
  }

  const { parts, date } = today()
  const isPayment = original.entryType === 'PAYMENT'
  const fy = financialYear(parts.year, parts.month)
  if (isPayment) await ensureSequence(db, original.branchId, 'REVERSAL_RECEIPT', fy)

  try {
    const result = await db.$transaction(async (tx) => {
      await lockPatientLedger(tx, original.patientId)
      // Checked again under the lock, so two simultaneous reversals produce one 201 and one 409.
      if (await tx.ledgerEntry.findFirst({ where: { reversesEntryId: original.id }, select: { id: true } })) {
        throw alreadyReversed()
      }
      const entry = await tx.ledgerEntry.create({
        data: {
          branchId: original.branchId,
          patientId: original.patientId,
          episodeId: original.episodeId,
          visitId: original.visitId,
          reversesEntryId: original.id,
          entryType: 'REVERSAL',
          amount: original.amount.toFixed(2),
          reason,
          entryDate: date,
          createdById: auth.userId,
        } as Prisma.LedgerEntryUncheckedCreateInput,
        select: entrySelect,
      })
      const receipt = isPayment
        ? await issueDocument(tx, {
            branch: original.branch,
            patientId: original.patientId,
            docType: 'REVERSAL_RECEIPT',
            fy,
            ledgerEntryId: entry.id,
            issuedById: auth.userId,
          })
        : null
      await auditIn(tx, auth, ip, original.visitId ? 'visit.reversed' : 'ledger.reversed', 'ledger_entry', entry.id, {
        patientId: original.patientId,
        reverses: original.id,
        type: original.entryType,
        amount: original.amount.toFixed(2),
        reason,
        ...(receipt ? { receipt: receipt.docNumber } : {}),
      })
      return { entry, receipt, balance: toBalance(await netPaiseFor(tx, original.patientId)) }
    }, MONEY_TX)
    return {
      entry: toLedgerRecord({
        ...result.entry,
        documents: result.receipt ? [{ id: result.receipt.id, docNumber: result.receipt.docNumber }] : [],
      }),
      reversedEntryId: original.id,
      reversalReceipt: result.receipt ? { id: result.receipt.id, number: result.receipt.docNumber } : null,
      balanceAfter: visibleBalance(auth, result.balance),
    }
  } catch (error) {
    if (isUniqueViolation(error)) throw alreadyReversed()
    throw error
  }
}

/* ----------------------------------------------------------------- ledger */

/** GET /patients/:id/ledger (BILL-002): every entry, newest first, with the current balance. Audited. */
export async function listLedger(db: TenantDb, auth: AuthContext, patientId: string, ip: string | undefined) {
  await findPatientRef(db, patientId)
  const [rows, balances] = await Promise.all([
    db.ledgerEntry.findMany({
      where: { patientId },
      select: entrySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    balancesFor(db, [patientId]),
  ])
  await recordAudit({
    action: 'ledger.viewed',
    tenantId: auth.tenantId,
    userId: auth.userId,
    branchId: auth.branchId,
    targetType: 'patient',
    targetId: patientId,
    ip,
  })
  return { items: rows.map(toLedgerRecord), balance: balances.get(patientId)! }
}

/** GET /ledger-entries/:id (BILL-002). */
export async function getLedgerEntry(db: TenantDb, id: string) {
  const row = await db.ledgerEntry.findFirst({ where: { id }, select: entrySelect })
  if (!row) throw notFound('Entry not found.')
  return toLedgerRecord(row)
}

/* -------------------------------------------------------------- documents */

const documentSelect = {
  id: true,
  patientId: true,
  docType: true,
  docNumber: true,
  issuedAt: true,
  branch: { select: { name: true } },
  ledgerEntry: { select: { amount: true } },
} as const

type DocumentRow = Prisma.BillingDocumentGetPayload<{ select: typeof documentSelect }>

const toDocument = (row: DocumentRow) => ({
  id: row.id,
  patientId: row.patientId,
  type: row.docType as DocType,
  number: row.docNumber,
  issuedAt: row.issuedAt,
  branchName: row.branch.name,
  amount: row.ledgerEntry ? row.ledgerEntry.amount.toFixed(2) : null,
})

/** GET /patients/:id/documents (BILL-006): receipts, reversal receipts and invoices, newest first. */
export async function listPatientDocuments(db: TenantDb, patientId: string) {
  await findPatientRef(db, patientId)
  const rows = await db.billingDocument.findMany({
    where: { patientId },
    select: documentSelect,
    orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
  })
  return { items: rows.map(toDocument) }
}

/** GET /documents/:id (BILL-006). */
export async function getDocument(db: TenantDb, id: string) {
  const row = await db.billingDocument.findFirst({ where: { id }, select: documentSelect })
  if (!row) throw notFound('Document not found.')
  return toDocument(row)
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank_transfer: 'Bank transfer',
}

const dayLabel = (date: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)

interface InvoiceSnapshot {
  lines: { date: string; description: string; amount: string }[]
  total: string
  periodLabel: string
  balanceLabel: string
}

/**
 * GET /documents/:id/pdf (BILL-006, BILL-007). Generated from stored data on request, so a reprint is identical. The
 * first print is the original; later prints are marked "duplicate copy". Every print is audited.
 */
export async function documentPdf(db: TenantDb, auth: AuthContext, id: string, ip: string | undefined) {
  const doc = await db.billingDocument.findFirst({
    where: { id },
    select: {
      id: true,
      docType: true,
      docNumber: true,
      issuedAt: true,
      linesSnapshot: true,
      branch: { select: { name: true, address: true, phone: true } },
      patient: { select: { fullName: true, phone: true } },
      ledgerEntry: {
        select: {
          amount: true,
          paymentMethod: true,
          reference: true,
          reason: true,
          reverses: { select: { documents: { select: { docNumber: true }, take: 1 } } },
        },
      },
    },
  })
  if (!doc) throw notFound('Document not found.')

  const [clinic, logo, printed] = await Promise.all([
    db.tenant.findFirst({ select: { name: true, address: true, phone: true, registrationDetails: true } }),
    db.tenantLogo.findFirst({ select: { data: true } }),
    db.auditLog.count({ where: { action: 'document.printed', targetId: id } }),
  ])
  if (!clinic) throw notFound('Clinic not found.')

  const data: DocumentPdfData = {
    docType: doc.docType as DocType,
    docNumber: doc.docNumber,
    issuedOn: dayLabel(doc.issuedAt),
    duplicate: printed > 0,
    clinic: { ...clinic, logo: logo ? Buffer.from(logo.data) : null },
    branch: doc.branch,
    patient: { name: doc.patient.fullName, phone: doc.patient.phone },
  }
  if (doc.docType === 'INVOICE') {
    const snapshot = doc.linesSnapshot as unknown as InvoiceSnapshot
    data.invoice = {
      periodLabel: snapshot.periodLabel,
      lines: snapshot.lines,
      total: snapshot.total,
      balanceLabel: snapshot.balanceLabel,
    }
  } else if (doc.ledgerEntry) {
    const entry = doc.ledgerEntry
    data.payment = {
      amount: entry.amount.toFixed(2),
      methodLabel: entry.paymentMethod ? METHOD_LABEL[entry.paymentMethod as PaymentMethod] : '—',
      reference: entry.reference,
      reason: entry.reason,
      reversesNumber: entry.reverses?.documents[0]?.docNumber ?? null,
    }
  }

  const pdf = await renderDocumentPdf(data)
  await recordAudit({
    action: 'document.printed',
    tenantId: auth.tenantId,
    userId: auth.userId,
    branchId: auth.branchId,
    targetType: 'billing_document',
    targetId: id,
    details: { number: doc.docNumber, duplicate: printed > 0 },
    ip,
  })
  return { pdf, filename: `${doc.docNumber.replaceAll('/', '-')}.pdf` }
}

/* --------------------------------------------------------------- invoices */

export interface InvoiceInput {
  patientId: string
  episodeId?: string | undefined
  from?: string | undefined
  to?: string | undefined
  branchId?: string | undefined
}

/**
 * POST /invoices (BILL-007). An invoice on request for one episode or a date range: it lists the sessions charged and
 * keeps that list as a snapshot (DD-5), so a later reversal cannot silently change an invoice already issued. It takes
 * the next invoice number of the branch, and only describes charges; it moves no money. Asking again for an invoice
 * whose sessions and total are exactly those of one already issued returns that invoice and its number (`reused`)
 * instead of burning a new one; if a session was added or reversed since, the content differs and a new invoice is issued.
 */
export async function createInvoice(db: TenantDb, auth: AuthContext, input: InvoiceInput, ip: string | undefined) {
  const patient = await findPatientRef(db, input.patientId)
  if (input.episodeId) {
    const episode = await db.episode.findFirst({
      where: { id: input.episodeId, patientId: patient.id },
      select: { id: true },
    })
    if (!episode) throw validationError([{ field: 'episodeId', message: "Choose one of this patient's episodes." }])
  }
  const range =
    !input.episodeId && input.from && input.to
      ? { start: indiaDayRange(...ymd(input.from)).start, end: indiaDayRange(...ymd(input.to)).end }
      : null

  const visits = await db.visit.findMany({
    where: {
      patientId: patient.id,
      ...(input.episodeId
        ? { episodeId: input.episodeId }
        : range
          ? { visitedAt: { gte: range.start, lt: range.end } }
          : {}),
      ledgerEntries: { none: { entryType: 'CHARGE', reversedBy: { isNot: null } } },
    },
    orderBy: [{ visitedAt: 'asc' }, { id: 'asc' }],
    select: { visitedAt: true, feeAmount: true, therapist: { select: { fullName: true } } },
  })
  if (visits.length === 0) {
    throw validationError([
      { field: input.episodeId ? 'episodeId' : 'from', message: 'There are no sessions to invoice in this period.' },
    ])
  }

  const totalPaise = visits.reduce((sum, v) => sum + (parseMoney(v.feeAmount.toFixed(2)) ?? 0), 0)
  const first = visits[0]!.visitedAt
  const last = visits[visits.length - 1]!.visitedAt
  const balance = toBalance(await netPaiseFor(db, patient.id))
  const snapshot: InvoiceSnapshot = {
    lines: visits.map((v) => ({
      date: dayLabel(v.visitedAt),
      description: v.therapist ? `Physiotherapy session (${v.therapist.fullName})` : 'Physiotherapy session',
      amount: v.feeAmount.toFixed(2),
    })),
    total: formatMoney(totalPaise),
    periodLabel:
      first.getTime() === last.getTime() || dayLabel(first) === dayLabel(last)
        ? dayLabel(first)
        : `${dayLabel(first)} to ${dayLabel(last)}`,
    balanceLabel:
      balance.state === 'due'
        ? `Balance due on the account: ${rupees(balance.amount)}`
        : balance.state === 'credit'
          ? `Advance credit on the account: ${rupees(balance.amount)}`
          : 'Account settled',
  }

  const fingerprint = invoiceFingerprint(snapshot)
  const earlier = await db.billingDocument.findMany({
    where: { patientId: patient.id, docType: 'INVOICE' },
    orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, docNumber: true, linesSnapshot: true },
  })
  const same = earlier.find(
    (doc) =>
      doc.linesSnapshot !== null && invoiceFingerprint(doc.linesSnapshot as unknown as InvoiceSnapshot) === fingerprint,
  )
  if (same) {
    return { id: same.id, number: same.docNumber, total: snapshot.total, sessions: visits.length, reused: true }
  }

  const branch = await actingBranch(db, auth, input.branchId, patient.registeredBranchId)
  const fy = currentFinancialYear()
  await ensureSequence(db, branch.id, 'INVOICE', fy)
  const toDay = (d: Date) => {
    const p = indiaToday(d)
    return dateOnly(p.year, p.month, p.day)
  }

  const document = await db.$transaction(async (tx) => {
    const issued = await issueDocument(tx, {
      branch,
      patientId: patient.id,
      docType: 'INVOICE',
      fy,
      ledgerEntryId: null,
      issuedById: auth.userId,
      linesSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      periodFrom: toDay(first),
      periodTo: toDay(last),
    })
    await auditIn(tx, auth, ip, 'document.issued', 'billing_document', issued.id, {
      patientId: patient.id,
      type: 'INVOICE',
      number: issued.docNumber,
      sessions: visits.length,
      total: snapshot.total,
    })
    return issued
  }, MONEY_TX)
  return {
    id: document.id,
    number: document.docNumber,
    total: snapshot.total,
    sessions: visits.length,
    reused: false,
  }
}

/** "YYYY-MM-DD" already checked by the schema. */
function ymd(value: string): [number, number, number] {
  const parts = parseIsoDate(value)!
  return [parts.year, parts.month, parts.day]
}
