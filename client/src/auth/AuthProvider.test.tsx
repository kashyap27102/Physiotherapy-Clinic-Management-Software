import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type SessionUser } from '@/api'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './hooks'

const me = vi.fn()
vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return { ...actual, api: { auth: { me: () => me(), logout: vi.fn() } } }
})

const reactGlobals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true

let root: ReturnType<typeof createRoot> | undefined
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
  me.mockReset()
})

const user: SessionUser = {
  id: 'u1',
  fullName: 'A B',
  email: 'a@b.test',
  role: 'owner',
  tenantName: 'Clinic',
  branch: null,
  permissions: [],
  needsSetup: false,
}

async function mount() {
  let latest!: ReturnType<typeof useAuth>
  function Probe() {
    // Test probe: hands the hook result to the test.
    // oxlint-disable-next-line react/globals
    latest = useAuth()
    return null
  }
  root = createRoot(document.body.appendChild(document.createElement('div')))
  await act(async () =>
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    ),
  )
  return () => latest
}

describe('AuthProvider', () => {
  it('is anonymous when the server says nobody is signed in', async () => {
    me.mockResolvedValue(null)
    expect((await mount())().state.status).toBe('anonymous')
  })

  it('is authenticated when the session is valid', async () => {
    me.mockResolvedValue(user)
    expect((await mount())().state.status).toBe('authenticated')
  })

  it('does not sign the user out when the server cannot be reached, and recovers on retry', async () => {
    me.mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'offline'))
    const get = await mount()
    expect(get().state.status).toBe('error')

    me.mockResolvedValue(user)
    await act(async () => get().retry())
    expect(get().state.status).toBe('authenticated')
  })
})
