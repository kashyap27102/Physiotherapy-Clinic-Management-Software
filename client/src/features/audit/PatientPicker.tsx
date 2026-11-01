import { useQuery } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/api'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatPhone } from '@/lib/phone'
import { queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

/** The server searches a name from 2 letters and a phone number from 4 digits. */
const isPhoneText = (text: string) => /^[\d\s+().-]+$/.test(text)
const searchable = (text: string) => (isPhoneText(text) ? text.replace(/\D/g, '').length >= 4 : text.length >= 2)

interface PatientPickerProps {
  onPick: (patient: { id: string; fullName: string }) => void
  className?: string
}

/**
 * Finds a patient to filter the audit log by. Uses the ordinary patient search, which is not itself recorded,
 * and only a handful of results; opening the log for a patient never opens (and so never records) their profile.
 */
export function PatientPicker({ onPick, className }: PatientPickerProps) {
  const [text, setText] = useState('')
  const typed = text.trim()
  const q = useDebouncedValue(typed, 250)
  const ready = q === typed && searchable(q)
  const results = useQuery({
    queryKey: queryKeys.patientSearch({ q, pageSize: 5, for: 'audit' }),
    queryFn: ({ signal }) => api.patients.search({ q, pageSize: 5 }, signal),
    enabled: ready,
  })
  const items = results.data?.items ?? []

  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        autoComplete="off"
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label={t.audit.filters.patientSearch}
        placeholder={t.audit.filters.patientSearch}
        className="h-9 w-64 rounded-lg border border-input bg-card pr-8 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {results.isFetching && (
        <Loader2
          className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      )}
      {typed !== '' && (
        <div className="absolute top-10 left-0 z-20 w-72 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
          {!searchable(typed) ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">{t.audit.filters.patientSearchHint}</p>
          ) : !ready || results.isPending ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">{t.common.loading}</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">{t.audit.filters.patientNone}</p>
          ) : (
            <ul>
              {items.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick({ id: patient.id, fullName: patient.fullName })
                      setText('')
                    }}
                    className="flex w-full flex-col px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
                  >
                    <span className="truncate font-medium">{patient.fullName}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatPhone(patient.phone)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
