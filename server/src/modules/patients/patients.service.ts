import type { AuthContext } from '../../auth/context.js'
import type { TenantDb } from '../../db/tenantScope.js'
import { Prisma } from '../../generated/prisma/client.js'
import { AppError, notFound, validationError } from '../../lib/errors.js'
import { recordAudit } from '../auth/audit.js'
import {
  classifyQuery,
  currentAge,
  dateOnly,
  indiaToday,
  nameSimilarity,
  normaliseName,
  SIMILAR_NAME,
  yearsBetween,
} from './patientRules.js'

export type Gender = 'male' | 'female' | 'other' | 'undisclosed'

export interface Balance {
  /** Absolute amount, for example "1000.00". */
  amount: string
  state: 'due' | 'credit' | 'zero'
}

/** One row of the search results, and of the "possible duplicate" list (PAT-002, BR-PAT-5). */
export interface PatientListItem {
  id: string
  fullName: string
  phone: string
  age: number
  gender: Gender
  phoneContactType: 'self' | 'guardian'
  status: 'active' | 'inactive'
  registeredBranch: { id: string; name: string }
  registeredAt: Date
  lastVisitAt: string | null
  lastVisitBranch: string | null
  /** Null when the viewer lacks ledger.view. */
  balance: Balance | null
}

export interface PatientDetail {
  id: string
  fullName: string
  phone: string
  phoneContactType: 'self' | 'guardian'
  /** "YYYY-MM-DD" when known. */
  dateOfBirth: string | null
  age: number
  gender: Gender
  address: string | null
  emergencyContact: string | null
  occupation: string | null
  referringDoctor: string | null
  email: string | null
  notes: string | null
  status: 'active' | 'inactive'
  registeredBranch: string
  createdAt: Date
  activeEpisodeId: string | null
  balance: Balance | null
}

const select = {
  id: true,
  fullName: true,
  phone: true,
  phoneContactType: true,
  dateOfBirth: true,
  ageYears: true,
  ageRecordedOn: true,
  gender: true,
  address: true,
  emergencyContact: true,
  occupation: true,
  referringDoctor: true,
  email: true,
  notes: true,
  status: true,
  createdAt: true,
  registeredBranch: { select: { id: true, name: true } },
} as const

type Row = Prisma.PatientGetPayload<{ select: typeof select }>

/**
 * The patient's balance, computed from the ledger (BILL-002). The ledger does not exist yet (Billing section), so
 * nobody owes or holds anything today. This is the one place to compute it once ledger entries exist; until
 * then it answers "nothing due" for anyone allowed to see balances, and nothing for everyone else.
 */
// oxlint-disable-next-line no-unused-vars
export function balanceFor(auth: AuthContext, _patientId: string): Balance | null {
  return auth.permissions.has('ledger.view') ? { amount: '0.00', state: 'zero' } : null
}

const toListItem = (row: Row, auth: AuthContext): PatientListItem => ({
  id: row.id,
  fullName: row.fullName,
  phone: row.phone,
  age: currentAge(row),
  gender: row.gender as Gender,
  phoneContactType: row.phoneContactType as 'self' | 'guardian',
  status: row.status as 'active' | 'inactive',
  registeredBranch: row.registeredBranch,
  registeredAt: row.createdAt,
  // Visits do not exist yet (Visits section); these fill in with VIS-001.
  lastVisitAt: null,
  lastVisitBranch: null,
  balance: balanceFor(auth, row.id),
})

const isoDate = (date: Date) => date.toISOString().slice(0, 10)

/** The patient's one active episode, if any (BR-CLN-2). */
async function activeEpisodeIdFor(db: TenantDb, patientId: string): Promise<string | null> {
  const episode = await db.episode.findFirst({ where: { patientId, status: 'active' }, select: { id: true } })
  return episode?.id ?? null
}

const toDetail = (row: Row, auth: AuthContext, activeEpisodeId: string | null): PatientDetail => ({
  id: row.id,
  fullName: row.fullName,
  phone: row.phone,
  phoneContactType: row.phoneContactType as 'self' | 'guardian',
  dateOfBirth: row.dateOfBirth ? isoDate(row.dateOfBirth) : null,
  age: currentAge(row),
  gender: row.gender as Gender,
  address: row.address,
  emergencyContact: row.emergencyContact,
  occupation: row.occupation,
  referringDoctor: row.referringDoctor,
  email: row.email,
  notes: row.notes,
  status: row.status as 'active' | 'inactive',
  registeredBranch: row.registeredBranch.name,
  createdAt: row.createdAt,
  activeEpisodeId,
  balance: balanceFor(auth, row.id),
})

/* ---------------------------------------------------------------- search */

export interface SearchInput {
  q?: string | undefined
  status?: 'active' | 'inactive' | undefined
  branchId?: string | undefined
  gender?: Gender | undefined
  phoneContactType?: 'self' | 'guardian' | undefined
  /** "YYYY-MM-DD", India time. */
  registeredFrom?: string | undefined
  registeredTo?: string | undefined
  sort: 'newest' | 'oldest' | 'name' | 'name_desc'
  page: number
  pageSize: number
}

/** The moment an India-time calendar day starts (India is UTC+5:30 all year). */
const IST_OFFSET_MS = 330 * 60_000
function indiaDayStart(day: string, plusDays = 0): Date {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, date + plusDays) - IST_OFFSET_MS)
}

const ORDER: Record<SearchInput['sort'], Prisma.PatientOrderByWithRelationInput[]> = {
  // Once visits exist "newest" becomes "most recent visitors first" (US-09.4).
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
  name: [{ fullName: 'asc' }, { id: 'asc' }],
  name_desc: [{ fullName: 'desc' }, { id: 'asc' }],
}

/**
 * GET /patients (PAT-002, PAT-005). Searches every patient of the clinic whatever branch they were registered at:
 * four or more digits match part of a phone number, anything else matches every word of the name, in any letter case.
 * Optional filters narrow the list; `branchId` keeps only patients registered at one branch (the branch selector).
 */
export async function searchPatients(db: TenantDb, auth: AuthContext, input: SearchInput) {
  const query = classifyQuery(input.q ?? '')
  const empty = { items: [], page: input.page, pageSize: input.pageSize, total: 0 }
  if (query.kind === 'short') return empty

  const where: Prisma.PatientWhereInput = {}
  if (input.status) where.status = input.status
  // Another clinic's branch id simply matches nothing: the tenant scope already limits patients to this clinic.
  if (input.branchId) where.registeredBranchId = input.branchId
  if (input.gender) where.gender = input.gender
  if (input.phoneContactType) where.phoneContactType = input.phoneContactType
  if (input.registeredFrom || input.registeredTo) {
    where.createdAt = {
      ...(input.registeredFrom && { gte: indiaDayStart(input.registeredFrom) }),
      ...(input.registeredTo && { lt: indiaDayStart(input.registeredTo, 1) }),
    }
  }
  if (query.kind === 'phone') where.phone = { contains: query.digits }
  if (query.kind === 'name') {
    where.AND = query.text.split(' ').map((word) => ({ fullName: { contains: word, mode: 'insensitive' as const } }))
  }

  const [rows, total] = await Promise.all([
    db.patient.findMany({
      where,
      select,
      orderBy: ORDER[input.sort],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    db.patient.count({ where }),
  ])
  return { items: rows.map((row) => toListItem(row, auth)), page: input.page, pageSize: input.pageSize, total }
}

/* ------------------------------------------------------------ duplicates */

/**
 * Patients that may be the same person (BR-PAT-2): the same phone number, or a very similar name. Family members often
 * share a phone number, so this only warns; the user can still go ahead. Name matching is done here rather than in
 * SQL: the database narrows to names sharing a word, then the closest spellings are kept.
 */
async function findPossibleDuplicates(
  db: TenantDb,
  auth: AuthContext,
  input: { phone: string; fullName: string; excludeId?: string },
): Promise<PatientListItem[]> {
  const notSelf = input.excludeId ? { id: { not: input.excludeId } } : {}
  const samePhone = await db.patient.findMany({ where: { phone: input.phone, ...notSelf }, select, take: 10 })

  // Narrow by the first three letters of the longest words, so a typo late in a word ("Deshpandey") still finds the
  // stored spelling ("Deshpande"). The Dice score below then keeps only the genuinely close names.
  const prefixes = normaliseName(input.fullName)
    .split(' ')
    .filter((word) => word.length >= 3)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)
    .map((word) => word.slice(0, 3))
  const shareAWord =
    prefixes.length > 0
      ? await db.patient.findMany({
          where: {
            OR: prefixes.map((prefix) => ({ fullName: { contains: prefix, mode: 'insensitive' as const } })),
            ...notSelf,
          },
          select,
          take: 200,
        })
      : []
  const similar = shareAWord.filter((row) => nameSimilarity(row.fullName, input.fullName) >= SIMILAR_NAME)

  const seen = new Set<string>()
  const merged: Row[] = []
  for (const row of [...samePhone, ...similar]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    merged.push(row)
  }
  return merged.slice(0, 5).map((row) => toListItem(row, auth))
}

const duplicateWarning = (candidates: PatientListItem[]) =>
  new AppError(409, 'DUPLICATE_PATIENT_WARNING', 'This may be a patient who is already registered.', {
    details: { candidates },
  })

/* ---------------------------------------------------------------- create */

export interface CreateInput {
  fullName: string
  phone: string
  phoneContactType: 'self' | 'guardian'
  age?: number | undefined
  dateOfBirth?: Date | undefined
  gender: Gender
  address?: string | undefined
  emergencyContact?: string | undefined
  occupation?: string | undefined
  referringDoctor?: string | undefined
  email?: string | undefined
  notes?: string | undefined
  branchId?: string | undefined
}

/** Today in India as a date-only value, and the age a date of birth gives today. */
function todayDate(): Date {
  const today = indiaToday()
  return dateOnly(today.year, today.month, today.day)
}

/**
 * POST /patients (PAT-001, US-08). The registering branch is the user's own; an owner, who works across branches,
 * names one. A possible duplicate answers 409 with the candidates until the caller confirms (US-08.3).
 */
export async function createPatient(
  db: TenantDb,
  auth: AuthContext,
  input: CreateInput,
  options: { confirmDuplicate: boolean },
  ip: string | undefined,
): Promise<PatientDetail> {
  const branchId = auth.branchId ?? input.branchId
  if (!branchId) {
    throw validationError([{ field: 'branchId', message: 'Choose the branch you are registering this patient at.' }])
  }
  const branch = await db.branch.findFirst({ where: { id: branchId, isActive: true }, select: { id: true } })
  if (!branch) throw validationError([{ field: 'branchId', message: 'Choose an active branch.' }])

  if (!options.confirmDuplicate) {
    const candidates = await findPossibleDuplicates(db, auth, { phone: input.phone, fullName: input.fullName })
    if (candidates.length > 0) throw duplicateWarning(candidates)
  }

  const today = todayDate()
  const row = await db.patient.create({
    data: {
      registeredBranchId: branch.id,
      createdById: auth.userId,
      fullName: input.fullName,
      phone: input.phone,
      phoneContactType: input.phoneContactType,
      dateOfBirth: input.dateOfBirth ?? null,
      ageYears: input.dateOfBirth ? yearsBetween(input.dateOfBirth, today) : (input.age ?? 0),
      ageRecordedOn: today,
      gender: input.gender,
      address: input.address ?? null,
      emergencyContact: input.emergencyContact ?? null,
      occupation: input.occupation ?? null,
      referringDoctor: input.referringDoctor ?? null,
      email: input.email ?? null,
      notes: input.notes ?? null,
    } as Prisma.PatientUncheckedCreateInput,
    select,
  })
  await recordAudit({
    action: 'patient.created',
    tenantId: auth.tenantId,
    userId: auth.userId,
    branchId: auth.branchId,
    targetType: 'patient',
    targetId: row.id,
    details: { registeredBranchId: branch.id, confirmedDuplicate: options.confirmDuplicate },
    ip,
  })
  return toDetail(row, auth, null)
}

/* ------------------------------------------------------------------ view */

async function findPatient(db: TenantDb, id: string): Promise<Row> {
  // A patient of another clinic is simply not found, so it answers 404.
  const row = await db.patient.findFirst({ where: { id }, select })
  if (!row) throw notFound('Patient not found.')
  return row
}

/**
 * GET /patients/:id (PAT-003). Every open of a record is audited with the viewer's own branch, which makes a look at
 * a patient from another branch traceable (SEC-007, US-10.5, US-11.5).
 */
export async function viewPatient(
  db: TenantDb,
  auth: AuthContext,
  id: string,
  ip: string | undefined,
): Promise<PatientDetail> {
  const row = await findPatient(db, id)
  await recordAudit({
    action: 'patient.viewed',
    tenantId: auth.tenantId,
    userId: auth.userId,
    branchId: auth.branchId,
    targetType: 'patient',
    targetId: id,
    ip,
  })
  return toDetail(row, auth, await activeEpisodeIdFor(db, id))
}

/* ---------------------------------------------------------------- update */

export interface UpdateInput {
  fullName?: string
  phone?: string
  phoneContactType?: 'self' | 'guardian'
  age?: number
  dateOfBirth?: Date | null
  gender?: Gender
  address?: string | null
  emergencyContact?: string | null
  occupation?: string | null
  referringDoctor?: string | null
  email?: string | null
  notes?: string | null
}

/** The edit-relevant values of a patient, in a shape that can be compared and stored in the audit entry. */
function snapshot(row: Row): Record<string, string | number | null> {
  return {
    fullName: row.fullName,
    phone: row.phone,
    phoneContactType: row.phoneContactType,
    dateOfBirth: row.dateOfBirth ? isoDate(row.dateOfBirth) : null,
    age: currentAge(row),
    gender: row.gender,
    address: row.address,
    emergencyContact: row.emergencyContact,
    occupation: row.occupation,
    referringDoctor: row.referringDoctor,
    email: row.email,
    notes: row.notes,
  }
}

/**
 * PATCH /patients/:id (PAT-004). Only the fields sent change. A new phone number that another patient already has
 * answers 409 until confirmed (US-11a.2). The audit entry keeps the old and new values of every field that changed
 * (US-11a.1).
 */
export async function updatePatient(
  db: TenantDb,
  auth: AuthContext,
  id: string,
  input: UpdateInput,
  options: { confirmDuplicate: boolean },
  ip: string | undefined,
): Promise<PatientDetail> {
  const before = await findPatient(db, id)

  if (input.phone !== undefined && input.phone !== before.phone && !options.confirmDuplicate) {
    const candidates = await findPossibleDuplicates(db, auth, {
      phone: input.phone,
      fullName: input.fullName ?? before.fullName,
      excludeId: id,
    })
    if (candidates.length > 0) throw duplicateWarning(candidates)
  }

  // Age and date of birth are two ways to say the same thing (BR-PAT-3): whichever is sent last wins, and the
  // other is derived, so the stored age never contradicts a known date of birth.
  const today = todayDate()
  const ageFields: Prisma.PatientUncheckedUpdateInput = {}
  if (input.dateOfBirth) {
    ageFields.dateOfBirth = input.dateOfBirth
    ageFields.ageYears = yearsBetween(input.dateOfBirth, today)
    ageFields.ageRecordedOn = today
  } else if (input.age !== undefined) {
    ageFields.dateOfBirth = null
    ageFields.ageYears = input.age
    ageFields.ageRecordedOn = today
  } else if (input.dateOfBirth === null && before.dateOfBirth) {
    // The date of birth was cleared: keep the age the patient has today.
    ageFields.dateOfBirth = null
    ageFields.ageYears = currentAge(before)
    ageFields.ageRecordedOn = today
  }

  const { age: _age, dateOfBirth: _dob, ...rest } = input
  const after = await db.patient.update({
    where: { id },
    data: { ...rest, ...ageFields },
    select,
  })

  const was = snapshot(before)
  const now = snapshot(after)
  const changed = Object.keys(now).filter((key) => was[key] !== now[key])
  if (changed.length > 0) {
    await recordAudit({
      action: 'patient.updated',
      tenantId: auth.tenantId,
      userId: auth.userId,
      branchId: auth.branchId,
      targetType: 'patient',
      targetId: id,
      details: {
        before: Object.fromEntries(changed.map((key) => [key, was[key] ?? null])),
        after: Object.fromEntries(changed.map((key) => [key, now[key] ?? null])),
      },
      ip,
    })
  }
  return toDetail(after, auth, await activeEpisodeIdFor(db, id))
}
