import type { AuthContext } from '../../auth/context.js'
import type { TenantDb } from '../../db/tenantScope.js'
import { Prisma } from '../../generated/prisma/client.js'
import { AppError, forbidden, notFound, validationError } from '../../lib/errors.js'
import { recordAudit } from '../auth/audit.js'
import { formatMoney, indiaDayRange, toBalance, type BalanceView } from '../billing/billingRules.js'
import { reverseEntry } from '../billing/billing.service.js'
import { actingBranch, auditIn, balancesFor, defaultFeePaise, MONEY_TX, netPaiseFor } from '../billing/ledger.js'
import { dateOnly, indiaToday } from '../patients/patientRules.js'
import { sameContent, planProgress } from '../clinical/clinicalRules.js'

/* ---------------------------------------------------------------- shapes */

/** A visit is "reversed" when its charge has a reversal (DD-3): there is no status column to drift. */
export const notReversed = { ledgerEntries: { none: { entryType: 'CHARGE', reversedBy: { isNot: null } } } } as const

const visitSelect = {
  id: true,
  patientId: true,
  episodeId: true,
  visitedAt: true,
  feeAmount: true,
  feeOverrideReason: true,
  branch: { select: { id: true, name: true } },
  therapist: { select: { fullName: true } },
  ledgerEntries: { where: { entryType: 'CHARGE' }, select: { id: true, reversedBy: { select: { id: true } } } },
  notes: { select: { version: true }, orderBy: { version: 'desc' }, take: 1 },
} as const satisfies Prisma.VisitSelect

type VisitRow = Prisma.VisitGetPayload<{ select: typeof visitSelect }>

export interface VisitRecordDto {
  id: string
  episodeId: string
  visitedAt: Date
  branchId: string
  branchName: string
  therapistName: string | null
  fee: string
  feeOverrideReason: string | null
  reversed: boolean
  /** The charge a reversal of this visit cancels. */
  chargeEntryId: string | null
  hasNote: boolean
}

const toVisit = (row: VisitRow): VisitRecordDto => ({
  id: row.id,
  episodeId: row.episodeId,
  visitedAt: row.visitedAt,
  branchId: row.branch.id,
  branchName: row.branch.name,
  therapistName: row.therapist?.fullName ?? null,
  fee: row.feeAmount.toFixed(2),
  feeOverrideReason: row.feeOverrideReason,
  reversed: row.ledgerEntries.some((entry) => entry.reversedBy !== null),
  chargeEntryId: row.ledgerEntries[0]?.id ?? null,
  hasNote: row.notes.length > 0,
})

const visibleBalance = (auth: AuthContext, balance: BalanceView): BalanceView | null =>
  auth.permissions.has('ledger.view') ? balance : null

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

async function findVisit(db: TenantDb, id: string): Promise<VisitRow> {
  // A visit of another clinic is simply not found, so it answers 404.
  const row = await db.visit.findFirst({ where: { id }, select: visitSelect })
  if (!row) throw notFound('Visit not found.')
  return row
}

/* -------------------------------------------------------- reads for others */

/** Sessions an episode has had: its visits whose charge has not been reversed (ER section 4). */
export function sessionCountForEpisode(db: TenantDb, episodeId: string): Promise<number> {
  return db.visit.count({ where: { episodeId, ...notReversed } })
}

/** When and where each patient was last seen, for the patient list (PAT-002). Reversed visits do not count. */
export async function lastVisitsFor(
  db: TenantDb,
  patientIds: string[],
): Promise<Map<string, { at: Date; branchName: string }>> {
  const map = new Map<string, { at: Date; branchName: string }>()
  if (patientIds.length === 0) return map
  const rows = await db.visit.findMany({
    where: { patientId: { in: patientIds }, ...notReversed },
    orderBy: [{ visitedAt: 'desc' }, { id: 'desc' }],
    distinct: ['patientId'],
    select: { patientId: true, visitedAt: true, branch: { select: { name: true } } },
  })
  for (const row of rows) map.set(row.patientId, { at: row.visitedAt, branchName: row.branch.name })
  return map
}

/* ------------------------------------------------------------------ today */

/**
 * GET /visits/today (VIS-001): today's visits in India time. Branch-assigned staff see their own branch; an owner sees
 * all branches or one chosen. Each row carries the patient's balance for the dues indicator (BILL-008).
 */
export async function listTodayVisits(db: TenantDb, auth: AuthContext, requestedBranchId: string | undefined) {
  const { year, month, day } = indiaToday()
  const { start, end } = indiaDayRange(year, month, day)
  const branchId = auth.branchId ?? requestedBranchId
  const rows = await db.visit.findMany({
    where: { visitedAt: { gte: start, lt: end }, ...(branchId ? { branchId } : {}) },
    orderBy: [{ visitedAt: 'desc' }, { id: 'desc' }],
    take: 300,
    select: { ...visitSelect, patient: { select: { id: true, fullName: true, phone: true } } },
  })
  const balances = auth.permissions.has('ledger.view')
    ? await balancesFor(db, [...new Set(rows.map((row) => row.patientId))])
    : null
  return {
    items: rows.map((row) => ({
      ...toVisit(row),
      patientId: row.patient.id,
      patientName: row.patient.fullName,
      patientPhone: row.patient.phone,
      balance: balances ? (balances.get(row.patientId) ?? null) : null,
    })),
  }
}

/* ----------------------------------------------------------------- create */

export interface DayParts {
  year: number
  month: number
  day: number
}

export const dayNumber = (d: DayParts) => d.year * 10000 + d.month * 100 + d.day
const pad2 = (n: number) => String(n).padStart(2, '0')
export const isoDay = (d: DayParts) => `${d.year}-${pad2(d.month)}-${pad2(d.day)}`

/**
 * The India day a visit counts for: today, or an earlier day for a user holding `visit.backdate` (VIS-001, OQ-14).
 * An earlier day needs a reason, and cannot be in the future or before the episode began. Shared by single and bulk
 * attendance so both follow the same rule.
 */
export function resolveVisitDay(
  auth: AuthContext,
  requested: DayParts | null | undefined,
  reason: string | undefined,
  episodeStartedAt: Date,
): { day: DayParts; backdated: boolean; reason: string | null } {
  const today = indiaToday()
  if (!requested || dayNumber(requested) === dayNumber(today)) return { day: today, backdated: false, reason: null }
  if (!auth.permissions.has('visit.backdate')) {
    throw forbidden('Your role cannot mark attendance for an earlier day.')
  }
  if (dayNumber(requested) > dayNumber(today)) {
    throw validationError([{ field: 'visitDate', message: 'The visit date cannot be in the future.' }])
  }
  if (dayNumber(requested) < dayNumber(indiaToday(episodeStartedAt))) {
    throw validationError([{ field: 'visitDate', message: 'The visit date is before this episode started.' }])
  }
  const why = reason?.trim() ?? ''
  if (!why) throw validationError([{ field: 'backdateReason', message: 'Say why attendance is being added late.' }])
  return { day: requested, backdated: true, reason: why }
}

/** A late entry is stamped at midday of its day (India time), so it sorts inside that day, not at the time of typing. */
export const middayOf = (d: DayParts) => new Date(`${isoDay(d)}T12:00:00+05:30`)

export interface CreateVisitInput {
  patientId: string
  therapistId?: string | undefined
  branchId?: string | undefined
  feeOverride?: { amount: number; reason: string } | undefined
  /** An earlier India day the visit really happened on; null or today means "now". Needs `visit.backdate`. */
  visitDate?: { year: number; month: number; day: number } | null | undefined
  backdateReason?: string | undefined
  confirmSecondVisitToday?: boolean | undefined
}

/**
 * POST /visits (VIS-001, BILL-001). Marks a patient present: the visit and its charge are written in one transaction,
 * with the fee stored as it was at that moment (BR-BILL-1). Needs an active episode. Dues only warn, never block
 * (BR-VIS-4). A second visit on the same day asks for confirmation. A fee other than the default needs `fee.override`
 * and a reason, which is audited. Attendance forgotten on an earlier day can be entered with `visitDate`, but only by a
 * user holding `visit.backdate`, with a reason; the date cannot be in the future or before the episode began.
 */
export async function createVisit(db: TenantDb, auth: AuthContext, input: CreateVisitInput, ip: string | undefined) {
  const patient = await db.patient.findFirst({ where: { id: input.patientId }, select: { id: true } })
  if (!patient) throw notFound('Patient not found.')

  const episode = await db.episode.findFirst({
    where: { patientId: patient.id, status: 'active' },
    select: { id: true, startedBranchId: true, startedAt: true },
  })
  if (!episode) {
    throw new AppError(
      409,
      'NO_ACTIVE_EPISODE',
      'This patient has no active episode. Start an episode before marking attendance.',
    )
  }

  // The day the visit counts for: today, or an earlier day for a permitted user (VIS-001, OQ-14).
  const {
    day: visitDay,
    backdated,
    reason: backdateReason,
  } = resolveVisitDay(auth, input.visitDate, input.backdateReason, episode.startedAt)
  const { year, month, day } = visitDay

  const branch = await actingBranch(db, auth, input.branchId, episode.startedBranchId)

  if (input.therapistId) {
    const therapist = await db.userAccount.findFirst({
      where: { id: input.therapistId, isActive: true },
      select: { id: true },
    })
    if (!therapist) throw validationError([{ field: 'therapistId', message: 'Choose an active staff member.' }])
  }

  // Fee: the clinic default, unless a permitted user names another with a reason.
  const standardPaise = await defaultFeePaise(db)
  let feePaise = standardPaise
  let overrideReason: string | null = null
  if (input.feeOverride) {
    if (!auth.permissions.has('fee.override')) throw forbidden('Your role cannot change the session fee.')
    if (input.feeOverride.amount !== standardPaise) {
      if (!input.feeOverride.reason.trim()) {
        throw new AppError(422, 'FEE_REASON_REQUIRED', 'A reason is required when the fee is changed.', {
          fields: [{ field: 'feeOverride.reason', message: 'A reason is required when the fee is changed.' }],
        })
      }
      feePaise = input.feeOverride.amount
      overrideReason = input.feeOverride.reason.trim()
    }
  }

  const dayRange = indiaDayRange(year, month, day)
  const earlier = await db.visit.count({
    where: { patientId: patient.id, visitedAt: { gte: dayRange.start, lt: dayRange.end }, ...notReversed },
  })
  if (earlier > 0 && !input.confirmSecondVisitToday) {
    throw new AppError(
      409,
      'DUPLICATE_VISIT_TODAY',
      backdated
        ? 'This patient already has a visit on that day. Mark another session?'
        : 'This patient already has a visit today. Mark another session?',
    )
  }
  const visitedAt = backdated ? middayOf(visitDay) : undefined

  const before = await netPaiseFor(db, patient.id)

  const created = await db.$transaction(async (tx) => {
    const visit = await tx.visit.create({
      data: {
        branchId: branch.id,
        patientId: patient.id,
        episodeId: episode.id,
        therapistId: input.therapistId ?? null,
        feeAmount: formatMoney(feePaise),
        feeOverrideReason: overrideReason,
        markedById: auth.userId,
        ...(visitedAt ? { visitedAt } : {}),
      } as Prisma.VisitUncheckedCreateInput,
      select: { id: true },
    })
    // Zero-fee visits still get a charge row so the session counts (DD-2).
    await tx.ledgerEntry.create({
      data: {
        branchId: branch.id,
        patientId: patient.id,
        episodeId: episode.id,
        visitId: visit.id,
        entryType: 'CHARGE',
        amount: formatMoney(feePaise),
        entryDate: dateOnly(year, month, day),
        createdById: auth.userId,
      } as Prisma.LedgerEntryUncheckedCreateInput,
      select: { id: true },
    })
    await auditIn(tx, auth, ip, 'visit.marked', 'visit', visit.id, {
      patientId: patient.id,
      episodeId: episode.id,
      fee: formatMoney(feePaise),
    })
    if (backdated) {
      await auditIn(tx, auth, ip, 'visit.backdated', 'visit', visit.id, {
        visitDate: isoDay(visitDay),
        reason: backdateReason,
      })
    }
    if (overrideReason !== null) {
      await auditIn(tx, auth, ip, 'visit.fee_overridden', 'visit', visit.id, {
        defaultFee: formatMoney(standardPaise),
        fee: formatMoney(feePaise),
        reason: overrideReason,
      })
    }
    return visit
  }, MONEY_TX)

  const [row, sessionNumber, plan] = await Promise.all([
    findVisit(db, created.id),
    sessionCountForEpisode(db, episode.id),
    db.treatmentPlan.findFirst({
      where: { episodeId: episode.id },
      orderBy: { version: 'desc' },
      select: { plannedSessions: true },
    }),
  ])
  const progress = planProgress(sessionNumber, plan?.plannedSessions ?? null)
  return {
    visit: toVisit(row),
    sessionNumber,
    planProgress: { planned: progress.plannedSessions, planExceeded: progress.exceeded },
    balanceAfter: visibleBalance(auth, toBalance(before + feePaise)),
    duesWarning: before > 0 && auth.permissions.has('ledger.view') ? { amount: formatMoney(before) } : null,
  }
}

/* ------------------------------------------------------------------- read */

/** GET /visits/:id (VIS-003). */
export async function getVisit(db: TenantDb, id: string) {
  return toVisit(await findVisit(db, id))
}

/** GET /patients/:id/visits (VIS-003): every visit across episodes and branches, newest first, tagged with the branch. */
export async function listPatientVisits(db: TenantDb, patientId: string) {
  const patient = await db.patient.findFirst({ where: { id: patientId }, select: { id: true } })
  if (!patient) throw notFound('Patient not found.')
  const rows = await db.visit.findMany({
    where: { patientId },
    orderBy: [{ visitedAt: 'desc' }, { id: 'desc' }],
    select: visitSelect,
  })
  return { items: rows.map(toVisit) }
}

/** GET /branches/current/therapists: who can be named as treating a visit. Staff see their own branch's physiotherapists. */
export async function listTherapists(db: TenantDb, auth: AuthContext) {
  const rows = await db.userAccount.findMany({
    where: { isActive: true, role: { key: 'physiotherapist' }, ...(auth.branchId ? { branchId: auth.branchId } : {}) },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true },
  })
  return rows
}

/* --------------------------------------------------------------- reversal */

/** POST /visits/:id/reverse (BILL-005): reverses the visit's charge, so the session no longer counts. */
export async function reverseVisit(
  db: TenantDb,
  auth: AuthContext,
  id: string,
  reason: string,
  ip: string | undefined,
) {
  const visit = await findVisit(db, id)
  const chargeId = visit.ledgerEntries[0]?.id
  if (!chargeId) throw notFound('Visit not found.')
  return reverseEntry(db, auth, chargeId, reason, ip)
}

/* ------------------------------------------------------------------ notes */

const noteSelect = {
  id: true,
  visitId: true,
  version: true,
  noteText: true,
  createdAt: true,
  author: { select: { fullName: true } },
} as const

type NoteRow = Prisma.SessionNoteGetPayload<{ select: typeof noteSelect }>

const toNote = (row: NoteRow) => ({
  id: row.id,
  visitId: row.visitId,
  version: row.version,
  noteText: row.noteText,
  author: row.author.fullName,
  createdAt: row.createdAt,
})

/** GET /visits/:id/notes (VIS-002): every version, newest first. Each look is audited. */
export async function listNotes(db: TenantDb, auth: AuthContext, visitId: string, ip: string | undefined) {
  await findVisit(db, visitId)
  const rows = await db.sessionNote.findMany({ where: { visitId }, orderBy: { version: 'desc' }, select: noteSelect })
  await recordAudit({
    action: 'visit.note_viewed',
    tenantId: auth.tenantId,
    userId: auth.userId,
    branchId: auth.branchId,
    targetType: 'visit',
    targetId: visitId,
    ip,
  })
  return { items: rows.map(toNote) }
}

/**
 * POST /visits/:id/notes (VIS-002). The next version of the visit's note; the earlier ones stay. Saving the same text
 * again creates nothing (`created` tells the route to answer 200 instead of 201).
 */
export async function saveNote(
  db: TenantDb,
  auth: AuthContext,
  visitId: string,
  noteText: string,
  ip: string | undefined,
) {
  const visit = await findVisit(db, visitId)
  const episode = await db.episode.findFirst({ where: { id: visit.episodeId }, select: { status: true } })
  if (episode?.status !== 'active') {
    throw new AppError(409, 'NO_ACTIVE_EPISODE', 'This episode is discharged. Notes can no longer be added.')
  }
  const latest = await db.sessionNote.findFirst({
    where: { visitId },
    orderBy: { version: 'desc' },
    select: noteSelect,
  })
  if (latest && sameContent({ noteText: latest.noteText }, { noteText }))
    return { created: false, note: toNote(latest) }
  try {
    const row = await db.sessionNote.create({
      data: {
        visitId,
        version: (latest?.version ?? 0) + 1,
        noteText,
        authorId: auth.userId,
      } as Prisma.SessionNoteUncheckedCreateInput,
      select: noteSelect,
    })
    await recordAudit({
      action: 'visit.note_created',
      tenantId: auth.tenantId,
      userId: auth.userId,
      branchId: auth.branchId,
      targetType: 'visit',
      targetId: visitId,
      details: { version: row.version },
      ip,
    })
    return { created: true, note: toNote(row) }
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'Someone else saved a newer version at the same moment. Reload and try again.',
      )
    }
    throw error
  }
}
