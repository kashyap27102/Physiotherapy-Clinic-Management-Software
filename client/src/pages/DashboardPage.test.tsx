import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardToday, FinanceToday, PermissionKey, SessionUser } from '@/api'
import { AuthContext } from '@/auth/context'
import { DashboardPage } from './DashboardPage'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: {
      dashboard: { today: vi.fn() },
      finance: { today: vi.fn() },
      visits: { today: vi.fn().mockResolvedValue([]) },
    },
  }
})

const reactGlobals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true

const summary = (over: Partial<DashboardToday> = {}): DashboardToday => ({
  date: '2026-11-01',
  branchId: null,
  patientsSeen: 12,
  sessions: 13,
  newPatients: 2,
  byBranch: [
    { branchId: 'b1', name: 'Koregaon Park', patientsSeen: 8, sessions: 9 },
    { branchId: 'b2', name: 'Baner', patientsSeen: 4, sessions: 4 },
  ],
  ...over,
})

const money: FinanceToday = {
  date: '2026-11-01',
  branchId: null,
  collections: { net: '6000.00', payments: '6500.00', reversed: '500.00', refunded: '0.00', byMethod: [] },
  dues: { total: '0.00', patients: 0, top: [] },
  byBranch: null,
}

const owner: PermissionKey[] = [
  'patient.view',
  'patient.register',
  'visit.mark',
  'visit.bulk',
  'payment.record',
  'report.view',
  'finance.view',
]
const receptionist: PermissionKey[] = ['patient.view', 'patient.register', 'visit.mark', 'payment.record']

const userWith = (permissions: PermissionKey[]): SessionUser => ({
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
  vi.clearAllMocks()
})

async function render(permissions: PermissionKey[], data: DashboardToday | Error = summary()): Promise<HTMLElement> {
  const { api } = await import('@/api')
  if (data instanceof Error) vi.mocked(api.dashboard.today).mockRejectedValue(data)
  else vi.mocked(api.dashboard.today).mockResolvedValue(data)
  vi.mocked(api.finance.today).mockResolvedValue(money)
  vi.mocked(api.visits.today).mockResolvedValue([])
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root!.render(
      <AuthContext.Provider
        value={{
          state: { status: 'authenticated', user: userWith(permissions) },
          sessionExpired: false,
          signedIn: vi.fn(),
          signOut: vi.fn(),
          retry: vi.fn(),
        }}
      >
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </QueryClientProvider>
      </AuthContext.Provider>,
    )
  })
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  return container
}

const labels = (page: HTMLElement) => [...page.querySelectorAll('a, button')].map((el) => el.textContent?.trim())

describe('dashboard (REP-001, US-26)', () => {
  it('shows 12 patients seen with sessions and new patients (US-26.1)', async () => {
    const page = await render(owner)
    expect(page.textContent).toContain('Patients seen')
    expect(page.textContent).toContain('13 sessions')
    expect(page.textContent).toContain('2 new patients')
  })

  it('links "Collected today" to the finance page for someone with finance.view', async () => {
    const page = await render(owner)
    const link = [...page.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/finance')
    expect(link?.textContent).toContain('₹6,000')
  })

  it('shows no money without finance.view, and never asks for it', async () => {
    const { api } = await import('@/api')
    const page = await render(['patient.view', 'report.view'])
    expect(page.textContent).toContain('Patients seen')
    expect(page.textContent).not.toContain('Collected today')
    expect(page.querySelector('a[href="/finance"]')).toBeNull()
    expect(api.finance.today).not.toHaveBeenCalled()
  })

  it("gives a receptionist quick actions and today's visits, but no KPI tiles", async () => {
    const { api } = await import('@/api')
    const page = await render(receptionist)
    expect(labels(page)).toEqual(expect.arrayContaining(['Register patient', 'Mark attendance', 'Record payment']))
    expect(labels(page)).not.toContain('Bulk attendance')
    expect(page.textContent).not.toContain('Patients seen')
    expect(api.dashboard.today).not.toHaveBeenCalled()
    expect(api.finance.today).not.toHaveBeenCalled()
    expect(api.visits.today).toHaveBeenCalled()
  })

  it('offers bulk attendance only with visit.bulk', async () => {
    expect(labels(await render(owner))).toContain('Bulk attendance')
  })

  it('lists each branch, across branches', async () => {
    const page = await render(owner)
    expect(page.textContent).toContain('Koregaon Park')
    expect(page.textContent).toContain('Baner')
  })

  it('has no branch list when one branch is chosen', async () => {
    const page = await render(owner, summary({ byBranch: null, branchId: 'b1' }))
    expect(page.textContent).not.toContain('By branch')
  })

  it('says so when the dashboard cannot load', async () => {
    const page = await render(owner, new Error('offline'))
    expect(page.textContent).toContain('could not be loaded')
    expect(labels(page)).toContain('Try again')
  })
})
