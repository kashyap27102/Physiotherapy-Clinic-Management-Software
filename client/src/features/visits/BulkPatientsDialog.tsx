import { useQuery } from '@tanstack/react-query'
import { Loader2, Search, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage, type PatientListItem } from '@/api'
import { useBranchScope } from '@/branchScope/context'
import { Field, inputClassName, selectClassName } from '@/components/common/Field'
import { OfflineNotice } from '@/components/common/OfflineNotice'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { dayKey } from '@/lib/date'
import { formatINR, fromPaise, toPaise } from '@/lib/money'
import { queryKeys } from '@/lib/queryKeys'
import { formatPhone } from '@/lib/phone'
import { t } from '@/strings/en'
import { BULK_LIMIT } from './bulkLimits'
import { useBulkMarking } from './useBulkMarking'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Digits and phone punctuation only: a phone fragment, which needs four digits before the server will search. */
const isPhoneText = (text: string) => /^[\d\s+().-]+$/.test(text)
const searchable = (text: string) => (isPhoneText(text) ? text.replace(/\D/g, '').length >= 4 : text.length >= 2)

/**
 * VIS-001, many patients for one day: choose a day (today or an earlier one) and the patients who attended, then save
 * them together. For the owner, who needs `visit.bulk` (and `visit.backdate` for an earlier day).
 */
export function BulkPatientsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        {/* Mounted only while open, so each opening starts clean with a fresh idempotency key. */}
        {open && <PatientsForm onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

type Chosen = Pick<PatientListItem, 'id' | 'fullName' | 'phone'>

function PatientsForm({ onClose }: { onClose: () => void }) {
  const online = useOnlineStatus()
  const { branchId } = useBranchScope()
  const [today] = useState(() => dayKey(new Date()))

  const feeQuery = useQuery({ queryKey: queryKeys.defaultFee, queryFn: () => api.clinic.defaultFee() })
  const therapistsQuery = useQuery({ queryKey: queryKeys.therapists, queryFn: () => api.clinic.therapists() })

  const [date, setDate] = useState(today)
  const [chosen, setChosen] = useState<ReadonlyMap<string, Chosen>>(new Map())
  const [text, setText] = useState('')
  const [therapistId, setTherapistId] = useState('')
  const [reason, setReason] = useState('')
  const [loadingAll, setLoadingAll] = useState(false)
  const bulk = useBulkMarking(onClose)

  const q = useDebouncedValue(text.trim(), 250)
  const results = useQuery({
    queryKey: queryKeys.patientSearch({ bulk: true, q, branchId }),
    queryFn: ({ signal }) =>
      api.patients.search({ q, status: 'active', pageSize: 8, ...(branchId ? { branchId } : {}) }, signal),
    enabled: q === text.trim() && searchable(q),
  })

  const needReason = date !== today
  const count = chosen.size
  const feePaise = toPaise(feeQuery.data?.defaultFee ?? '') ?? 0
  const canSubmit =
    online &&
    date !== '' &&
    date <= today &&
    count > 0 &&
    (!needReason || reason.trim() !== '') &&
    !bulk.mutation.isPending

  const change = (next: Map<string, Chosen>) => {
    setChosen(new Map([...next].slice(0, BULK_LIMIT)))
    bulk.clearFeedback()
  }
  const toggle = (patient: Chosen) => {
    const next = new Map(chosen)
    if (next.has(patient.id)) next.delete(patient.id)
    else next.set(patient.id, { id: patient.id, fullName: patient.fullName, phone: patient.phone })
    change(next)
  }

  async function addAllActive() {
    setLoadingAll(true)
    try {
      const page = await api.patients.search({
        q: '',
        status: 'active',
        pageSize: BULK_LIMIT,
        ...(branchId ? { branchId } : {}),
      })
      const next = new Map(chosen)
      for (const p of page.items) next.set(p.id, { id: p.id, fullName: p.fullName, phone: p.phone })
      change(next)
      toast.info(t.bulk.addAllDone(Math.min(page.items.length, BULK_LIMIT)))
    } catch (error) {
      toast.error(errorMessage(error, t.common.genericError))
    } finally {
      setLoadingAll(false)
    }
  }

  const input = () => ({
    entries: [...chosen.keys()].map((patientId) => ({ patientId, date })),
    ...(therapistId ? { therapistId } : {}),
    ...(needReason ? { reason: reason.trim() } : {}),
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.bulk.manyPatientsTitle}</DialogTitle>
        <DialogDescription>{t.bulk.manyPatientsBody}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <Field id="bulk-date" label={t.bulk.day}>
          <Input
            id="bulk-date"
            type="date"
            className={inputClassName}
            max={today}
            value={date}
            onChange={(event) => {
              setDate(event.target.value)
              bulk.clearFeedback()
            }}
          />
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{t.bulk.patients}</span>
            <Button type="button" variant="outline" className="h-9" disabled={loadingAll} onClick={addAllActive}>
              {loadingAll && <Loader2 className="animate-spin" aria-hidden />}
              {t.bulk.addAllActive}
            </Button>
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              autoComplete="off"
              aria-label={t.bulk.searchPatients}
              placeholder={t.bulk.searchPatients}
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 md:text-sm"
            />
          </div>
          {text.trim() !== '' && !searchable(text.trim()) && (
            <p className="text-xs text-muted-foreground">{t.bulk.searchHint}</p>
          )}
          {results.data && searchable(q) && (
            <ul className="divide-y rounded-lg border">
              {results.data.items.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">{t.bulk.noSearchResults}</li>
              )}
              {results.data.items.map((patient) => (
                <li key={patient.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0 text-sm">
                    <div className="truncate font-medium">{patient.fullName}</div>
                    <div className="text-xs text-muted-foreground">{formatPhone(patient.phone)}</div>
                  </div>
                  <Button
                    type="button"
                    variant={chosen.has(patient.id) ? 'secondary' : 'outline'}
                    className="h-9"
                    onClick={() => toggle(patient)}
                  >
                    {chosen.has(patient.id) ? t.bulk.added : t.bulk.add}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="text-sm font-medium">{count === 0 ? t.bulk.noPatients : t.bulk.patientCount(count)}</div>
          {count > 0 && (
            <ul className="flex flex-wrap gap-2">
              {[...chosen.values()].map((patient) => (
                <li
                  key={patient.id}
                  className="flex items-center gap-1 rounded-full border bg-muted/40 py-1 pr-1 pl-3 text-sm"
                >
                  <span className="max-w-40 truncate">{patient.fullName}</span>
                  <button
                    type="button"
                    aria-label={`${t.bulk.remove} ${patient.fullName}`}
                    className="flex size-6 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                    onClick={() => toggle(patient)}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {count >= BULK_LIMIT && <p className="text-xs text-muted-foreground">{t.bulk.limit(BULK_LIMIT)}</p>}
        </div>

        <Field id="bulk-p-therapist" label={t.bulk.therapist} optional>
          <select
            id="bulk-p-therapist"
            className={selectClassName}
            value={therapistId}
            onChange={(event) => setTherapistId(event.target.value)}
          >
            <option value="">{t.bulk.therapistNone}</option>
            {therapistsQuery.data?.map((th) => (
              <option key={th.id} value={th.id}>
                {th.fullName}
              </option>
            ))}
          </select>
        </Field>

        {needReason && (
          <Field id="bulk-p-reason" label={t.bulk.reason}>
            <Input
              id="bulk-p-reason"
              className={inputClassName}
              maxLength={500}
              placeholder={t.bulk.reasonPlaceholder}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
                bulk.clearFeedback()
              }}
            />
          </Field>
        )}

        {count > 0 && (
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <div className="font-medium">{t.bulk.summary(count, formatINR(fromPaise(feePaise * count)))}</div>
            <div className="text-xs text-muted-foreground">
              {feeQuery.data?.isSet === false ? t.bulk.noFee : t.bulk.summaryNote}
            </div>
          </div>
        )}
      </div>

      {bulk.feedback}
      <OfflineNotice />

      <DialogFooter>
        <Button variant="outline" size="lg" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button size="lg" disabled={!canSubmit} onClick={() => bulk.submit(input(), bulk.needsConfirmation)}>
          {bulk.mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {bulk.mutation.isPending
            ? t.bulk.submitting
            : bulk.needsConfirmation
              ? t.bulk.submitAnyway
              : t.bulk.submit(count)}
        </Button>
      </DialogFooter>
    </>
  )
}
