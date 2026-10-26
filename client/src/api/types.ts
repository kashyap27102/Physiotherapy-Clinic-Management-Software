// Types mirror docs/API-Requirements.md. Money is always a string with two decimals.

export type PermissionKey =
  | 'clinic.manage'
  | 'staff.manage'
  | 'role.manage'
  | 'device.manage'
  | 'patient.register'
  | 'patient.edit'
  | 'patient.view'
  | 'clinical.view'
  | 'clinical.edit'
  | 'episode.manage'
  | 'visit.mark'
  | 'fee.override'
  | 'ledger.view'
  | 'payment.record'
  | 'refund.process'
  | 'entry.reverse'
  | 'document.issue'
  | 'report.view'
  | 'data.import'
  | 'data.export'
  | 'audit.view'
  | 'platform.admin'

export type RoleKey = 'owner' | 'receptionist' | 'physiotherapist' | 'super_admin'
export type Gender = 'male' | 'female' | 'other' | 'undisclosed'
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer'
export type LedgerEntryType = 'CHARGE' | 'PAYMENT' | 'REFUND' | 'REVERSAL'

export type Money = string

export interface Balance {
  /** Absolute amount, e.g. "1000.00". */
  amount: Money
  state: 'due' | 'credit' | 'zero'
}

export interface SessionUser {
  id: string
  fullName: string
  email: string
  role: RoleKey
  tenantName: string
  /** Null for owners and platform admins, who are not tied to one branch. */
  branch: { id: string; name: string } | null
  permissions: PermissionKey[]
}

export type LoginResult =
  | { status: 'ok'; user: SessionUser }
  | { status: 'otp_required'; challengeId: string }

export interface Paged<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface PatientListItem {
  id: string
  fullName: string
  phone: string
  age: number
  gender: Gender
  lastVisitAt: string | null
  lastVisitBranch: string | null
  /** Null when the viewer lacks the ledger.view permission. */
  balance: Balance | null
}

export interface CreatePatientInput {
  fullName: string
  phone: string
  age: number
  gender: Gender
  phoneContactType?: 'self' | 'guardian'
  address?: string
  emergencyContact?: string
  occupation?: string
  referringDoctor?: string
  email?: string
  notes?: string
}

export interface PatientDetail {
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
  status: 'active' | 'inactive'
  registeredBranch: string
  createdAt: string
  activeEpisodeId: string | null
  balance: Balance | null
}

export interface Assessment {
  version: number
  history: string
  pain: string
  rangeOfMotion: string
  diagnosis: string
  authorName: string
  createdAt: string
}

export interface TreatmentPlan {
  version: number
  diagnosis: string
  goals: string
  plannedSessions: number | null
  frequency: string
  therapyTypes: string
  /** Informational only: billing is per visit (PRD BR-CLN-5). */
  estimatedCost: Money | null
  notes: string | null
}

export interface EpisodeSummary {
  id: string
  status: 'active' | 'discharged'
  startedAt: string
  dischargedAt: string | null
  sessionsDone: number
  /** Null when the viewer lacks clinical.view or nothing was recorded. */
  assessment: Assessment | null
  plan: TreatmentPlan | null
}

export interface VisitRecord {
  id: string
  episodeId: string
  visitedAt: string
  branchName: string
  therapistName: string | null
  fee: Money
  feeOverrideReason: string | null
  reversed: boolean
}

export interface TodayVisit {
  id: string
  patientId: string
  patientName: string
  patientPhone: string
  visitedAt: string
  branchName: string
  therapistName: string | null
  fee: Money
  reversed: boolean
  balance: Balance | null
}

export interface LedgerRecord {
  id: string
  type: LedgerEntryType
  amount: Money
  method: PaymentMethod | null
  reference: string | null
  reason: string | null
  branchName: string
  createdAt: string
  createdByName: string
  visitId: string | null
  reversesEntryId: string | null
  reversedByEntryId: string | null
  documentNumber: string | null
}

export interface Therapist {
  id: string
  fullName: string
}

export interface MarkAttendanceInput {
  patientId: string
  therapistId?: string
  feeOverride?: { amount: Money; reason: string }
  /** Set after the user confirms a second visit on the same day. */
  confirmSecondVisitToday?: boolean
}

export interface MarkAttendanceResult {
  visit: VisitRecord
  sessionNumber: number
  planProgress: { planned: number | null; planExceeded: boolean }
  balanceAfter: Balance
  duesWarning: { amount: Money } | null
}

export interface RecordPaymentInput {
  patientId: string
  amount: Money
  method: PaymentMethod
  reference?: string
}

export interface RecordPaymentResult {
  entry: LedgerRecord
  receipt: { id: string; number: string }
  balanceAfter: Balance
}

/** What the UI needs from a backend. Implemented by the mock and by the real HTTP client. */
export interface Api {
  auth: {
    login(email: string, password: string): Promise<LoginResult>
    verifyOtp(input: { challengeId: string; code: string; trustDevice: boolean }): Promise<SessionUser>
    me(): Promise<SessionUser | null>
    logout(): Promise<void>
  }
  patients: {
    search(input: { q: string; page?: number }): Promise<Paged<PatientListItem>>
    create(input: CreatePatientInput, options?: { confirmDuplicate?: boolean }): Promise<PatientDetail>
    get(id: string): Promise<PatientDetail>
    episodes(id: string): Promise<EpisodeSummary[]>
    visits(id: string): Promise<VisitRecord[]>
    ledger(id: string): Promise<LedgerRecord[]>
  }
  episodes: {
    start(patientId: string): Promise<EpisodeSummary>
  }
  visits: {
    today(): Promise<TodayVisit[]>
    create(input: MarkAttendanceInput, idempotencyKey: string): Promise<MarkAttendanceResult>
  }
  payments: {
    create(input: RecordPaymentInput, idempotencyKey: string): Promise<RecordPaymentResult>
  }
  clinic: {
    defaultFee(): Promise<Money>
    therapists(): Promise<Therapist[]>
  }
}
