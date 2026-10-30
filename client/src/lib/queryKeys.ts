import type { QueryClient } from '@tanstack/react-query'

export const queryKeys = {
  patient: (id: string) => ['patient', id] as const,
  patientEpisodes: (id: string) => ['patient', id, 'episodes'] as const,
  episode: (id: string) => ['episode', id] as const,
  episodeAssessments: (id: string) => ['episode', id, 'assessments'] as const,
  episodePlans: (id: string) => ['episode', id, 'plans'] as const,
  patientVisits: (id: string) => ['patient', id, 'visits'] as const,
  patientLedger: (id: string) => ['patient', id, 'ledger'] as const,
  patientSearch: (input: object) => ['patients', 'search', input] as const,
  todayVisits: ['visits', 'today'] as const,
  defaultFee: ['clinic', 'fee'] as const,
  therapists: ['clinic', 'therapists'] as const,
  trustedDevices: ['auth', 'devices'] as const,
  clinic: ['clinic', 'profile'] as const,
  branches: ['branches'] as const,
  staff: (filter: object = {}) => ['staff', filter] as const,
  roles: ['roles'] as const,
}

/** Refresh everything a visit, payment or episode change can affect. */
export function invalidatePatientData(queryClient: QueryClient, patientId: string): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.patient(patientId) }),
    queryClient.invalidateQueries({ queryKey: ['patients'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.todayVisits }),
  ])
}
