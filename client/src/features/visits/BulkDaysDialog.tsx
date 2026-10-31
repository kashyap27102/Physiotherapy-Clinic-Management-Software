import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/api'
import { FormAlert } from '@/components/auth/FormAlert'
import { Field, inputClassName, selectClassName } from '@/components/common/Field'
import { OfflineNotice } from '@/components/common/OfflineNotice'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { eachDay } from '@/lib/calendar'
import { dayKey, formatDate } from '@/lib/date'
import { formatINR, fromPaise, toPaise } from '@/lib/money'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'
import { BULK_LIMIT } from './bulkLimits'
import { DayPicker } from './DayPicker'
import { useBulkMarking } from './useBulkMarking'

interface Props {
  patientId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * VIS-001, many days for one patient: pick every day they attended and save them together, for the owner catching up
 * after forgotten attendance. Needs `visit.bulk`, and `visit.backdate` for earlier days; the server checks both.
 */
export function BulkDaysDialog({ open, onOpenChange, patientId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        {/* Mounted only while open, so each opening starts clean with a fresh idempotency key. */}
        {open && <DaysForm patientId={patientId} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function DaysForm({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const online = useOnlineStatus()
  const [today] = useState(() => dayKey(new Date()))

  const patientQuery = useQuery({ queryKey: queryKeys.patient(patientId), queryFn: () => api.patients.get(patientId) })
  const episodesQuery = useQuery({
    queryKey: queryKeys.patientEpisodes(patientId),
    queryFn: () => api.episodes.list(patientId),
  })
  const visitsQuery = useQuery({
    queryKey: queryKeys.patientVisits(patientId),
    queryFn: () => api.visits.forPatient(patientId),
  })
  const feeQuery = useQuery({ queryKey: queryKeys.defaultFee, queryFn: () => api.clinic.defaultFee() })
  const therapistsQuery = useQuery({ queryKey: queryKeys.therapists, queryFn: () => api.clinic.therapists() })

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [therapistId, setTherapistId] = useState('')
  const [reason, setReason] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(today)
  const [skipSundays, setSkipSundays] = useState(false)
  const bulk = useBulkMarking(onClose)

  const patient = patientQuery.data
  const episode = episodesQuery.data?.find((e) => e.status === 'active')
  const min = episode ? dayKey(episode.startedAt) : today
  const taken = new Set((visitsQuery.data ?? []).filter((v) => !v.reversed).map((v) => dayKey(v.visitedAt)))

  const days = [...selected].sort()
  const needReason = days.some((day) => day !== today)
  const feePaise = toPaise(feeQuery.data?.defaultFee ?? '') ?? 0
  const ready = !!patient && !!episode && !patientQuery.isError
  const canSubmit =
    ready && online && days.length > 0 && (!needReason || reason.trim() !== '') && !bulk.mutation.isPending

  const change = (next: Iterable<string>) => {
    setSelected(new Set([...next].slice(0, BULK_LIMIT)))
    bulk.clearFeedback()
  }
  const toggle = (day: string) => {
    const next = new Set(selected)
    if (next.has(day)) next.delete(day)
    else next.add(day)
    change(next)
  }
  const addRange = () => {
    const inRange = eachDay(from || min, to || today, { skipSundays }).filter(
      (d) => d >= min && d <= today && !taken.has(d),
    )
    change([...selected, ...inRange])
  }

  const input = () => ({
    entries: days.map((date) => ({ patientId, date })),
    ...(therapistId ? { therapistId } : {}),
    ...(needReason ? { reason: reason.trim() } : {}),
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.bulk.manyDaysTitle}</DialogTitle>
        <DialogDescription>
          {patient ? `${patient.fullName} · ${patient.phone}` : t.bulk.manyDaysBody}
        </DialogDescription>
      </DialogHeader>

      {(patientQuery.isLoading || episodesQuery.isLoading) && (
        <p className="text-sm text-muted-foreground">{t.common.loading}</p>
      )}
      {patientQuery.isError && <FormAlert>{t.bulk.loadError}</FormAlert>}
      {patient && episodesQuery.isSuccess && !episode && (
        <Alert>
          <AlertDescription>{t.bulk.noEpisode}</AlertDescription>
        </Alert>
      )}

      {ready && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t.bulk.manyDaysBody}</p>

          <DayPicker min={min} max={today} selected={selected} taken={taken} onToggle={toggle} />

          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">{t.bulk.rangeTitle}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="bulk-from" label={t.bulk.rangeFrom}>
                <Input
                  id="bulk-from"
                  type="date"
                  className={inputClassName}
                  min={min}
                  max={to || today}
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </Field>
              <Field id="bulk-to" label={t.bulk.rangeTo}>
                <Input
                  id="bulk-to"
                  type="date"
                  className={inputClassName}
                  min={from || min}
                  max={today}
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={skipSundays}
                  onChange={(event) => setSkipSundays(event.target.checked)}
                />
                {t.bulk.skipSundays}
              </label>
              <Button type="button" variant="outline" className="h-10" onClick={addRange}>
                {t.bulk.addRange}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{days.length === 0 ? t.bulk.daysNone : t.bulk.chosen(days.length)}</span>
            {days.length > 0 && (
              <Button type="button" variant="ghost" className="h-9" onClick={() => change([])}>
                {t.bulk.clearDays}
              </Button>
            )}
          </div>
          {days.length > 0 && (
            <p className="-mt-2 text-xs text-muted-foreground">{days.map((d) => formatDate(d)).join(' · ')}</p>
          )}
          {days.length >= BULK_LIMIT && <p className="text-xs text-muted-foreground">{t.bulk.limit(BULK_LIMIT)}</p>}

          <Field id="bulk-therapist" label={t.bulk.therapist} optional>
            <select
              id="bulk-therapist"
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
            <Field id="bulk-reason" label={t.bulk.reason}>
              <Input
                id="bulk-reason"
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

          {days.length > 0 && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="font-medium">
                {t.bulk.summary(days.length, formatINR(fromPaise(feePaise * days.length)))}
              </div>
              <div className="text-xs text-muted-foreground">
                {feeQuery.data?.isSet === false ? t.bulk.noFee : t.bulk.summaryNote}
              </div>
            </div>
          )}
        </div>
      )}

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
              : t.bulk.submit(days.length)}
        </Button>
      </DialogFooter>
    </>
  )
}
