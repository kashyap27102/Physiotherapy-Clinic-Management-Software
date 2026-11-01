import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardToday } from '@/api'
import { DashboardPage } from './DashboardPage'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return { ...actual, api: { dashboard: { today: vi.fn() } } }
})

const reactGlobals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true

const summary = (over: Partial<DashboardToday> = {}): DashboardToday => ({
  date: '2026-11-01',
  branchId: null,
  patientsSeen: 12,
  sessions: 13,
  newPatients: 2,
  collections: {
    net: '6000.00',
    payments: '6500.00',
    reversed: '500.00',
    refunded: '0.00',
    byMethod: [
      { method: 'cash', amount: '4000.00' },
      { method: 'upi', amount: '2000.00' },
      { method: 'card', amount: '0.00' },
      { method: 'bank_transfer', amount: '0.00' },
    ],
  },
  dues: {
    total: '5300.00',
    patients: 2,
    top: [
      { patientId: 'p2', fullName: 'Dash Two', amount: '3000.00' },
      { patientId: 'p1', fullName: 'Dash One', amount: '2300.00' },
    ],
  },
  byBranch: [
    { branchId: 'b1', name: 'Koregaon Park', patientsSeen: 8, sessions: 9, collected: '4500.00' },
    { branchId: 'b2', name: 'Baner', patientsSeen: 4, sessions: 4, collected: '1500.00' },
  ],
  ...over,
})

let root: ReturnType<typeof createRoot> | undefined
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
})

async function render(data: DashboardToday | Error): Promise<HTMLElement> {
  const { api } = await import('@/api')
  if (data instanceof Error) vi.mocked(api.dashboard.today).mockRejectedValue(data)
  else vi.mocked(api.dashboard.today).mockResolvedValue(data)
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root!.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  })
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  return container
}

describe('owner dashboard (REP-001, US-26)', () => {
  it('shows 12 patients seen and ₹6,000 collected, with the reversal visible (US-26.1, US-26.2)', async () => {
    const page = await render(summary())
    expect(page.textContent).toContain('Collected today')
    expect(page.textContent).toContain('₹6,000')
    expect(page.textContent).toContain('₹6,500 received')
    expect(page.textContent).toContain('₹500 reversed')
    expect(page.textContent).not.toContain('refunded')
    expect(page.textContent).toContain('Patients seen')
    expect(page.textContent).toContain('13 sessions')
    expect(page.textContent).toContain('2 new patients')
  })

  it('shows what is owed and links the largest dues to the patient', async () => {
    const page = await render(summary())
    expect(page.textContent).toContain('₹5,300')
    expect(page.textContent).toContain('2 patients owe money')
    const links = [...page.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(links).toEqual(['/patients/p2', '/patients/p1'])
    expect(page.textContent).toContain('Dash Two')
  })

  it('lists collections by method and, across branches, by branch (US-26.3)', async () => {
    const page = await render(summary())
    expect(page.textContent).toContain('Cash')
    expect(page.textContent).toContain('₹4,000')
    expect(page.textContent).toContain('UPI')
    expect(page.textContent).toContain('Koregaon Park')
    expect(page.textContent).toContain('Baner')
  })

  it('has no branch table when one branch is chosen', async () => {
    const page = await render(summary({ byBranch: null, branchId: 'b1' }))
    expect(page.textContent).not.toContain('By branch')
  })

  it('stays calm on a quiet day', async () => {
    const page = await render(
      summary({
        patientsSeen: 0,
        sessions: 0,
        newPatients: 0,
        collections: { net: '0.00', payments: '0.00', reversed: '0.00', refunded: '0.00', byMethod: [] },
        dues: { total: '0.00', patients: 0, top: [] },
        byBranch: null,
      }),
    )
    expect(page.textContent).toContain('Nobody owes anything')
    expect(page.textContent).toContain('No dues')
    expect(page.textContent).not.toContain('received')
  })

  it('says so when the dashboard cannot load', async () => {
    const page = await render(new Error('offline'))
    expect(page.textContent).toContain('could not be loaded')
    expect([...page.querySelectorAll('button')].map((b) => b.textContent?.trim())).toContain('Try again')
  })
})
