import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PermissionKey, SessionUser } from '@/api'
import { AuthContext } from '@/auth/context'
import { LandingRedirect } from './LandingRedirect'

const reactGlobals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true

const user = (permissions: PermissionKey[]): SessionUser => ({
  id: 'u1',
  fullName: 'Test User',
  email: 'test@example.test',
  role: 'owner',
  tenantName: 'Test Clinic',
  branch: null,
  permissions,
  needsSetup: false,
})

let root: ReturnType<typeof createRoot> | undefined
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
})

async function landOn(permissions: PermissionKey[]): Promise<string> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <AuthContext.Provider
        value={{
          state: { status: 'authenticated', user: user(permissions) },
          sessionExpired: false,
          signedIn: vi.fn(),
          signOut: vi.fn(),
          retry: vi.fn(),
        }}
      >
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route index element={<LandingRedirect />} />
            <Route path="dashboard" element={<p>dashboard page</p>} />
            <Route path="patients" element={<p>patients page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    )
  })
  return container.textContent ?? ''
}

describe('where "/" leads after sign-in (US-01.1)', () => {
  it('sends the owner to the dashboard', async () => {
    expect(await landOn(['patient.view', 'report.view'])).toBe('dashboard page')
  })

  it('sends a receptionist or physiotherapist to the patient list', async () => {
    expect(await landOn(['patient.view', 'visit.mark'])).toBe('patients page')
  })
})
