import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type SessionUser } from '@/api'
import { AuthContext } from '@/auth/context'
import { RegisterPatientPage } from './RegisterPatientPage'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: {
      branches: {
        list: vi.fn().mockResolvedValue([
          { id: 'b1', name: 'Koregaon Park', code: 'PUN', isActive: true },
          { id: 'b2', name: 'Bandra West', code: 'MUM', isActive: true },
          { id: 'b3', name: 'Closed branch', code: 'OLD', isActive: false },
        ]),
      },
      patients: { create: vi.fn() },
    },
  }
})

const reactGlobals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true

const user = (branch: SessionUser['branch']): SessionUser => ({
  id: 'u1',
  fullName: 'Test User',
  email: 'test@example.test',
  role: branch ? 'receptionist' : 'owner',
  tenantName: 'Test Clinic',
  branch,
  permissions: ['patient.register', 'patient.view'],
  needsSetup: false,
})

let root: ReturnType<typeof createRoot> | undefined
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
})

async function renderPage(who: SessionUser): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root!.render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider
          value={{
            state: { status: 'authenticated', user: who },
            sessionExpired: false,
            signedIn: vi.fn(),
            signOut: vi.fn(),
          }}
        >
          <MemoryRouter>
            <RegisterPatientPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  })
  // Let the branch list resolve.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return container
}

describe('register patient form: choosing the branch (PAT-001, TEN-002)', () => {
  it('asks an owner, who works across branches, which branch the patient is registered at', async () => {
    const page = await renderPage(user(null))
    const select = page.querySelector<HTMLSelectElement>('select#branchId')
    expect(select, 'an owner must be able to pick the branch').not.toBeNull()
    const labels = [...select!.options].map((o) => o.textContent)
    expect(labels).toContain('Koregaon Park (PUN)')
    expect(labels).toContain('Bandra West (MUM)')
    expect(labels.join()).not.toContain('Closed branch') // only active branches
  })

  it('does not ask staff, who always register at their own branch', async () => {
    const page = await renderPage(user({ id: 'b1', name: 'Koregaon Park' }))
    expect(page.querySelector('select#branchId')).toBeNull()
  })

  it('shows the picker if the server asks for a branch the form did not ask for', async () => {
    const { api } = await import('@/api')
    vi.mocked(api.patients.create).mockRejectedValueOnce(
      new ApiError(422, 'VALIDATION_FAILED', 'Please fix the highlighted fields.', [
        { field: 'branchId', message: 'Choose the branch you are registering this patient at.' },
      ]),
    )
    const page = await renderPage(user({ id: 'b1', name: 'Koregaon Park' }))
    expect(page.querySelector('select#branchId')).toBeNull()

    const type = (selector: string, value: string) => {
      const input = page.querySelector<HTMLInputElement>(selector)!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await act(async () => {
      type('#fullName', 'Nishant Tomar')
      type('#phone', '98765 43210')
      type('#age', '38')
      page.querySelector<HTMLInputElement>('input[type=radio][value=male]')!.click()
    })
    await act(async () => {
      page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(page.querySelector('select#branchId')).not.toBeNull()
    expect(page.textContent).toContain('Choose the branch you are registering this patient at.')
  })
})
