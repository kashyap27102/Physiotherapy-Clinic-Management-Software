import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import type { AuthContext } from '../../auth/context.js'
import type { TenantDb } from '../../db/tenantScope.js'
import type { Prisma } from '../../generated/prisma/client.js'
import { AppError, validationError } from '../../lib/errors.js'
import { formatMoney, indiaDayRange } from '../billing/billingRules.js'
import { actingBranch, defaultFeePaise } from '../billing/ledger.js'
import { dateOnly, indiaToday } from '../patients/patientRules.js'
import { dayNumber, isoDay, middayOf, notReversed, resolveVisitDay, type DayParts } from './visits.service.js'

export interface BulkVisitsInput {
  /** One visit per patient and day. Both bulk screens (many days for one patient, many patients for one day) send this. */
  entries: { patientId: string; date: DayParts }[]
  therapistId?: string | undefined
  branchId?: string | undefined
  /** Why earlier days are being added late; required when any day is not today. */
  reason?: string | undefined
  /** Allows a visit on a day the patient already has one. */
  confirmDuplicates?: boolean | undefined
}

/** One entry that cannot be saved, for the screen to list. */
export interface BulkProblem {
  patientId: string
  patientName: string | null
  /** YYYY-MM-DD */
  date: string
  code: string
  message: string
}

/** A batch of visits is one all-or-nothing save, so it is kept to what fits comfortably in one transaction (see MAX_BULK_ENTRIES). */
const BULK_TX = { timeout: 60_000, maxWait: 10_000 } as const

interface Planned {
  id: string
  patientId: string
  episodeId: string
  branchId: string
  day: DayParts
  backdated: boolean
  reason: string | null
}

/**
 * POST /visits/bulk (VIS-001): marks many visits in one transaction, for catching up after forgotten days or for
 * marking a whole day's patients at once. Every entry follows the same rules as a single visit (active episode, the
 * back-date rule, the default fee, duplicates on the same day) and nothing is saved unless every entry passes: the
 * answer then lists each problem. Bulk uses the clinic's default fee; a different fee is a single-visit action.
 */
export async function createBulkVisits(
  db: TenantDb,
  auth: AuthContext,
  input: BulkVisitsInput,
  ip: string | undefined,
) {
  const ids = [...new Set(input.entries.map((entry) => entry.patientId))]
  const [patients, episodes] = await Promise.all([
    db.patient.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }),
    db.episode.findMany({
      where: { patientId: { in: ids }, status: 'active' },
      select: { id: true, patientId: true, startedBranchId: true, startedAt: true },
    }),
  ])
  const patientById = new Map(patients.map((p) => [p.id, p]))
  const episodeByPatient = new Map(episodes.map((e) => [e.patientId, e]))

  if (input.therapistId) {
    const therapist = await db.userAccount.findFirst({
      where: { id: input.therapistId, isActive: true },
      select: { id: true },
    })
    if (!therapist) throw validationError([{ field: 'therapistId', message: 'Choose an active staff member.' }])
  }

  const feePaise = await defaultFeePaise(db)
  const problems: BulkProblem[] = []
  const planned: Planned[] = []
  const branches = new Map<string, Awaited<ReturnType<typeof actingBranch>>>()

  for (const entry of input.entries) {
    const patient = patientById.get(entry.patientId)
    const problem = (code: string, message: string) =>
      problems.push({
        patientId: entry.patientId,
        patientName: patient?.fullName ?? null,
        date: isoDay(entry.date),
        code,
        message,
      })
    if (!patient) {
      problem('NOT_FOUND', 'Patient not found.')
      continue
    }
    const episode = episodeByPatient.get(patient.id)
    if (!episode) {
      problem('NO_ACTIVE_EPISODE', 'No active episode. Start one first.')
      continue
    }
    try {
      const resolved = resolveVisitDay(auth, entry.date, input.reason, episode.startedAt)
      const wanted = auth.branchId ?? input.branchId ?? episode.startedBranchId
      let branch = branches.get(wanted)
      if (!branch) {
        branch = await actingBranch(db, auth, input.branchId, episode.startedBranchId)
        branches.set(wanted, branch)
      }
      planned.push({
        id: randomUUID(),
        patientId: patient.id,
        episodeId: episode.id,
        branchId: branch.id,
        day: resolved.day,
        backdated: resolved.backdated,
        reason: resolved.reason,
      })
    } catch (error) {
      // Not being allowed to back-date at all is the whole request's problem, not one entry's.
      if (!(error instanceof AppError) || error.status === 403) throw error
      problem(error.code, error.fields[0]?.message ?? error.message)
    }
  }

  // A patient already marked present that day is a duplicate unless the user confirms (the same rule as one visit).
  if (planned.length > 0 && !input.confirmDuplicates) {
    const ranges = planned.map((p) => indiaDayRange(p.day.year, p.day.month, p.day.day))
    const existing = await db.visit.findMany({
      where: {
        patientId: { in: [...new Set(planned.map((p) => p.patientId))] },
        visitedAt: {
          gte: new Date(Math.min(...ranges.map((r) => r.start.getTime()))),
          lt: new Date(Math.max(...ranges.map((r) => r.end.getTime()))),
        },
        ...notReversed,
      },
      select: { patientId: true, visitedAt: true },
    })
    const taken = new Set(existing.map((v) => `${v.patientId}|${dayNumber(indiaToday(v.visitedAt))}`))
    for (const p of planned) {
      if (!taken.has(`${p.patientId}|${dayNumber(p.day)}`)) continue
      problems.push({
        patientId: p.patientId,
        patientName: patientById.get(p.patientId)?.fullName ?? null,
        date: isoDay(p.day),
        code: 'DUPLICATE_VISIT_TODAY',
        message: 'Already has a visit on this day.',
      })
    }
  }

  if (problems.length > 0) {
    problems.sort((a, b) => a.date.localeCompare(b.date) || (a.patientName ?? '').localeCompare(b.patientName ?? ''))
    const onlyDuplicates = problems.every((p) => p.code === 'DUPLICATE_VISIT_TODAY')
    throw onlyDuplicates
      ? new AppError(409, 'DUPLICATE_VISIT_TODAY', 'Some of these patients already have a visit on that day.', {
          details: { problems },
        })
      : new AppError(422, 'VALIDATION_FAILED', 'Some visits cannot be saved, so none of them were.', {
          details: { problems },
        })
  }

  const ipAddress = ip && isIP(ip) ? ip : null
  await db.$transaction(async (tx) => {
    await tx.visit.createMany({
      data: planned.map((p) => ({
        id: p.id,
        branchId: p.branchId,
        patientId: p.patientId,
        episodeId: p.episodeId,
        therapistId: input.therapistId ?? null,
        feeAmount: formatMoney(feePaise),
        markedById: auth.userId,
        ...(p.backdated ? { visitedAt: middayOf(p.day) } : {}),
      })) as Prisma.VisitCreateManyInput[],
    })
    // Zero-fee visits still get a charge row so the session counts (DD-2).
    await tx.ledgerEntry.createMany({
      data: planned.map((p) => ({
        branchId: p.branchId,
        patientId: p.patientId,
        episodeId: p.episodeId,
        visitId: p.id,
        entryType: 'CHARGE',
        amount: formatMoney(feePaise),
        entryDate: dateOnly(p.day.year, p.day.month, p.day.day),
        createdById: auth.userId,
      })) as Prisma.LedgerEntryCreateManyInput[],
    })
    await tx.auditLog.createMany({
      data: planned.flatMap((p) => [
        {
          action: 'visit.marked',
          userId: auth.userId,
          branchId: auth.branchId,
          targetType: 'visit',
          targetId: p.id,
          details: { patientId: p.patientId, episodeId: p.episodeId, fee: formatMoney(feePaise), bulk: true },
          ipAddress,
        },
        ...(p.backdated
          ? [
              {
                action: 'visit.backdated',
                userId: auth.userId,
                branchId: auth.branchId,
                targetType: 'visit',
                targetId: p.id,
                details: { visitDate: isoDay(p.day), reason: p.reason, bulk: true },
                ipAddress,
              },
            ]
          : []),
      ]) as Prisma.AuditLogCreateManyInput[],
    })
  }, BULK_TX)

  return {
    created: planned.length,
    totalFee: formatMoney(feePaise * planned.length),
    visits: planned.map((p) => ({
      visitId: p.id,
      patientId: p.patientId,
      patientName: patientById.get(p.patientId)?.fullName ?? null,
      date: isoDay(p.day),
    })),
  }
}
