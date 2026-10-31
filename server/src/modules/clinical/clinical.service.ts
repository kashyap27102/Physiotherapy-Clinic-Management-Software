import type { AuthContext } from '../../auth/context.js'
import type { TenantDb } from '../../db/tenantScope.js'
import { Prisma } from '../../generated/prisma/client.js'
import { AppError, notFound, validationError } from '../../lib/errors.js'
import { recordAudit } from '../auth/audit.js'
import { balanceFor } from '../patients/patients.service.js'
import { sessionCountForEpisode } from '../visits/visits.service.js'
import {
  isEmptyAssessment,
  isEmptyPlan,
  planProgress,
  sameContent,
  type AssessmentContent,
  type PlanContent,
} from './clinicalRules.js'

/* ---------------------------------------------------------------- shapes */

const episodeSelect = {
  id: true,
  patientId: true,
  status: true,
  startedAt: true,
  dischargedAt: true,
  dischargeNote: true,
  startedBranch: { select: { id: true, name: true } },
  dischargedBy: { select: { fullName: true } },
} as const

type EpisodeRow = Prisma.EpisodeGetPayload<{ select: typeof episodeSelect }>

export interface EpisodeDto {
  id: string
  patientId: string
  status: 'active' | 'discharged'
  startedAt: Date
  startedBranch: { id: string; name: string }
  dischargedAt: Date | null
  dischargeNote: string | null
  dischargedBy: string | null
}

const toEpisode = (row: EpisodeRow): EpisodeDto => ({
  id: row.id,
  patientId: row.patientId,
  status: row.status as 'active' | 'discharged',
  startedAt: row.startedAt,
  startedBranch: row.startedBranch,
  dischargedAt: row.dischargedAt,
  dischargeNote: row.dischargeNote,
  dischargedBy: row.dischargedBy?.fullName ?? null,
})

const assessmentSelect = {
  id: true,
  episodeId: true,
  version: true,
  history: true,
  pain: true,
  rangeOfMotion: true,
  diagnosis: true,
  extraFields: true,
  createdAt: true,
  author: { select: { fullName: true } },
} as const

type AssessmentRow = Prisma.AssessmentGetPayload<{ select: typeof assessmentSelect }>

const toAssessment = (row: AssessmentRow) => ({
  id: row.id,
  episodeId: row.episodeId,
  version: row.version,
  history: row.history,
  pain: row.pain,
  rangeOfMotion: row.rangeOfMotion,
  diagnosis: row.diagnosis,
  extraFields: row.extraFields as Record<string, string | number>,
  author: row.author.fullName,
  createdAt: row.createdAt,
})

const assessmentContent = (row: AssessmentRow): AssessmentContent => ({
  history: row.history,
  pain: row.pain,
  rangeOfMotion: row.rangeOfMotion,
  diagnosis: row.diagnosis,
  extraFields: row.extraFields as Record<string, string | number>,
})

const planSelect = {
  id: true,
  episodeId: true,
  version: true,
  diagnosis: true,
  goals: true,
  plannedSessions: true,
  frequency: true,
  therapyTypes: true,
  estimatedCost: true,
  notes: true,
  createdAt: true,
  author: { select: { fullName: true } },
} as const

type PlanRow = Prisma.TreatmentPlanGetPayload<{ select: typeof planSelect }>

const planContent = (row: PlanRow): PlanContent => ({
  diagnosis: row.diagnosis,
  goals: row.goals,
  plannedSessions: row.plannedSessions,
  frequency: row.frequency,
  therapyTypes: row.therapyTypes,
  estimatedCost: row.estimatedCost?.toFixed(2) ?? null,
  notes: row.notes,
})

const toPlan = (row: PlanRow) => ({
  id: row.id,
  episodeId: row.episodeId,
  version: row.version,
  ...planContent(row),
  author: row.author.fullName,
  createdAt: row.createdAt,
})

/* --------------------------------------------------------------- helpers */

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

const alreadyActive = () =>
  new AppError(409, 'EPISODE_ALREADY_ACTIVE', 'This patient already has an active episode. Discharge it first.')

const notActive = () =>
  new AppError(409, 'NO_ACTIVE_EPISODE', 'This episode is discharged. Start a new episode to continue treatment.')

const versionConflict = () =>
  new AppError(409, 'VERSION_CONFLICT', 'Someone else saved a newer version at the same moment. Reload and try again.')

async function findEpisode(db: TenantDb, id: string): Promise<EpisodeRow> {
  // An episode of another clinic is simply not found, so it answers 404.
  const row = await db.episode.findFirst({ where: { id }, select: episodeSelect })
  if (!row) throw notFound('Episode not found.')
  return row
}

async function findActiveEpisode(db: TenantDb, id: string): Promise<EpisodeRow> {
  const row = await findEpisode(db, id)
  if (row.status !== 'active') throw notActive()
  return row
}

const audit = (
  auth: AuthContext,
  ip: string | undefined,
  action: Parameters<typeof recordAudit>[0]['action'],
  targetType: string,
  targetId: string,
  details?: Prisma.InputJsonValue,
) =>
  recordAudit({
    action,
    tenantId: auth.tenantId,
    userId: auth.userId,
    branchId: auth.branchId,
    targetType,
    targetId,
    ...(details === undefined ? {} : { details }),
    ip,
  })

/* -------------------------------------------------------------- episodes */

/** GET /patients/:id/episodes (CLN-001): every episode of the patient, newest first. */
export async function listEpisodes(db: TenantDb, patientId: string) {
  const patient = await db.patient.findFirst({ where: { id: patientId }, select: { id: true } })
  if (!patient) throw notFound('Patient not found.')
  const rows = await db.episode.findMany({
    where: { patientId },
    select: episodeSelect,
    orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
  })
  return { items: rows.map(toEpisode) }
}

/**
 * POST /patients/:id/episodes (CLN-001, US-25). A patient has at most one active episode; the partial unique index
 * settles two simultaneous requests. Starting one makes the patient active again. Earlier episodes stay unchanged.
 */
export async function startEpisode(
  db: TenantDb,
  auth: AuthContext,
  patientId: string,
  input: { branchId?: string | undefined },
  ip: string | undefined,
): Promise<EpisodeDto> {
  const patient = await db.patient.findFirst({ where: { id: patientId }, select: { id: true } })
  if (!patient) throw notFound('Patient not found.')

  const branchId = auth.branchId ?? input.branchId
  if (!branchId) {
    throw validationError([{ field: 'branchId', message: 'Choose the branch this episode starts at.' }])
  }
  const branch = await db.branch.findFirst({ where: { id: branchId, isActive: true }, select: { id: true } })
  if (!branch) throw validationError([{ field: 'branchId', message: 'Choose an active branch.' }])

  if (await db.episode.findFirst({ where: { patientId, status: 'active' }, select: { id: true } })) {
    throw alreadyActive()
  }

  let row: EpisodeRow
  try {
    row = await db.$transaction(async (tx) => {
      const created = await tx.episode.create({
        data: { patientId, startedBranchId: branch.id } as Prisma.EpisodeUncheckedCreateInput,
        select: episodeSelect,
      })
      await tx.patient.update({ where: { id: patientId }, data: { status: 'active' } })
      return created
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw alreadyActive()
    throw error
  }
  await audit(auth, ip, 'episode.started', 'episode', row.id, { patientId, branchId: branch.id })
  return toEpisode(row)
}

/** GET /episodes/:id (CLN-001): the episode with its latest assessment and plan, and plan progress. */
export async function viewEpisode(db: TenantDb, auth: AuthContext, id: string, ip: string | undefined) {
  const episode = await findEpisode(db, id)
  const [assessment, plan] = await Promise.all([
    db.assessment.findFirst({ where: { episodeId: id }, orderBy: { version: 'desc' }, select: assessmentSelect }),
    db.treatmentPlan.findFirst({ where: { episodeId: id }, orderBy: { version: 'desc' }, select: planSelect }),
  ])
  // Sessions are the episode's visits whose charge has not been reversed (ER section 4).
  const sessionsDone = await sessionCountForEpisode(db, id)
  await audit(auth, ip, 'episode.viewed', 'episode', id)
  return {
    episode: toEpisode(episode),
    assessment: assessment ? toAssessment(assessment) : null,
    plan: plan ? toPlan(plan) : null,
    sessionCount: sessionsDone,
    progress: planProgress(sessionsDone, plan?.plannedSessions ?? null),
  }
}

/**
 * POST /episodes/:id/discharge (CLN-004, US-24). Dues never block it (BR-CLN-7): the response carries the balance so
 * the screen can prompt to settle, or to refund or keep an advance. The patient becomes inactive.
 */
export async function dischargeEpisode(
  db: TenantDb,
  auth: AuthContext,
  id: string,
  input: { note: string | null },
  ip: string | undefined,
) {
  const episode = await findActiveEpisode(db, id)
  const done = await db.$transaction(async (tx) => {
    // Guarded by status, so two simultaneous discharges cannot both win.
    const changed = await tx.episode.updateMany({
      where: { id, status: 'active' },
      data: { status: 'discharged', dischargedAt: new Date(), dischargedById: auth.userId, dischargeNote: input.note },
    })
    if (changed.count === 0) return false
    await tx.patient.update({ where: { id: episode.patientId }, data: { status: 'inactive' } })
    return true
  })
  if (!done) throw notActive()

  await audit(auth, ip, 'episode.discharged', 'episode', id, {
    patientId: episode.patientId,
    hasNote: input.note !== null,
  })
  return { episode: toEpisode(await findEpisode(db, id)), balance: await balanceFor(db, auth, episode.patientId) }
}

/* ----------------------------------------------------------- assessments */

/** GET /episodes/:id/assessments (CLN-002): every version, newest first. Each look is audited (US-12.5). */
export async function listAssessments(db: TenantDb, auth: AuthContext, episodeId: string, ip: string | undefined) {
  await findEpisode(db, episodeId)
  const rows = await db.assessment.findMany({
    where: { episodeId },
    select: assessmentSelect,
    orderBy: { version: 'desc' },
  })
  await audit(auth, ip, 'assessment.viewed', 'episode', episodeId)
  return { items: rows.map(toAssessment) }
}

/**
 * POST /episodes/:id/assessments (CLN-002, US-12). Saves the next version (BR-CLN-4); the earlier ones stay. Saving the
 * same content again creates nothing. `created` tells the route whether to answer 201 or 200.
 */
export async function saveAssessment(
  db: TenantDb,
  auth: AuthContext,
  episodeId: string,
  content: AssessmentContent,
  ip: string | undefined,
) {
  await findActiveEpisode(db, episodeId)
  if (isEmptyAssessment(content)) {
    throw validationError([{ field: 'history', message: 'Write something in the assessment before saving.' }])
  }
  const latest = await db.assessment.findFirst({
    where: { episodeId },
    orderBy: { version: 'desc' },
    select: assessmentSelect,
  })
  if (latest && sameContent(assessmentContent(latest), content)) {
    return { created: false, assessment: toAssessment(latest) }
  }
  try {
    const row = await db.assessment.create({
      data: {
        episodeId,
        version: (latest?.version ?? 0) + 1,
        history: content.history,
        pain: content.pain,
        rangeOfMotion: content.rangeOfMotion,
        diagnosis: content.diagnosis,
        extraFields: content.extraFields,
        authorId: auth.userId,
      } as Prisma.AssessmentUncheckedCreateInput,
      select: assessmentSelect,
    })
    await audit(auth, ip, 'assessment.created', 'episode', episodeId, { version: row.version })
    return { created: true, assessment: toAssessment(row) }
  } catch (error) {
    if (isUniqueViolation(error)) throw versionConflict()
    throw error
  }
}

/* ------------------------------------------------------------------ plans */

/** GET /episodes/:id/treatment-plans (CLN-003): every version, newest first. */
export async function listPlans(db: TenantDb, auth: AuthContext, episodeId: string, ip: string | undefined) {
  await findEpisode(db, episodeId)
  const rows = await db.treatmentPlan.findMany({
    where: { episodeId },
    select: planSelect,
    orderBy: { version: 'desc' },
  })
  await audit(auth, ip, 'treatment_plan.viewed', 'episode', episodeId)
  return { items: rows.map(toPlan) }
}

/**
 * POST /episodes/:id/treatment-plans (CLN-003, US-13). Saves the next version. The estimated cost is information
 * only and never creates a charge (BR-CLN-5).
 */
export async function savePlan(
  db: TenantDb,
  auth: AuthContext,
  episodeId: string,
  content: PlanContent,
  ip: string | undefined,
) {
  await findActiveEpisode(db, episodeId)
  if (isEmptyPlan(content)) {
    throw validationError([{ field: 'goals', message: 'Fill in the plan before saving.' }])
  }
  const latest = await db.treatmentPlan.findFirst({
    where: { episodeId },
    orderBy: { version: 'desc' },
    select: planSelect,
  })
  if (latest && sameContent(planContent(latest), content)) {
    return { created: false, plan: toPlan(latest) }
  }
  try {
    const row = await db.treatmentPlan.create({
      data: {
        episodeId,
        version: (latest?.version ?? 0) + 1,
        diagnosis: content.diagnosis,
        goals: content.goals,
        plannedSessions: content.plannedSessions,
        frequency: content.frequency,
        therapyTypes: content.therapyTypes,
        estimatedCost: content.estimatedCost,
        notes: content.notes,
        authorId: auth.userId,
      } as Prisma.TreatmentPlanUncheckedCreateInput,
      select: planSelect,
    })
    await audit(auth, ip, 'treatment_plan.created', 'episode', episodeId, { version: row.version })
    return { created: true, plan: toPlan(row) }
  } catch (error) {
    if (isUniqueViolation(error)) throw versionConflict()
    throw error
  }
}
