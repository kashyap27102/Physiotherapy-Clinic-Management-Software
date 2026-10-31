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

describe('visits and billing calls', () => {
  it('unwraps the visit lists and sends the branch only when one is chosen', async () => {
    respond = () => ({ status: 200, data: { items: [{ id: 'v1' }] } })
    expect(await httpApi.visits.today()).toEqual([{ id: 'v1' }])
    expect(seen.at(-1)!.params).toEqual({})
    await httpApi.visits.today('b1')
    expect(seen.at(-1)!.params).toEqual({ branchId: 'b1' })
    expect(await httpApi.visits.forPatient('p1')).toEqual([{ id: 'v1' }])
    expect(seen.at(-1)!.url).toBe('/patients/p1/visits')
  })

  it('sends the reason and a key when reversing a visit or a ledger entry', async () => {
    respond = () => ({ status: 201, data: {} })
    await httpApi.visits.reverse('v1', 'Marked by mistake', 'key-v')
    expect(seen.at(-1)!.url).toBe('/visits/v1/reverse')
    expect(JSON.parse(seen.at(-1)!.data as string)).toEqual({ reason: 'Marked by mistake' })
    expect(seen.at(-1)!.headers.get('Idempotency-Key')).toBe('key-v')

    await httpApi.ledger.reverse('e1', 'Wrong amount', 'key-e')
    expect(seen.at(-1)!.url).toBe('/ledger-entries/e1/reverse')
    expect(seen.at(-1)!.headers.get('Idempotency-Key')).toBe('key-e')
  })

  it('keeps money as strings end to end for refunds and the default fee', async () => {
    respond = () => ({ status: 201, data: {} })
    await httpApi.payments.refund({ patientId: 'p1', amount: '400.00', method: 'cash', reason: 'Stopped' }, 'key-r')
    expect(JSON.parse(seen.at(-1)!.data as string)).toMatchObject({ amount: '400.00' })
    expect(seen.at(-1)!.headers.get('Idempotency-Key')).toBe('key-r')

    respond = () => ({ status: 200, data: { defaultFee: '500.00', isSet: true } })
    expect(await httpApi.clinic.setDefaultFee('500.00')).toEqual({ defaultFee: '500.00', isSet: true })
    expect(seen.at(-1)!.method).toBe('put')
  })

  it('points receipts at the PDF endpoint so the browser can open them', () => {
    expect(httpApi.documents.pdfUrl('d1')).toBe('/api/v1/documents/d1/pdf')
  })
})
