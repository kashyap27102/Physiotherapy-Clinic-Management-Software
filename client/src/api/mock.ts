// In-browser stand-in for the Express backend. It follows the business rules in the PRD
// (append-only ledger, reversals, dues warning that never blocks, receipt numbering per
// branch and financial year) so the client can be built and demoed before the server exists.
// Data is kept in localStorage; clear "physiocms.mockdb.v1" to reset it.

import { dayKey, financialYear, isToday } from '@/lib/date'
import { fromPaise, toPaise } from '@/lib/money'
import { ApiError } from './errors'
import type {
  Api,
  Assessment,
  Balance,
  CreatePatientInput,
  EpisodeSummary,
  Gender,
  LedgerEntryType,
  LedgerRecord,
  LoginResult,
  MarkAttendanceInput,
  MarkAttendanceResult,
  PatientDetail,
  PatientListItem,
  PaymentMethod,
  PermissionKey,
  RecordPaymentInput,
  RecordPaymentResult,
  RoleKey,
  SessionUser,
  Therapist,
  TodayVisit,
  TreatmentPlan,
  VisitRecord,
} from './types'

const DB_KEY = 'physiocms.mockdb.v1'
const SESSION_KEY = 'physiocms.mock.session'
const TRUSTED_KEY = 'physiocms.mock.trusted'
const DEMO_OTP = '123456'
const DEFAULT_FEE_PAISE = 50000

/* ------------------------------ database shape ------------------------------ */

interface DbBranch { id: string; name: string; code: string }
interface DbUser {
  id: string
  email: string
  password: string
  fullName: string
  role: RoleKey
  branchId: string | null
  permissions: PermissionKey[]
}
interface DbPatient {
  id: string
  fullName: string
  phone: string
  phoneContactType: 'self' | 'guardian'
  age: number
  gender: Gender
  address: string | null
  emergencyContact: string | null
  occupation: string | null
  referringDoctor: string | null
  email: string | null
  notes: string | null
  registeredBranchId: string
  createdAt: string
}
interface DbEpisode {
  id: string
  patientId: string
  startedAt: string
  dischargedAt: string | null
  assessment: Assessment | null
  plan: TreatmentPlan | null
}
interface DbVisit {
  id: string
  patientId: string
  episodeId: string
  branchId: string
  therapistId: string | null
  visitedAt: string
  feePaise: number
  feeOverrideReason: string | null
}
interface DbLedger {
  id: string
  patientId: string
  branchId: string
  type: LedgerEntryType
  paise: number
  method: PaymentMethod | null
  reference: string | null
  reason: string | null
  visitId: string | null
  reversesId: string | null
  createdAt: string
  createdById: string
  docNumber: string | null
}
interface Db {
  tenantName: string
  branches: DbBranch[]
  users: DbUser[]
  patients: DbPatient[]
  episodes: DbEpisode[]
  visits: DbVisit[]
  ledger: DbLedger[]
  sequences: Record<string, number>
}

const ALL_PERMISSIONS: PermissionKey[] = [
  'clinic.manage', 'staff.manage', 'role.manage', 'device.manage', 'patient.register', 'patient.edit',
  'patient.view', 'clinical.view', 'clinical.edit', 'episode.manage', 'visit.mark', 'fee.override',
  'ledger.view', 'payment.record', 'refund.process', 'entry.reverse', 'document.issue', 'report.view',
  'data.import', 'data.export', 'audit.view',
]

// Default permission templates (PRD section 16). The owner can change these in the real product.
const RECEPTIONIST_PERMISSIONS: PermissionKey[] = [
  'patient.register', 'patient.edit', 'patient.view', 'clinical.view', 'visit.mark',
  'ledger.view', 'payment.record', 'document.issue',
]
const PHYSIO_PERMISSIONS: PermissionKey[] = [
  'patient.view', 'clinical.view', 'clinical.edit', 'episode.manage', 'visit.mark',
]

/* --------------------------------- helpers ---------------------------------- */

const sleep = (ms = 140) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const uid = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

function must<T>(value: T | undefined | null, error: ApiError): T {
  if (value === undefined || value === null) throw error
  return value
}
const notFound = (what: string) => new ApiError(404, 'NOT_FOUND', `${what} not found.`)

function hoursAgo(daysAgo: number, hour: number, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits
}

/* ------------------------------- persistence -------------------------------- */

let db: Db = { tenantName: '', branches: [], users: [], patients: [], episodes: [], visits: [], ledger: [], sequences: {} }
db = loadDb()

function loadDb(): Db {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch {
    // Storage can be unavailable (private window); fall through to a fresh seed.
  }
  const fresh = seed()
  persist(fresh)
  return fresh
}

function persist(data: Db = db): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(data))
  } catch {
    // Ignore: the mock keeps working in memory.
  }
}

/* --------------------------- ledger / balance logic -------------------------- */

function effectOf(entry: DbLedger, byId: Map<string, DbLedger>): number {
  switch (entry.type) {
    case 'CHARGE':
    case 'REFUND':
      return entry.paise
    case 'PAYMENT':
      return -entry.paise
    case 'REVERSAL': {
      const original = entry.reversesId ? byId.get(entry.reversesId) : undefined
      return original ? -effectOf(original, byId) : 0
    }
  }
}

function balancePaise(data: Db, patientId: string): number {
  const byId = new Map(data.ledger.map((e) => [e.id, e]))
  return data.ledger.filter((e) => e.patientId === patientId).reduce((sum, e) => sum + effectOf(e, byId), 0)
}

function toBalance(paise: number): Balance {
  return { amount: fromPaise(Math.abs(paise)), state: paise > 0 ? 'due' : paise < 0 ? 'credit' : 'zero' }
}

function isVisitReversed(data: Db, visit: DbVisit): boolean {
  const charge = data.ledger.find((e) => e.type === 'CHARGE' && e.visitId === visit.id)
  return !!charge && data.ledger.some((e) => e.type === 'REVERSAL' && e.reversesId === charge.id)
}

function nextDocNumber(data: Db, branch: DbBranch, at: string): string {
  const fy = financialYear(at)
  const key = `${branch.id}|RECEIPT|${fy}`
  const next = (data.sequences[key] ?? 0) + 1
  data.sequences[key] = next
  return `${branch.code}/${fy}/${String(next).padStart(4, '0')}`
}

/* ------------------------------ session helpers ------------------------------ */

function currentUser(): DbUser {
  const id = sessionStorage.getItem(SESSION_KEY)
  const user = id ? db.users.find((u) => u.id === id) : undefined
  return must(user, new ApiError(401, 'UNAUTHENTICATED', 'Please sign in again.'))
}

function requirePermission(user: DbUser, key: PermissionKey): void {
  if (!user.permissions.includes(key)) {
    throw new ApiError(403, 'PERMISSION_DENIED', 'Your role does not have permission for this action.')
  }
}

function toSessionUser(user: DbUser): SessionUser {
  const branch = user.branchId ? db.branches.find((b) => b.id === user.branchId) : undefined
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    tenantName: db.tenantName,
    branch: branch ? { id: branch.id, name: branch.name } : null,
    permissions: user.permissions,
  }
}

function branchName(branchId: string): string {
  return db.branches.find((b) => b.id === branchId)?.name ?? 'Unknown branch'
}
function userName(userId: string | null): string | null {
  return userId ? (db.users.find((u) => u.id === userId)?.fullName ?? null) : null
}

/* ------------------------------ record builders ------------------------------ */

function lastVisitOf(patientId: string): DbVisit | undefined {
  return db.visits
    .filter((v) => v.patientId === patientId && !isVisitReversed(db, v))
    .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))[0]
}

function toListItem(user: DbUser, patient: DbPatient): PatientListItem {
  const last = lastVisitOf(patient.id)
  return {
    id: patient.id,
    fullName: patient.fullName,
    phone: patient.phone,
    age: patient.age,
    gender: patient.gender,
    lastVisitAt: last?.visitedAt ?? null,
    lastVisitBranch: last ? branchName(last.branchId) : null,
    balance: user.permissions.includes('ledger.view') ? toBalance(balancePaise(db, patient.id)) : null,
  }
}

function activeEpisodeOf(patientId: string): DbEpisode | undefined {
  return db.episodes.find((e) => e.patientId === patientId && e.dischargedAt === null)
}

function sessionsIn(episodeId: string): number {
  return db.visits.filter((v) => v.episodeId === episodeId && !isVisitReversed(db, v)).length
}

function toDetail(user: DbUser, patient: DbPatient): PatientDetail {
  const active = activeEpisodeOf(patient.id)
  return {
    id: patient.id,
    fullName: patient.fullName,
    phone: patient.phone,
    phoneContactType: patient.phoneContactType,
    age: patient.age,
    gender: patient.gender,
    address: patient.address,
    emergencyContact: patient.emergencyContact,
    occupation: patient.occupation,
    referringDoctor: patient.referringDoctor,
    email: patient.email,
    notes: patient.notes,
    status: active ? 'active' : 'inactive',
    registeredBranch: branchName(patient.registeredBranchId),
    createdAt: patient.createdAt,
    activeEpisodeId: active?.id ?? null,
    balance: user.permissions.includes('ledger.view') ? toBalance(balancePaise(db, patient.id)) : null,
  }
}

function toEpisodeSummary(user: DbUser, episode: DbEpisode): EpisodeSummary {
  const canSeeClinical = user.permissions.includes('clinical.view')
  return {
    id: episode.id,
    status: episode.dischargedAt ? 'discharged' : 'active',
    startedAt: episode.startedAt,
    dischargedAt: episode.dischargedAt,
    sessionsDone: sessionsIn(episode.id),
    assessment: canSeeClinical ? episode.assessment : null,
    plan: canSeeClinical ? episode.plan : null,
  }
}

function toVisitRecord(visit: DbVisit): VisitRecord {
  return {
    id: visit.id,
    episodeId: visit.episodeId,
    visitedAt: visit.visitedAt,
    branchName: branchName(visit.branchId),
    therapistName: userName(visit.therapistId),
    fee: fromPaise(visit.feePaise),
    feeOverrideReason: visit.feeOverrideReason,
    reversed: isVisitReversed(db, visit),
  }
}

function toLedgerRecord(entry: DbLedger): LedgerRecord {
  const reversal = db.ledger.find((e) => e.type === 'REVERSAL' && e.reversesId === entry.id)
  return {
    id: entry.id,
    type: entry.type,
    amount: fromPaise(entry.paise),
    method: entry.method,
    reference: entry.reference,
    reason: entry.reason,
    branchName: branchName(entry.branchId),
    createdAt: entry.createdAt,
    createdByName: userName(entry.createdById) ?? 'Unknown',
    visitId: entry.visitId,
    reversesEntryId: entry.reversesId,
    reversedByEntryId: reversal?.id ?? null,
    documentNumber: entry.docNumber,
  }
}

/* ------------------------- shared write operations --------------------------- */

function insertVisit(args: {
  patient: DbPatient
  episode: DbEpisode
  branch: DbBranch
  therapistId: string | null
  feePaise: number
  reason: string | null
  at: string
  createdById: string
}): DbVisit {
  const visit: DbVisit = {
    id: uid(),
    patientId: args.patient.id,
    episodeId: args.episode.id,
    branchId: args.branch.id,
    therapistId: args.therapistId,
    visitedAt: args.at,
    feePaise: args.feePaise,
    feeOverrideReason: args.reason,
  }
  db.visits.push(visit)
  db.ledger.push({
    id: uid(), patientId: args.patient.id, branchId: args.branch.id, type: 'CHARGE', paise: args.feePaise,
    method: null, reference: null, reason: null, visitId: visit.id, reversesId: null,
    createdAt: args.at, createdById: args.createdById, docNumber: null,
  })
  return visit
}

function insertPayment(args: {
  patientId: string
  branch: DbBranch
  paise: number
  method: PaymentMethod
  reference: string | null
  at: string
  createdById: string
}): DbLedger {
  const entry: DbLedger = {
    id: uid(), patientId: args.patientId, branchId: args.branch.id, type: 'PAYMENT', paise: args.paise,
    method: args.method, reference: args.reference, reason: null, visitId: null, reversesId: null,
    createdAt: args.at, createdById: args.createdById, docNumber: nextDocNumber(db, args.branch, args.at),
  }
  db.ledger.push(entry)
  return entry
}

/* ----------------------------------- seed ------------------------------------ */

function seed(): Db {
  const mum: DbBranch = { id: 'br-mum', name: 'Andheri, Mumbai', code: 'MUM' }
  const pun: DbBranch = { id: 'br-pun', name: 'Kothrud, Pune', code: 'PUN' }
  const owner: DbUser = {
    id: 'u-owner', email: 'owner@demo.clinic', password: 'demo1234', fullName: 'Dr. Meera Nair',
    role: 'owner', branchId: null, permissions: ALL_PERMISSIONS,
  }
  const reception: DbUser = {
    id: 'u-reception', email: 'reception@demo.clinic', password: 'demo1234', fullName: 'Pooja Sawant',
    role: 'receptionist', branchId: mum.id, permissions: RECEPTIONIST_PERMISSIONS,
  }
  const therapist: DbUser = {
    id: 'u-therapist', email: 'therapist@demo.clinic', password: 'demo1234', fullName: 'Dr. Arjun Rao',
    role: 'physiotherapist', branchId: mum.id, permissions: PHYSIO_PERMISSIONS,
  }

  const data: Db = {
    tenantName: 'Nair Physio & Rehab',
    branches: [mum, pun],
    users: [owner, reception, therapist],
    patients: [],
    episodes: [],
    visits: [],
    ledger: [],
    sequences: {},
  }
  db = data // seeding helpers read the module-level db

  const addPatient = (p: Partial<DbPatient> & Pick<DbPatient, 'fullName' | 'phone' | 'age' | 'gender'>, branch: DbBranch, daysAgo: number) => {
    const patient: DbPatient = {
      id: uid(), phoneContactType: 'self', address: null, emergencyContact: null, occupation: null,
      referringDoctor: null, email: null, notes: null, registeredBranchId: branch.id,
      createdAt: hoursAgo(daysAgo, 9), ...p,
    }
    data.patients.push(patient)
    return patient
  }
  const addEpisode = (patient: DbPatient, daysAgo: number, extra: Partial<DbEpisode> = {}) => {
    const episode: DbEpisode = {
      id: uid(), patientId: patient.id, startedAt: hoursAgo(daysAgo, 9, 30), dischargedAt: null,
      assessment: null, plan: null, ...extra,
    }
    data.episodes.push(episode)
    return episode
  }
  const assessment = (history: string, pain: string, rom: string, diagnosis: string, daysAgo: number): Assessment => ({
    version: 1, history, pain, rangeOfMotion: rom, diagnosis, authorName: therapist.fullName, createdAt: hoursAgo(daysAgo, 9, 45),
  })
  const plan = (diagnosis: string, goals: string, planned: number, frequency: string, therapies: string, cost: string): TreatmentPlan => ({
    version: 1, diagnosis, goals, plannedSessions: planned, frequency, therapyTypes: therapies, estimatedCost: cost, notes: null,
  })

  // 1. Owes money, visited today.
  const ravi = addPatient({ fullName: 'Ravi Kulkarni', phone: '9820011122', age: 45, gender: 'male', occupation: 'Accountant' }, mum, 12)
  const raviEp = addEpisode(ravi, 12, {
    assessment: assessment('Lower back pain for 3 weeks after lifting. No numbness.', 'VAS 7/10 on bending', 'Lumbar flexion limited to 50%', 'Mechanical low back pain', 12),
    plan: plan('Mechanical low back pain', 'Pain below 3/10, full flexion in 3 weeks', 10, '3 times a week', 'Manual therapy, TENS, core exercises', '5000.00'),
  })
  ;[11, 9, 7, 5, 2, 0].forEach((d) =>
    insertVisit({ patient: ravi, episode: raviEp, branch: mum, therapistId: therapist.id, feePaise: DEFAULT_FEE_PAISE, reason: null, at: hoursAgo(d, d === 0 ? 9 : 10, 15), createdById: reception.id }))
  insertPayment({ patientId: ravi.id, branch: mum, paise: 200000, method: 'upi', reference: 'UPI4821937', at: hoursAgo(7, 12), createdById: reception.id })

  // 2. Advance credit, visited today.
  const sunita = addPatient({ fullName: 'Sunita Deshmukh', phone: '9890055566', age: 38, gender: 'female' }, mum, 5)
  const sunitaEp = addEpisode(sunita, 5, {
    assessment: assessment('Right shoulder stiffness for 2 months.', 'VAS 5/10 overhead', 'Abduction 110 degrees', 'Adhesive capsulitis (early)', 5),
    plan: plan('Adhesive capsulitis', 'Abduction above 160 degrees', 12, 'Alternate days', 'Mobilisation, ultrasound, stretching', '6000.00'),
  })
  insertPayment({ patientId: sunita.id, branch: mum, paise: 250000, method: 'cash', reference: null, at: hoursAgo(5, 11), createdById: reception.id })
  ;[4, 2, 0].forEach((d) =>
    insertVisit({ patient: sunita, episode: sunitaEp, branch: mum, therapistId: therapist.id, feePaise: DEFAULT_FEE_PAISE, reason: null, at: hoursAgo(d, d === 0 ? 10 : 11, 0), createdById: reception.id }))

  // 3. Registered and treated at the Pune branch (cross-branch demo).
  const amit = addPatient({ fullName: 'Amit Shah', phone: '9833344455', age: 52, gender: 'male' }, pun, 20)
  const amitEp = addEpisode(amit, 20, {
    assessment: assessment('Right knee pain on stairs.', 'VAS 4/10', 'Knee flexion 110 degrees', 'Knee osteoarthritis', 20),
    plan: plan('Knee osteoarthritis', 'Walk 20 minutes without pain', 8, 'Twice a week', 'Strengthening, ultrasound', '4000.00'),
  })
  ;[18, 14, 10].forEach((d) =>
    insertVisit({ patient: amit, episode: amitEp, branch: pun, therapistId: null, feePaise: DEFAULT_FEE_PAISE, reason: null, at: hoursAgo(d, 17), createdById: owner.id }))
  insertPayment({ patientId: amit.id, branch: pun, paise: 150000, method: 'card', reference: null, at: hoursAgo(10, 18), createdById: owner.id })

  // 4. Discharged, settled.
  const neha = addPatient({ fullName: 'Neha Joshi', phone: '9765432100', age: 29, gender: 'female' }, mum, 70)
  const nehaEp = addEpisode(neha, 70, {
    dischargedAt: hoursAgo(45, 12),
    assessment: assessment('Neck pain after long desk hours.', 'VAS 6/10', 'Cervical rotation limited', 'Cervical spondylosis', 70),
    plan: plan('Cervical spondylosis', 'Pain-free neck rotation', 6, 'Twice a week', 'Mobilisation, posture training', '3000.00'),
  })
  ;[69, 65, 60].forEach((d) =>
    insertVisit({ patient: neha, episode: nehaEp, branch: mum, therapistId: therapist.id, feePaise: DEFAULT_FEE_PAISE, reason: null, at: hoursAgo(d, 15), createdById: reception.id }))
  insertPayment({ patientId: neha.id, branch: mum, paise: 150000, method: 'bank_transfer', reference: 'NEFT55012', at: hoursAgo(60, 16), createdById: reception.id })

  // 5. Just registered, no episode yet.
  addPatient({ fullName: 'Kiran Patil', phone: '9988776655', age: 61, gender: 'male', phoneContactType: 'guardian' }, mum, 0)

  return data
}

/* ------------------------------------ API ------------------------------------ */

const idempotentResults = new Map<string, unknown>()

async function once<T>(key: string, run: () => T): Promise<T> {
  if (idempotentResults.has(key)) return idempotentResults.get(key) as T
  const result = run()
  idempotentResults.set(key, result)
  return result
}

export const mockApi: Api = {
  auth: {
    async login(email, password): Promise<LoginResult> {
      await sleep()
      const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password)
      if (!user) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.')
      let trusted: string[] = []
      try { trusted = JSON.parse(localStorage.getItem(TRUSTED_KEY) ?? '[]') as string[] } catch { trusted = [] }
      if (trusted.includes(user.id)) {
        sessionStorage.setItem(SESSION_KEY, user.id)
        return { status: 'ok', user: toSessionUser(user) }
      }
      return { status: 'otp_required', challengeId: user.id }
    },
    async verifyOtp({ challengeId, code, trustDevice }) {
      await sleep()
      const user = must(db.users.find((u) => u.id === challengeId), new ApiError(401, 'OTP_INVALID', 'That code is not correct or has expired.'))
      if (code !== DEMO_OTP) throw new ApiError(401, 'OTP_INVALID', 'That code is not correct or has expired.')
      if (trustDevice) {
        let trusted: string[] = []
        try { trusted = JSON.parse(localStorage.getItem(TRUSTED_KEY) ?? '[]') as string[] } catch { trusted = [] }
        localStorage.setItem(TRUSTED_KEY, JSON.stringify([...new Set([...trusted, user.id])]))
      }
      sessionStorage.setItem(SESSION_KEY, user.id)
      return toSessionUser(user)
    },
    async me() {
      await sleep(60)
      const id = sessionStorage.getItem(SESSION_KEY)
      const user = id ? db.users.find((u) => u.id === id) : undefined
      return user ? toSessionUser(user) : null
    },
    async logout() {
      sessionStorage.removeItem(SESSION_KEY)
    },
  },

  patients: {
    async search({ q }) {
      await sleep()
      const user = currentUser()
      requirePermission(user, 'patient.view')
      const text = q.trim().toLowerCase()
      const digits = q.replace(/\D/g, '')
      const matches = db.patients.filter((p) => {
        if (!text) return true
        return p.fullName.toLowerCase().includes(text) || (digits.length >= 3 && p.phone.includes(digits))
      })
      const items = matches
        .map((p) => toListItem(user, p))
        .sort((a, b) => (b.lastVisitAt ?? '').localeCompare(a.lastVisitAt ?? '') || a.fullName.localeCompare(b.fullName))
      return { items: items.slice(0, 25), page: 1, pageSize: 25, total: items.length }
    },

    async create(input: CreatePatientInput, options) {
      await sleep()
      const user = currentUser()
      requirePermission(user, 'patient.register')
      const fields = []
      const name = input.fullName.trim()
      const phone = normalisePhone(input.phone)
      if (!name) fields.push({ field: 'fullName', message: 'Enter the patient name.' })
      if (!/^\d{10}$/.test(phone)) fields.push({ field: 'phone', message: 'Enter a valid 10-digit mobile number.' })
      if (!Number.isInteger(input.age) || input.age < 0 || input.age > 120) fields.push({ field: 'age', message: 'Enter an age between 0 and 120.' })
      if (!['male', 'female', 'other', 'undisclosed'].includes(input.gender)) fields.push({ field: 'gender', message: 'Select a gender.' })
      if (fields.length) throw new ApiError(422, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', fields)

      if (!options?.confirmDuplicate) {
        const candidates = db.patients.filter((p) => p.phone === phone).map((p) => toListItem(user, p))
        if (candidates.length) {
          throw new ApiError(409, 'DUPLICATE_PATIENT_WARNING', 'A patient with this phone number already exists.', [], { candidates })
        }
      }
      const branchId = user.branchId ?? must(db.branches[0], notFound('Branch')).id
      const patient: DbPatient = {
        id: uid(), fullName: name, phone, phoneContactType: input.phoneContactType ?? 'self', age: input.age, gender: input.gender,
        address: input.address?.trim() || null, emergencyContact: input.emergencyContact?.trim() || null,
        occupation: input.occupation?.trim() || null, referringDoctor: input.referringDoctor?.trim() || null,
        email: input.email?.trim() || null, notes: input.notes?.trim() || null, registeredBranchId: branchId, createdAt: nowIso(),
      }
      db.patients.push(patient)
      persist()
      return toDetail(user, patient)
    },

    async get(id) {
      await sleep()
      const user = currentUser()
      requirePermission(user, 'patient.view')
      return toDetail(user, must(db.patients.find((p) => p.id === id), notFound('Patient')))
    },

    async episodes(id) {
      await sleep()
      const user = currentUser()
      requirePermission(user, 'patient.view')
      return db.episodes
        .filter((e) => e.patientId === id)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .map((e) => toEpisodeSummary(user, e))
    },

    async visits(id) {
      await sleep()
      const user = currentUser()
      requirePermission(user, 'patient.view')
      return db.visits.filter((v) => v.patientId === id).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)).map(toVisitRecord)
    },

    async ledger(id) {
      await sleep()
      const user = currentUser()
      requirePermission(user, 'ledger.view')
      return db.ledger.filter((e) => e.patientId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toLedgerRecord)
    },
  },

  episodes: {
    async start(patientId) {
      await sleep()
      const user = currentUser()
      requirePermission(user, 'episode.manage')
      must(db.patients.find((p) => p.id === patientId), notFound('Patient'))
      if (activeEpisodeOf(patientId)) throw new ApiError(409, 'EPISODE_ALREADY_ACTIVE', 'This patient already has an active episode.')
      const episode: DbEpisode = { id: uid(), patientId, startedAt: nowIso(), dischargedAt: null, assessment: null, plan: null }
      db.episodes.push(episode)
      persist()
      return toEpisodeSummary(user, episode)
    },
  },

  visits: {
    async today(): Promise<TodayVisit[]> {
      await sleep()
      const user = currentUser()
      requirePermission(user, 'patient.view')
      return db.visits
        .filter((v) => isToday(v.visitedAt) && (user.branchId === null || v.branchId === user.branchId))
        .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))
        .map((v) => {
          const patient = must(db.patients.find((p) => p.id === v.patientId), notFound('Patient'))
          return {
            id: v.id, patientId: patient.id, patientName: patient.fullName, patientPhone: patient.phone,
            visitedAt: v.visitedAt, branchName: branchName(v.branchId), therapistName: userName(v.therapistId),
            fee: fromPaise(v.feePaise), reversed: isVisitReversed(db, v),
            balance: user.permissions.includes('ledger.view') ? toBalance(balancePaise(db, patient.id)) : null,
          }
        })
    },

    async create(input: MarkAttendanceInput, idempotencyKey): Promise<MarkAttendanceResult> {
      await sleep()
      const user = currentUser()
      requirePermission(user, 'visit.mark')
      return once(`visit:${idempotencyKey}`, () => {
        const patient = must(db.patients.find((p) => p.id === input.patientId), notFound('Patient'))
        const episode = activeEpisodeOf(patient.id)
        if (!episode) throw new ApiError(409, 'NO_ACTIVE_EPISODE', 'Start a treatment episode for this patient first.')

        const branch = must(
          db.branches.find((b) => b.id === (user.branchId ?? db.branches[0]?.id)),
          notFound('Branch'),
        )
        const alreadyToday = db.visits.some(
          (v) => v.patientId === patient.id && dayKey(v.visitedAt) === dayKey(new Date()) && !isVisitReversed(db, v),
        )
        if (alreadyToday && !input.confirmSecondVisitToday) {
          throw new ApiError(409, 'DUPLICATE_VISIT_TODAY', 'This patient already has a visit today.')
        }

        let feePaise = DEFAULT_FEE_PAISE
        let reason: string | null = null
        if (input.feeOverride) {
          requirePermission(user, 'fee.override')
          const paise = toPaise(input.feeOverride.amount)
          if (paise === null) throw new ApiError(422, 'VALIDATION_FAILED', 'Enter a valid fee.', [{ field: 'fee', message: 'Enter a valid fee.' }])
          if (!input.feeOverride.reason.trim()) {
            throw new ApiError(422, 'FEE_REASON_REQUIRED', 'A reason is required when the fee is changed.', [{ field: 'feeReason', message: 'A reason is required.' }])
          }
          feePaise = paise
          reason = input.feeOverride.reason.trim()
        }

        const duesBefore = balancePaise(db, patient.id)
        const therapistId = input.therapistId ?? (user.role === 'physiotherapist' ? user.id : null)
        const visit = insertVisit({ patient, episode, branch, therapistId, feePaise, reason, at: nowIso(), createdById: user.id })
        persist()

        const planned = episode.plan?.plannedSessions ?? null
        const sessionNumber = sessionsIn(episode.id)
        return {
          visit: toVisitRecord(visit),
          sessionNumber,
          planProgress: { planned, planExceeded: planned !== null && sessionNumber > planned },
          balanceAfter: toBalance(balancePaise(db, patient.id)),
          duesWarning: duesBefore > 0 ? { amount: fromPaise(duesBefore) } : null,
        }
      })
    },
  },

  payments: {
    async create(input: RecordPaymentInput, idempotencyKey): Promise<RecordPaymentResult> {
      await sleep()
      const user = currentUser()
      requirePermission(user, 'payment.record')
      return once(`payment:${idempotencyKey}`, () => {
        const patient = must(db.patients.find((p) => p.id === input.patientId), notFound('Patient'))
        const paise = toPaise(input.amount)
        if (paise === null || paise <= 0) {
          throw new ApiError(422, 'VALIDATION_FAILED', 'Enter an amount greater than zero.', [{ field: 'amount', message: 'Enter an amount greater than zero.' }])
        }
        if (input.method === 'bank_transfer' && !input.reference?.trim()) {
          throw new ApiError(422, 'VALIDATION_FAILED', 'A reference is required for bank transfers.', [{ field: 'reference', message: 'A reference is required for bank transfers.' }])
        }
        const branch = must(db.branches.find((b) => b.id === (user.branchId ?? db.branches[0]?.id)), notFound('Branch'))
        const entry = insertPayment({
          patientId: patient.id, branch, paise, method: input.method,
          reference: input.reference?.trim() || null, at: nowIso(), createdById: user.id,
        })
        persist()
        return {
          entry: toLedgerRecord(entry),
          receipt: { id: entry.id, number: entry.docNumber ?? '' },
          balanceAfter: toBalance(balancePaise(db, patient.id)),
        }
      })
    },
  },

  clinic: {
    async defaultFee() {
      await sleep(60)
      currentUser()
      return fromPaise(DEFAULT_FEE_PAISE)
    },
    async therapists(): Promise<Therapist[]> {
      await sleep(60)
      const user = currentUser()
      return db.users
        .filter((u) => u.role === 'physiotherapist' && (user.branchId === null || u.branchId === user.branchId))
        .map((u) => ({ id: u.id, fullName: u.fullName }))
    },
  },
}
