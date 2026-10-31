// Types mirror docs/API-Requirements.md. Money is always a string with two decimals.

export const PERMISSION_KEYS = [
  'clinic.manage',
  'staff.manage',
  'role.manage',
  'device.manage',
  'patient.register',
  'patient.edit',
  'patient.view',
  'clinical.view',
  'clinical.edit',
  'episode.manage',
  'visit.mark',
  'visit.backdate',
  'visit.bulk',
  'fee.override',
  'ledger.view',
  'payment.record',
  'refund.process',
  'entry.reverse',
  'document.issue',
  'report.view',
  'data.import',
  'data.export',
  'audit.view',
  'platform.admin',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

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
  /** The clinic has no branch yet (just registered): the owner must finish setup first. */
  needsSetup: boolean
}

export interface Branch {
  id: string
  name: string
  /** Part of every receipt number; locked after the first receipt (BR-TEN-2). */
  code: string
  address: string | null
  phone: string | null
  isActive: boolean
  /** Active staff assigned here. */
  staffCount: number
  /** True once the branch has issued a receipt; the code can no longer change. */
  codeLocked: boolean
}

export interface BranchInput {
  name: string
  code: string
  address?: string | null
  phone?: string | null
}

export interface Clinic {
  id: string
  name: string
  phone: string | null
  address: string | null
  /** Printed on receipts, for example a registration number or GSTIN. */
  registrationDetails: string | null
  inactiveAfterDays: number
  /** Changes with the logo so the browser refetches it; null when there is no logo. */
  logoVersion: string | null
}

export type StaffRoleKey = 'receptionist' | 'physiotherapist'

export interface StaffMember {
  id: string
  fullName: string
  email: string
  role: { key: RoleKey; name: string }
  /** Null for the owner, who works across branches. */
  branch: { id: string; name: string; code: string } | null
  isActive: boolean
  lastLoginAt: string | null
  /** Invited but has not signed in yet. */
  invited: boolean
}

export interface StaffInput {
  fullName: string
  email: string
  role: StaffRoleKey
  branchId: string
}

export interface RoleSummary {
  id: string
  key: RoleKey
  name: string
  /** The owner role always has every permission and cannot be edited. */
  editable: boolean
  permissions: PermissionKey[]
  userCount: number
}

export interface PermissionWarning {
  permission: PermissionKey
  message: string
}

export interface RegisterClinicInput {
  clinicName: string
  fullName: string
  email: string
  phone: string
  password: string
  acceptTerms: boolean
}

export type LoginResult = { status: 'ok'; user: SessionUser } | { status: 'otp_required'; challengeId: string }

/** A browser that may skip the email code (AUTH-003). */
export interface TrustedDevice {
  id: string
  label: string
  lastUsedAt: string | null
  expiresAt: string
  /** The device making the request. */
  current: boolean
}

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
  phoneContactType: 'self' | 'guardian'
  status: 'active' | 'inactive'
  registeredBranch: { id: string; name: string }
  registeredAt: string
  lastVisitAt: string | null
  lastVisitBranch: string | null
  /** Null when the viewer lacks the ledger.view permission. */
  balance: Balance | null
}

export type PatientSort = 'newest' | 'oldest' | 'name' | 'name_desc'

export interface PatientSearchInput {
  q: string
  /** Only patients registered at this branch; omit for every branch of the clinic. */
  branchId?: string
  gender?: Gender
  status?: 'active' | 'inactive'
  phoneContactType?: 'self' | 'guardian'
  /** YYYY-MM-DD, India time, inclusive. */
  registeredFrom?: string
  registeredTo?: string
  sort?: PatientSort
  page?: number
  pageSize?: number
}

export interface CreatePatientInput {
  fullName: string
  /** As typed; the server normalises it (+91, spaces and a leading 0 are fine). */
  phone: string
  /** Age in years, or a date of birth (YYYY-MM-DD) from which the age is derived. One of the two is required. */
  age?: number
  dateOfBirth?: string
  gender: Gender
  phoneContactType?: 'self' | 'guardian'
  address?: string
  emergencyContact?: string
  occupation?: string
  referringDoctor?: string
  email?: string
  notes?: string
  /** Owners work across branches and say where the patient is registered; staff always use their own. */
  branchId?: string
}

/** Fields that can be changed later. An empty string clears an optional field. */
export type UpdatePatientInput = Partial<
  Omit<CreatePatientInput, 'branchId' | 'dateOfBirth'> & { dateOfBirth: string | null }
>

export interface PatientDetail {
  id: string
  fullName: string
  phone: string
  phoneContactType: 'self' | 'guardian'
  /** YYYY-MM-DD when known; the age is then derived from it. */
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
  createdAt: string
  activeEpisodeId: string | null
  balance: Balance | null
}

/** One course of treatment (CLN-001). A patient has at most one active episode. */
export interface Episode {
  id: string
  patientId: string
  status: 'active' | 'discharged'
  startedAt: string
  startedBranch: { id: string; name: string }
  dischargedAt: string | null
  dischargeNote: string | null
  dischargedBy: string | null
}

export interface AssessmentInput {
  history?: string
  pain?: string
  rangeOfMotion?: string
  diagnosis?: string
  extraFields?: { chiefComplaint?: string; painScore?: number }
}

/** One saved version of the initial assessment (CLN-002). Versions are never changed; an edit adds the next one. */
export interface Assessment {
  id: string
  episodeId: string
  version: number
  history: string | null
  pain: string | null
  rangeOfMotion: string | null
  diagnosis: string | null
  extraFields: { chiefComplaint?: string; painScore?: number }
  author: string
  createdAt: string
}

export interface TreatmentPlanInput {
  diagnosis?: string
  goals?: string
  plannedSessions?: number
  frequency?: string
  therapyTypes?: string
  estimatedCost?: Money
  notes?: string
}

/** One saved version of the treatment plan (CLN-003). */
export interface TreatmentPlan {
  id: string
  episodeId: string
  version: number
  diagnosis: string | null
  goals: string | null
  plannedSessions: number | null
  frequency: string | null
  therapyTypes: string | null
  /** Informational only: billing is per visit (PRD BR-CLN-5). */
  estimatedCost: Money | null
  /** Also holds free-text exercise instructions (US-13.4). */
  notes: string | null
  author: string
  createdAt: string
}

export interface PlanProgress {
  sessionsDone: number
  plannedSessions: number | null
  exceeded: boolean
}

/** GET /episodes/{id}: the episode with its latest assessment and plan. Opening it is audited. */
export interface EpisodeDetail {
  episode: Episode
  assessment: Assessment | null
  plan: TreatmentPlan | null
  sessionCount: number
  progress: PlanProgress
}

export interface DischargeResult {
  episode: Episode
  /** Null when the viewer cannot see balances. */
  balance: Balance | null
}

export interface VisitRecord {
  id: string
  episodeId: string
  visitedAt: string
  branchId: string
  /** Visits at any branch are tagged with where they happened (PAT-005). */
  branchName: string
  therapistName: string | null
  fee: Money
  feeOverrideReason: string | null
  reversed: boolean
  hasNote: boolean
}

export interface TodayVisit extends VisitRecord {
  patientId: string
  patientName: string
  patientPhone: string
  /** Null when the viewer cannot see balances. */
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
  /** The numbered receipt (or reversal receipt) this entry produced. */
  documentId: string | null
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
  /** Owners work across branches; staff always mark at their own. */
  branchId?: string
  /** YYYY-MM-DD of an earlier day, for attendance that was forgotten. Needs the visit.backdate permission. */
  visitDate?: string
  /** Required with an earlier visitDate. */
  backdateReason?: string
}

export interface MarkAttendanceResult {
  visit: VisitRecord
  sessionNumber: number
  planProgress: { planned: number | null; planExceeded: boolean }
  /** Null when the viewer cannot see balances. */
  balanceAfter: Balance | null
  duesWarning: { amount: Money } | null
}

/** One visit to add in bulk: a patient and the day (YYYY-MM-DD, India time) they attended. */
export interface BulkVisitEntry {
  patientId: string
  date: string
}

export interface BulkVisitsInput {
  entries: BulkVisitEntry[]
  therapistId?: string
  branchId?: string
  /** Required when any day is not today. */
  reason?: string
  /** Set after the user confirms visits on days that already have one. */
  confirmDuplicates?: boolean
}

/** One entry the server refused. Nothing is saved while any entry has a problem. */
export interface BulkProblem {
  patientId: string
  patientName: string | null
  date: string
  code: string
  message: string
}

export interface BulkVisitsResult {
  created: number
  totalFee: Money
  visits: { visitId: string; patientId: string; patientName: string | null; date: string }[]
}

export interface RecordPaymentInput {
  patientId: string
  amount: Money
  method: PaymentMethod
  reference?: string
  /** YYYY-MM-DD; back-dating is for the owner only. */
  date?: string
  branchId?: string
}

export interface RecordPaymentResult {
  entry: LedgerRecord
  receipt: { id: string; number: string }
  balanceAfter: Balance | null
}

export interface RefundInput {
  patientId: string
  amount: Money
  method: PaymentMethod
  reason: string
}

export interface RefundResult {
  entry: LedgerRecord
  balanceAfter: Balance | null
}

export interface ReverseResult {
  entry: LedgerRecord
  reversedEntryId: string
  /** Reversing a payment issues a receipt of its own. */
  reversalReceipt: { id: string; number: string } | null
  balanceAfter: Balance | null
}

/** All of a patient's money entries, newest first, with the balance they add up to. */
export interface PatientLedger {
  items: LedgerRecord[]
  balance: Balance
}

export interface SessionNote {
  id: string
  visitId: string
  version: number
  noteText: string
  author: string
  createdAt: string
}

export type DocumentType = 'RECEIPT' | 'REVERSAL_RECEIPT' | 'INVOICE'

export interface BillingDocument {
  id: string
  type: DocumentType
  number: string
  issuedAt: string
  branchName: string
  /** Null for period invoices. */
  amount: Money | null
}

export interface InvoiceInput {
  patientId: string
  /** Either an episode, or both dates (YYYY-MM-DD, India time). */
  episodeId?: string
  from?: string
  to?: string
}

export interface InvoiceResult {
  id: string
  number: string
  total: Money
  sessions: number
}

export interface DefaultFee {
  defaultFee: Money
  /** False until the owner has chosen a fee. */
  isSet: boolean
}

/** What the UI needs from a backend. Implemented by the mock and by the real HTTP client. */
export interface Api {
  auth: {
    login(email: string, password: string): Promise<LoginResult>
    verifyOtp(input: { challengeId: string; code: string; trustDevice: boolean }): Promise<SessionUser>
    /** A new code for the same sign-in; the returned id replaces the old one. */
    resendOtp(challengeId: string): Promise<{ challengeId: string }>
    me(): Promise<SessionUser | null>
    logout(): Promise<void>
    /** Always succeeds the same way, whether or not the account exists (US-03a.1). */
    forgotPassword(email: string): Promise<void>
    resetPassword(input: { token: string; newPassword: string }): Promise<void>
    changePassword(input: { currentPassword: string; newPassword: string }): Promise<void>
    devices(): Promise<TrustedDevice[]>
    revokeDevice(id: string): Promise<void>
    /** Clinic self-registration (TEN-001): emails a code; the same answer whether or not the email is taken. */
    register(input: RegisterClinicInput): Promise<{ registrationId: string }>
    verifyRegistration(input: { registrationId: string; code: string; trustDevice: boolean }): Promise<SessionUser>
    resendRegistration(registrationId: string): Promise<{ registrationId: string }>
    /** An invited staff member chooses their password (USR-001). */
    acceptInvitation(input: { token: string; newPassword: string }): Promise<void>
  }
  branches: {
    list(): Promise<Branch[]>
    create(input: BranchInput): Promise<Branch>
    update(id: string, input: Partial<BranchInput>): Promise<Branch>
    deactivate(id: string): Promise<Branch>
    reactivate(id: string): Promise<Branch>
  }
  users: {
    list(filter?: { role?: string; branchId?: string; active?: boolean }): Promise<StaffMember[]>
    /** `invitationSent` is false when the account was made but the email failed; use resendInvitation. */
    create(input: StaffInput): Promise<{ staff: StaffMember; invitationSent: boolean }>
    update(id: string, input: Partial<Pick<StaffInput, 'fullName' | 'role' | 'branchId'>>): Promise<StaffMember>
    deactivate(id: string): Promise<StaffMember>
    reactivate(id: string): Promise<StaffMember>
    resendInvitation(id: string): Promise<void>
  }
  roles: {
    list(): Promise<RoleSummary[]>
    /** Throws ApiError PERMISSION_WARNING (details.warnings) until called again with confirmWarnings. */
    setPermissions(id: string, permissions: PermissionKey[], confirmWarnings?: boolean): Promise<RoleSummary>
  }
  patients: {
    /** Name, or four or more digits of a phone number. An empty search returns the newest patients. */
    search(input: PatientSearchInput, signal?: AbortSignal): Promise<Paged<PatientListItem>>
    /** Throws ApiError DUPLICATE_PATIENT_WARNING (details.candidates) until called again with confirmDuplicate. */
    create(input: CreatePatientInput, options?: { confirmDuplicate?: boolean }): Promise<PatientDetail>
    /** Opening a patient is audited on the server. */
    get(id: string): Promise<PatientDetail>
    update(id: string, input: UpdatePatientInput, options?: { confirmDuplicate?: boolean }): Promise<PatientDetail>
  }
  episodes: {
    list(patientId: string): Promise<Episode[]>
    /** Owners work across branches and name one; staff always start at their own. */
    start(patientId: string, input?: { branchId?: string }): Promise<Episode>
    /** Opening an episode is audited on the server. */
    get(id: string): Promise<EpisodeDetail>
    /** Every version, newest first. Audited. */
    assessments(episodeId: string): Promise<Assessment[]>
    /** Saves the next version; returns the current one unchanged when nothing changed. */
    saveAssessment(episodeId: string, input: AssessmentInput): Promise<Assessment>
    plans(episodeId: string): Promise<TreatmentPlan[]>
    savePlan(episodeId: string, input: TreatmentPlanInput): Promise<TreatmentPlan>
    /** Never blocked by dues (BR-CLN-7); the balance comes back for the settle or refund prompt. */
    discharge(episodeId: string, note?: string): Promise<DischargeResult>
  }
  visits: {
    /** Today's visits (India time): the caller's branch, or for an owner the chosen branch (all when omitted). */
    today(branchId?: string): Promise<TodayVisit[]>
    create(input: MarkAttendanceInput, idempotencyKey: string): Promise<MarkAttendanceResult>
    /** Many visits in one all-or-nothing save (owner). Throws ApiError with details.problems when any entry is refused. */
    bulk(input: BulkVisitsInput, idempotencyKey: string): Promise<BulkVisitsResult>
    /** Every visit across episodes and branches, newest first (VIS-003). */
    forPatient(patientId: string): Promise<VisitRecord[]>
    /** Reverses the visit's charge; the visit stays listed as reversed (BILL-005). */
    reverse(visitId: string, reason: string, idempotencyKey: string): Promise<ReverseResult>
    /** Every version of the visit note, newest first. Opening it is audited. */
    notes(visitId: string): Promise<SessionNote[]>
    /** Saves the next version; returns the current one unchanged when nothing changed. */
    saveNote(visitId: string, noteText: string): Promise<SessionNote>
  }
  payments: {
    create(input: RecordPaymentInput, idempotencyKey: string): Promise<RecordPaymentResult>
    /** Only advance credit can be refunded (BILL-004). */
    refund(input: RefundInput, idempotencyKey: string): Promise<RefundResult>
  }
  ledger: {
    /** Opening it is audited. */
    forPatient(patientId: string): Promise<PatientLedger>
    reverse(entryId: string, reason: string, idempotencyKey: string): Promise<ReverseResult>
  }
  documents: {
    forPatient(patientId: string): Promise<BillingDocument[]>
    /** Address of the PDF; open it in a new tab to view, save or print (BILL-006). */
    pdfUrl(id: string): string
    invoice(input: InvoiceInput, idempotencyKey: string): Promise<InvoiceResult>
  }
  clinic: {
    get(): Promise<Clinic>
    update(
      input: Partial<Pick<Clinic, 'name' | 'phone' | 'address' | 'registrationDetails' | 'inactiveAfterDays'>>,
    ): Promise<Clinic>
    uploadLogo(file: File): Promise<Clinic>
    removeLogo(): Promise<Clinic>
    defaultFee(): Promise<DefaultFee>
    /** Owner only. Applies to future visits; earlier visits keep the fee they were charged. */
    setDefaultFee(amount: Money): Promise<DefaultFee>
    therapists(): Promise<Therapist[]>
  }
}
