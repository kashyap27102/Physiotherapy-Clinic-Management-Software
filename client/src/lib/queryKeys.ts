import type { QueryClient } from '@tanstack/react-query'

export const queryKeys = {
  patient: (id: string) => ['patient', id] as const,
  patientEpisodes: (id: string) => ['patient', id, 'episodes'] as const,
  patientVisits: (id: string) => ['patient', id, 'visits'] as const,
  patientLedger: (id: string) => ['patient', id, 'ledger'] as const,
  patientSearch: (q: string) => ['patients', 'search', q] as const,
  todayVisits: ['visits', 'today'] as const,
  defaultFee: ['clinic', 'fee'] as const,
  therapists: ['clinic', 'therapists'] as const,
}

/** Refresh everything a visit, payment or episode change can affect. */
export function invalidatePatientData(queryClient: QueryClient, patientId: string): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.patient(patientId) }),
    queryClient.invalidateQueries({ queryKey: ['patients'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.todayVisits }),
  ])
}
