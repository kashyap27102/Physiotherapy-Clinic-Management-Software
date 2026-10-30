import { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const seen: InternalAxiosRequestConfig[] = []
let respond: (config: InternalAxiosRequestConfig) => { status: number; data?: unknown }

// Every request goes through this adapter instead of the network.
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>()
  return {
    ...actual,
    default: {
      create: (config: AxiosRequestConfig) =>
        actual.default.create({
          ...config,
          adapter: async (request: InternalAxiosRequestConfig) => {
            seen.push(request)
            const { status, data } = respond(request)
            const response = { status, data, statusText: '', headers: {}, config: request }
            if (status >= 400) throw new AxiosError('failed', String(status), request, null, response)
            return response
          },
        }),
    },
  }
})

const { httpApi } = await import('./http')
const { onSessionExpired } = await import('./sessionEvents')

const profile = (permissions: string[] = ['patient.view', 'made.up.permission']) => ({
  id: 'u1',
  email: 'a@b.test',
  fullName: 'A B',
  isSuperAdmin: false,
  tenant: { id: 't1', name: 'Clinic' },
  branch: null,
  role: { key: 'owner', name: 'Owner' },
  permissions,
  needsSetup: false,
  csrfToken: 'csrf-1',
})

beforeEach(() => {
  seen.length = 0
})

describe('http client', () => {
  it('sends the CSRF token from /auth/me on later writes, but not on reads', async () => {
    respond = () => ({ status: 200, data: profile() })
    await httpApi.auth.me()
    respond = () => ({ status: 200, data: { branches: [] } })
    await httpApi.branches.list()
    respond = () => ({ status: 200, data: {} })
    await httpApi.branches.deactivate('b1')

    expect(seen[1]!.headers.get('X-CSRF-Token')).toBeFalsy()
    expect(seen[2]!.headers.get('X-CSRF-Token')).toBe('csrf-1')
  })

  it('keeps only permissions this build knows', async () => {
    respond = () => ({ status: 200, data: profile() })
    const user = await httpApi.auth.me()
    expect(user?.permissions).toEqual(['patient.view'])
  })

  it('answers null from /auth/me when signed out, but throws when the server cannot be reached', async () => {
    respond = () => ({ status: 401, data: { error: { code: 'UNAUTHENTICATED', message: 'no' } } })
    await expect(httpApi.auth.me()).resolves.toBeNull()
    respond = () => {
      throw new AxiosError('Network Error')
    }
    await expect(httpApi.auth.me()).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('announces an expired session for a 401 outside the sign-in flow only', async () => {
    const expired = vi.fn()
    const stop = onSessionExpired(expired)
    respond = () => ({ status: 401, data: { error: { code: 'UNAUTHENTICATED', message: 'expired' } } })

    await expect(httpApi.branches.list()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    expect(expired).toHaveBeenCalledTimes(1)

    await httpApi.auth.me()
    expect(expired).toHaveBeenCalledTimes(1)
    stop()
  })

  it('maps the error body onto an ApiError with its field errors', async () => {
    respond = () => ({
      status: 422,
      data: { error: { code: 'VALIDATION_FAILED', message: 'Invalid', fields: [{ field: 'name', message: 'Short' }] } },
    })
    await expect(httpApi.branches.create({ name: '', code: '' })).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
      fields: [{ field: 'name', message: 'Short' }],
    })
  })

  it('passes the abort signal and the idempotency key through', async () => {
    respond = () => ({ status: 200, data: { items: [], total: 0 } })
    const controller = new AbortController()
    await httpApi.patients.search({ q: '' }, controller.signal)
    expect(seen.at(-1)!.signal).toBe(controller.signal)

    respond = () => ({ status: 200, data: {} })
    await httpApi.payments.create({ patientId: 'p1', amount: '100.00', method: 'cash' }, 'key-1')
    expect(seen.at(-1)!.headers.get('Idempotency-Key')).toBe('key-1')
  })
})
