// Real backend client. Endpoint paths follow docs/API-Requirements.md.
// Not exercised until the Express backend exists (set VITE_USE_MOCK_API=false to use it).

import { ApiError, type ApiErrorCode, type FieldError } from './errors'
import type { Api, LoginResult, Paged, PatientListItem, SessionUser } from './types'

const BASE = '/api/v1'

interface RequestOptions {
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  idempotencyKey?: string
}

interface ErrorBody {
  error?: { code?: string; message?: string; fields?: FieldError[]; details?: unknown }
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(BASE + path, window.location.origin)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
  }
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'fetch' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your internet connection.')
  }

  if (response.status === 204) return undefined as T
  const payload = (await response.json().catch(() => ({}))) as unknown

  if (!response.ok) {
    const error = (payload as ErrorBody).error
    throw new ApiError(
      response.status,
      (error?.code as ApiErrorCode | undefined) ?? 'UNKNOWN',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.fields ?? [],
      error?.details,
    )
  }
  return payload as T
}

export const httpApi: Api = {
  auth: {
    async login(email, password): Promise<LoginResult> {
      try {
        return await request<LoginResult>('POST', '/auth/login', { body: { email, password } })
      } catch (error) {
        if (error instanceof ApiError && error.code === 'OTP_REQUIRED') {
          const details = (error.details ?? {}) as { challengeId?: string }
          return { status: 'otp_required', challengeId: details.challengeId ?? '' }
        }
        throw error
      }
    },
    verifyOtp: (input) => request<SessionUser>('POST', '/auth/otp/verify', { body: input }),
    async me() {
      try {
        return await request<SessionUser>('GET', '/auth/me')
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    logout: () => request<void>('POST', '/auth/logout'),
  },

  patients: {
    search: ({ q, page }) => request<Paged<PatientListItem>>('GET', '/patients', { query: { q, page } }),
    create: (input, options) =>
      request('POST', '/patients', { body: input, query: { confirmDuplicate: options?.confirmDuplicate } }),
    get: (id) => request('GET', `/patients/${id}`),
    episodes: (id) => request('GET', `/patients/${id}/episodes`),
    visits: (id) => request('GET', `/patients/${id}/visits`),
    ledger: (id) => request('GET', `/patients/${id}/ledger`),
  },

  episodes: {
    start: (patientId) => request('POST', `/patients/${patientId}/episodes`),
  },

  visits: {
    today: () => request('GET', '/visits/today'),
    create: (input, idempotencyKey) => request('POST', '/visits', { body: input, idempotencyKey }),
  },

  payments: {
    create: (input, idempotencyKey) => request('POST', '/payments', { body: input, idempotencyKey }),
  },

  clinic: {
    async defaultFee() {
      const result = await request<{ defaultFee: string }>('GET', '/clinic/fee')
      return result.defaultFee
    },
    // Needs a backend endpoint open to anyone who can mark attendance (not in API doc v1.0 yet).
    therapists: () => request('GET', '/branches/current/therapists'),
  },
}
