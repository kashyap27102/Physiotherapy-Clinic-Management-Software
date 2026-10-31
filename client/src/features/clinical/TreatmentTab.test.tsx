import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Episode, EpisodeDetail, PatientDetail, PermissionKey, SessionUser } from '@/api'
import { AuthContext } from '@/auth/context'
import { TreatmentTab } from './TreatmentTab'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: {
      episodes: { list: vi.fn(), get: vi.fn(), assessments: vi.fn(), plans: vi.fn() },
    },
  }
})

const reactGlobals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true

const patient: PatientDetail = {
  id: 'p1',
  fullName: 'Anita Rao',
  phone: '9876543210',
  phoneContactType: 'self',
  dateOfBirth: null,
  age: 41,
  gender: 'female',
  address: null,
  emergencyContact: null,
  occupation: null,
  referringDoctor: null,
  email: null,
  notes: null,
  status: 'active',
  registeredBranch: 'Koregaon Park',
  createdAt: '2026-10-01T05:00:00.000Z',
  activeEpisodeId: 'e2',
  balance: null,
}

const episode = (id: string, status: Episode['status']): Episode => ({
  id,
  patientId: 'p1',
  status,
  startedAt: '2026-10-10T05:00:00.000Z',
  startedBranch: { id: 'b1', name: 'Koregaon Park' },
  dischargedAt: status === 'discharged' ? '2026-10-20T05:00:00.000Z' : null,
  dischargeNote: status === 'discharged' ? 'Goals met' : null,
  dischargedBy: status === 'discharged' ? 'Dr Mehta' : null,
})

const detail = (ep: Episode): EpisodeDetail => ({
  episode: ep,
  assessment: {
    id: 'a1',
    episodeId: ep.id,
    version: 2,
    history: 'Knee pain for three weeks',
    pain: null,
    rangeOfMotion: null,
    diagnosis: 'Patellofemoral pain',
    extraFields: { painScore: 6 },
    author: 'Dr Mehta',
    createdAt: '2026-10-11T05:00:00.000Z',
  },
  plan: null,
  sessionCount: 0,
  progress: { sessionsDone: 0, plannedSessions: null, exceeded: false },
})

const user = (permissions: PermissionKey[]): SessionUser => ({
  id: 'u1',
  fullName: 'Test User',
  email: 'test@example.test',
  role: 'physiotherapist',
  tenantName: 'Test Clinic',
  branch: { id: 'b1', name: 'Koregaon Park' },
  permissions,
  needsSetup: false,
})

let root: ReturnType<typeof createRoot> | undefined
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
})

beforeEach(async () => {
  const { api } = await import('@/api')
  vi.mocked(api.episodes.list).mockResolvedValue([episode('e2', 'active'), episode('e1', 'discharged')])
  vi.mocked(api.episodes.get).mockImplementation((id) =>
    Promise.resolve(detail(id === 'e2' ? episode('e2', 'active') : episode('e1', 'discharged'))),
  )
})

async function render(permissions: PermissionKey[], who: PatientDetail = patient): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root!.render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider
          value={{
            state: { status: 'authenticated', user: user(permissions) },
            sessionExpired: false,
            signedIn: vi.fn(),
            signOut: vi.fn(),
            retry: vi.fn(),
          }}
        >
          <MemoryRouter>
            <TreatmentTab patient={who} />
          </MemoryRouter>
        </AuthContext.Provider>
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

const buttons = (page: HTMLElement) => [...page.querySelectorAll('button')].map((b) => b.textContent?.trim())

describe('treatment tab (CLN-001 to CLN-004)', () => {
  it('shows the current episode with its latest assessment, and edit and discharge for a physiotherapist', async () => {
    const page = await render(['clinical.view', 'clinical.edit', 'episode.manage'])
    expect(page.textContent).toContain('Current episode')
    expect(page.textContent).toContain('Patellofemoral pain')
    expect(page.textContent).toContain('6 / 10')
    expect(buttons(page)).toContain('Update assessment')
    expect(buttons(page)).toContain('Write plan')
    expect(buttons(page)).toContain('Discharge')
    expect(buttons(page)).toContain('History (2)')
  })

  it('lets a receptionist read but not edit or discharge (US-12.3, US-24.4)', async () => {
    const page = await render(['clinical.view'])
    expect(page.textContent).toContain('Patellofemoral pain')
    expect(buttons(page)).not.toContain('Update assessment')
    expect(buttons(page)).not.toContain('Write plan')
    expect(buttons(page)).not.toContain('Discharge')
    // Reading earlier versions is still allowed.
    expect(buttons(page)).toContain('History (2)')
  })

  it('makes a discharged episode read-only even for a physiotherapist', async () => {
    const page = await render(['clinical.view', 'clinical.edit', 'episode.manage'])
    const picker = page.querySelector<HTMLSelectElement>('#episode-picker')!
    expect([...picker.options].map((o) => o.textContent)).toEqual([
      'Episode 2 · 10 Oct 2026 · Active',
      'Episode 1 · 10 Oct 2026 · Discharged',
    ])
    await act(async () => {
      picker.value = 'e1'
      picker.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(page.textContent).toContain('Past episode')
    expect(page.textContent).toContain('Goals met')
    expect(page.textContent).toContain('Discharged episodes are read-only.')
    expect(buttons(page)).not.toContain('Update assessment')
    expect(buttons(page)).not.toContain('Discharge')
  })

  it('offers to start a new episode to someone allowed to, after a discharge (US-25.1)', async () => {
    const page = await render(['clinical.view', 'episode.manage'], {
      ...patient,
      activeEpisodeId: null,
      status: 'inactive',
    })
    expect(page.textContent).toContain('No active treatment')
    expect(buttons(page)).toContain('Start episode')
  })

  it('asks for a physiotherapist when the user cannot start an episode', async () => {
    const page = await render(['clinical.view'], { ...patient, activeEpisodeId: null })
    expect(buttons(page)).not.toContain('Start episode')
    expect(page.textContent).toContain('Ask a physiotherapist')
  })
})
