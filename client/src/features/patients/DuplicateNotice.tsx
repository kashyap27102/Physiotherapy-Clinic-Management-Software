import { TriangleAlert } from 'lucide-react'
import type { PatientListItem } from '@/api'
import { PatientRow } from '@/features/patients/PatientRow'
import { t } from '@/strings/en'

/**
 * "This may be someone already registered" (BR-PAT-2, US-08.3, US-11a.2): the candidates the server found, each one
 * opens in place. The caller supplies the buttons, because registering and editing confirm differently.
 */
export function DuplicateNotice({ candidates, onOpen }: { candidates: PatientListItem[]; onOpen?: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2.5 rounded-xl border border-chart-3/30 bg-[color-mix(in_oklch,var(--chart-3),transparent_88%)] px-3.5 py-3 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-chart-3" aria-hidden />
        <div>
          <div className="font-medium">{t.register.duplicateFound(candidates.length)}</div>
          <p className="mt-0.5 text-muted-foreground">{t.register.duplicateReason}</p>
        </div>
      </div>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {candidates.map((patient) => (
          <li key={patient.id}>
            <PatientRow patient={patient} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </div>
  )
}
