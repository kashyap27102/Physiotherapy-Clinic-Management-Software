import { useQuery } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/api'
import { Avatar } from '@/components/common/Avatar'
import { BalanceBadge } from '@/components/common/Balance'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatPhone } from '@/lib/phone'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

/** The server searches a name from 2 letters and a phone number from 4 digits. */
const isPhoneText = (text: string) => /^[\d\s+().-]+$/.test(text)
const searchable = (text: string) => (isPhoneText(text) ? text.replace(/\D/g, '').length >= 4 : text.length >= 2)

interface PatientPickDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  onPick: (patientId: string) => void
}

/**
 * The first step of a dashboard quick action: find the patient, then the attendance or payment dialog opens for them.
 * Uses the ordinary patient search, which is not itself recorded; the profile is never opened, so nothing is audited
 * until the action is saved.
 */
export function PatientPickDialog({ open, onOpenChange, title, onPick }: PatientPickDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Remounted on every open, so the search starts empty each time. */}
        {open && <PickBody title={title} onPick={onPick} />}
      </DialogContent>
    </Dialog>
  )
}

function PickBody({ title, onPick }: Pick<PatientPickDialogProps, 'title' | 'onPick'>) {
  const [text, setText] = useState('')
  const typed = text.trim()
  const q = useDebouncedValue(typed, 250)
  const ready = q === typed && searchable(q)
  const results = useQuery({
    queryKey: queryKeys.patientSearch({ q, pageSize: 6, for: 'quick-action' }),
    queryFn: ({ signal }) => api.patients.search({ q, pageSize: 6 }, signal),
    enabled: ready,
  })
  const items = results.data?.items ?? []

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{t.dashboard.quick.pickHint}</DialogDescription>
      </DialogHeader>

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          autoFocus
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label={t.dashboard.quick.searchLabel}
          placeholder={t.dashboard.quick.searchPlaceholder}
          className="h-12 w-full rounded-xl border border-input bg-card pr-10 pl-10 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/25 [&::-webkit-search-cancel-button]:hidden"
        />
        {results.isFetching && (
          <Loader2
            className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
      </div>

      <div className="min-h-24" aria-live="polite">
        {typed === '' ? null : !searchable(typed) ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">{t.dashboard.quick.searchTooShort}</p>
        ) : !ready || results.isPending ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">{t.common.loading}</p>
        ) : results.isError ? (
          <p className="px-1 py-3 text-sm text-destructive">{t.dashboard.quick.loadError}</p>
        ) : items.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">{t.dashboard.quick.none}</p>
        ) : (
          <ul className="-mx-2 divide-y">
            {items.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  onClick={() => onPick(patient.id)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted/60 active:bg-muted"
                >
                  <Avatar name={patient.fullName} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{patient.fullName}</span>
                    <span className="block text-sm text-muted-foreground tabular-nums">
                      {formatPhone(patient.phone)}
                    </span>
                  </span>
                  <BalanceBadge balance={patient.balance} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
