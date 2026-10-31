// Real backend client. Endpoint paths follow docs/API-Requirements.md.
// Every endpoint here is served by the Express server in ../server.

import axios, { isAxiosError, type Method } from 'axios'
import { ApiError, errorDetails, type ApiErrorCode, type FieldError } from './errors'
import { notifySessionExpired } from './sessionEvents'
import { PERMISSION_KEYS } from './types'
import type {
  Api,
  Assessment,
  BillingDocument,
  Branch,
  Clinic,
  DefaultFee,
  DischargeResult,
  Episode,
  EpisodeDetail,
  TreatmentPlan,
  LoginResult,
  Paged,
  PatientDetail,
  PatientLedger,
  PatientListItem,
  RoleKey,
  RoleSummary,
  SessionNote,
  SessionUser,
  StaffMember,
  TodayVisit,
  TrustedDevice,
  VisitRecord,
} from './types'

const BASE = '/api/v1'

/**
 * The session's CSRF token (API-AUTH-1). The server hands it over on sign-in and on /auth/me; it lives only in
 * memory, never in storage, and goes back as X-CSRF-Token on every request that changes data.
 */
let csrfToken: string | null = null

/** What the server sends for the signed-in user (login, OTP verify, /auth/me). */
interface ServerProfile {
  id: string
  email: string
  fullName: string
  isSuperAdmin: boolean
  tenant: { id: string; name: string } | null
  branch: { id: string; name: string; code: string } | null
  role: { key: string; name: string } | null
  permissions: string[]
  needsSetup: boolean
  csrfToken: string
}

const ROLE_KEYS: readonly RoleKey[] = ['owner', 'receptionist', 'physiotherapist']

function toSessionUser(profile: ServerProfile): SessionUser {
  const roleKey = profile.role?.key
  return {
    id: profile.id,
    fullName: profile.fullName,
    email: profile.email,
    role: profile.isSuperAdmin ? 'super_admin' : (ROLE_KEYS.find((key) => key === roleKey) ?? 'receptionist'),
    tenantName: profile.tenant?.name ?? '',
    branch: profile.branch ? { id: profile.branch.id, name: profile.branch.name } : null,
    // A key this build does not know is dropped; permissions only hide or show UI, the server enforces them.
    permissions: PERMISSION_KEYS.filter((key) => profile.permissions.includes(key)),
    needsSetup: profile.needsSetup,
  }
}

/** Maps the server's profile and remembers its CSRF token for the requests that follow. */
function startSession(profile: ServerProfile): SessionUser {
  csrfToken = profile.csrfToken
  return toSessionUser(profile)
}

/** Auth calls answer 401 as part of their normal flow, so they never mean "your session just expired". */
const AUTH_FLOW = /^\/auth\/(login|otp\/|register|password\/(forgot|reset)|me$)/

interface RequestOptions {
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  /** Lets a caller (React Query) cancel the request. */
  signal?: AbortSignal
  idempotencyKey?: string
  /** For raw uploads such as the clinic logo; JSON otherwise. */
  contentType?: string
}

interface ErrorBody {
  error?: { code?: string; message?: string; fields?: FieldError[]; details?: unknown }
}

/** One axios instance for the whole app: same-origin `/api/v1` (proxied by Vite in development), cookies included. */
const client = axios.create({
  baseURL: BASE,
  withCredentials: true,
  timeout: 30_000,
  headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
})

client.interceptors.request.use((config) => {
  if (config.method !== 'get' && csrfToken) config.headers.set('X-CSRF-Token', csrfToken)
  return config
})

/** Turns any axios failure into an ApiError in the server's error format (API-Requirements section 2.1). */
function toApiError(error: unknown, path: string): ApiError {
  if (!isAxiosError<ErrorBody>(error) || !error.response) {
    return new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your internet connection.')
  }
  const { status, data } = error.response
  const body = data?.error
  if (status === 401 && body?.code === 'UNAUTHENTICATED' && !AUTH_FLOW.test(path)) {
    csrfToken = null
    notifySessionExpired()
  }
  return new ApiError(
    status,
    (body?.code as ApiErrorCode | undefined) ?? 'UNKNOWN',
    body?.message ?? 'Something went wrong. Please try again.',
    body?.fields ?? [],
    body?.details,
  )
}

async function request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
  const params = Object.fromEntries(
    Object.entries(options.query ?? {}).filter(([, value]) => value !== undefined && value !== ''),
  )
  try {
    const response = await client.request<T>({
      method,
      url: path,
      params,
      data: options.body,
      signal: options.signal,
      headers: {
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
        ...(options.contentType ? { 'Content-Type': options.contentType } : {}),
      },
    })
    return (response.status === 204 ? undefined : response.data) as T
  } catch (error) {
    throw toApiError(error, path)
  }
}

export const httpApi: Api = {
  auth: {
    async login(email, password): Promise<LoginResult> {
      try {
        const profile = await request<ServerProfile>('POST', '/auth/login', { body: { email, password } })
        return { status: 'ok', user: startSession(profile) }
      } catch (error) {
        if (error instanceof ApiError && error.code === 'OTP_REQUIRED') {
          return { status: 'otp_required', challengeId: errorDetails<{ challengeId: string }>(error).challengeId ?? '' }
        }
        throw error
      }
    },
    async verifyOtp(input) {
      return startSession(await request<ServerProfile>('POST', '/auth/otp/verify', { body: input }))
    },
    resendOtp: (challengeId) => request<{ challengeId: string }>('POST', '/auth/otp/resend', { body: { challengeId } }),
    async me() {
      try {
        return startSession(await request<ServerProfile>('GET', '/auth/me'))
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    async logout() {
      try {
        await request<void>('POST', '/auth/logout')
      } finally {
        csrfToken = null
      }
    },
    async forgotPassword(email) {
      await request('POST', '/auth/password/forgot', { body: { email } })
    },
    async resetPassword(input) {
      await request('POST', '/auth/password/reset', { body: input })
    },
    async changePassword(input) {
      await request('POST', '/auth/password/change', { body: input })
    },
    async devices() {
      const result = await request<{ devices: TrustedDevice[] }>('GET', '/auth/devices')
      return result.devices
    },
    revokeDevice: (id) => request<void>('DELETE', `/auth/devices/${id}`),
    register: (input) => request<{ registrationId: string }>('POST', '/auth/register', { body: input }),
    async verifyRegistration(input) {
      return startSession(await request<ServerProfile>('POST', '/auth/register/verify', { body: input }))
    },
    resendRegistration: (registrationId) =>
      request<{ registrationId: string }>('POST', '/auth/register/resend', { body: { registrationId } }),
    async acceptInvitation(input) {
      await request('POST', '/auth/invitation/accept', { body: input })
    },
  },

  branches: {
    async list() {
      const result = await request<{ branches: Branch[] }>('GET', '/branches')
      return result.branches
    },
    create: (input) => request<Branch>('POST', '/branches', { body: input }),
    update: (id, input) => request<Branch>('PATCH', `/branches/${id}`, { body: input }),
    deactivate: (id) => request<Branch>('POST', `/branches/${id}/deactivate`),
    reactivate: (id) => request<Branch>('POST', `/branches/${id}/reactivate`),
  },

  users: {
    async list(filter = {}) {
      const result = await request<{ staff: StaffMember[] }>('GET', '/users', {
        query: { role: filter.role, branchId: filter.branchId, active: filter.active },
      })
      return result.staff
    },
    create: (input) => request('POST', '/users', { body: input }),
    update: (id, input) => request<StaffMember>('PATCH', `/users/${id}`, { body: input }),
    deactivate: (id) => request<StaffMember>('POST', `/users/${id}/deactivate`),
    reactivate: (id) => request<StaffMember>('POST', `/users/${id}/reactivate`),
    resendInvitation: (id) => request<void>('POST', `/users/${id}/resend-invitation`),
  },

  roles: {
    async list() {
      const result = await request<{ roles: RoleSummary[] }>('GET', '/roles')
      return result.roles
    },
    setPermissions: (id, permissions, confirmWarnings = false) =>
      request<RoleSummary>('PUT', `/roles/${id}/permissions`, { body: { permissions, confirmWarnings } }),
  },

  patients: {
    search: (input, signal) => request<Paged<PatientListItem>>('GET', '/patients', { query: { ...input }, signal }),
    create: (input, options) =>
      request<PatientDetail>('POST', '/patients', {
        body: input,
        query: { confirmDuplicate: options?.confirmDuplicate },
      }),
    get: (id) => request<PatientDetail>('GET', `/patients/${id}`),
    update: (id, input, options) =>
      request<PatientDetail>('PATCH', `/patients/${id}`, {
        body: input,
        query: { confirmDuplicate: options?.confirmDuplicate },
      }),
  },

  episodes: {
    async list(patientId) {
      const result = await request<{ items: Episode[] }>('GET', `/patients/${patientId}/episodes`)
      return result.items
    },
    start: (patientId, input = {}) => request<Episode>('POST', `/patients/${patientId}/episodes`, { body: input }),
    get: (id) => request<EpisodeDetail>('GET', `/episodes/${id}`),
    async assessments(episodeId) {
      const result = await request<{ items: Assessment[] }>('GET', `/episodes/${episodeId}/assessments`)
      return result.items
    },
    saveAssessment: (episodeId, input) =>
      request<Assessment>('POST', `/episodes/${episodeId}/assessments`, { body: input }),
    async plans(episodeId) {
      const result = await request<{ items: TreatmentPlan[] }>('GET', `/episodes/${episodeId}/treatment-plans`)
      return result.items
    },
    savePlan: (episodeId, input) =>
      request<TreatmentPlan>('POST', `/episodes/${episodeId}/treatment-plans`, { body: input }),
    discharge: (episodeId, note) =>
      request<DischargeResult>('POST', `/episodes/${episodeId}/discharge`, { body: note ? { note } : {} }),
  },

  visits: {
    async today(branchId) {
      const result = await request<{ items: TodayVisit[] }>('GET', '/visits/today', { query: { branchId } })
      return result.items
    },
    create: (input, idempotencyKey) => request('POST', '/visits', { body: input, idempotencyKey }),
    async forPatient(patientId) {
      const result = await request<{ items: VisitRecord[] }>('GET', `/patients/${patientId}/visits`)
      return result.items
    },
    reverse: (visitId, reason, idempotencyKey) =>
      request('POST', `/visits/${visitId}/reverse`, { body: { reason }, idempotencyKey }),
    async notes(visitId) {
      const result = await request<{ items: SessionNote[] }>('GET', `/visits/${visitId}/notes`)
      return result.items
    },
    saveNote: (visitId, noteText) => request('POST', `/visits/${visitId}/notes`, { body: { noteText } }),
  },

  payments: {
    create: (input, idempotencyKey) => request('POST', '/payments', { body: input, idempotencyKey }),
    refund: (input, idempotencyKey) => request('POST', '/refunds', { body: input, idempotencyKey }),
  },

  ledger: {
    forPatient: (patientId) => request<PatientLedger>('GET', `/patients/${patientId}/ledger`),
    reverse: (entryId, reason, idempotencyKey) =>
      request('POST', `/ledger-entries/${entryId}/reverse`, { body: { reason }, idempotencyKey }),
  },

  documents: {
    async forPatient(patientId) {
      const result = await request<{ items: BillingDocument[] }>('GET', `/patients/${patientId}/documents`)
      return result.items
    },
    pdfUrl: (id) => `${BASE}/documents/${id}/pdf`,
    invoice: (input, idempotencyKey) => request('POST', '/invoices', { body: input, idempotencyKey }),
  },

  clinic: {
    get: () => request<Clinic>('GET', '/clinic'),
    update: (input) => request<Clinic>('PATCH', '/clinic', { body: input }),
    // The server reads the raw image bytes and checks the real type itself.
    uploadLogo: (file) =>
      request<Clinic>('POST', '/clinic/logo', { body: file, contentType: file.type || 'image/png' }),
    removeLogo: () => request<Clinic>('DELETE', '/clinic/logo'),
    defaultFee: () => request<DefaultFee>('GET', '/clinic/fee'),
    setDefaultFee: (amount) => request<DefaultFee>('PUT', '/clinic/fee', { body: { defaultFee: amount } }),
    // Open to anyone who can mark attendance (not in API doc v1.0).
    therapists: () => request('GET', '/branches/current/therapists'),
  },
}
