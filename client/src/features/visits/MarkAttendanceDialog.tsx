import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, ApiError, errorMessage, isApiError } from '@/api'
import { useCan, useUser } from '@/auth/hooks'
import { FormAlert } from '@/components/auth/FormAlert'
import { Field, inputClassName, selectClassName } from '@/components/common/Field'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { StartEpisodeButton } from '@/features/clinical/StartEpisodeButton'
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { dayKey } from '@/lib/date'
import { formatINR, isValidAmount } from '@/lib/money'
import { invalidatePatientData, queryKeys } from '@/lib/queryKeys'
import { OfflineNotice } from '@/components/common/OfflineNotice'
import { t } from '@/strings/en'

interface Props {
  patientId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MarkAttendanceDialog({ patientId, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so each opening starts with a clean form and a fresh idempotency key. */}
        {open && <AttendanceForm patientId={patientId} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function AttendanceForm({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const user = useUser()
  const online = useOnlineStatus()
  const canOverrideFee = useCan('fee.override')
  const canStartEpisode = useCan('episode.manage')
  const canBackdate = useCan('visit.backdate')

  const patientQuery = useQuery({ queryKey: queryKeys.patient(patientId), queryFn: () => api.patients.get(patientId) })
  const feeQuery = useQuery({ queryKey: queryKeys.defaultFee, queryFn: () => api.clinic.defaultFee() })
  const therapistsQuery = useQuery({ queryKey: queryKeys.therapists, queryFn: () => api.clinic.therapists() })

  const [therapistId, setTherapistId] = useState(user.role === 'physiotherapist' ? user.id : '')
  const [overrideOn, setOverrideOn] = useState(false)
  const [feeText, setFeeText] = useState('')
  const [reason, setReason] = useState('')
  const [confirmSecond, setConfirmSecond] = useState(false)
  const [earlierDay, setEarlierDay] = useState(false)
  const [visitDate, setVisitDate] = useState('')
  const [backdateReason, setBackdateReason] = useState('')
  const [backdateError, setBackdateError] = useState<string | null>(null)
  const [dateServerError, setDateServerError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [reasonError, setReasonError] = useState<string | null>(null)
  const idempotencyKey = useIdempotencyKey()

  const attend = useMutation({
    mutationFn: () =>
      api.visits.create(
        {
          patientId,
          therapistId: therapistId || undefined,
          feeOverride: overrideOn ? { amount: feeText.trim(), reason } : undefined,
          confirmSecondVisitToday: confirmSecond || undefined,
          visitDate: earlierDay ? visitDate : undefined,
          backdateReason: earlierDay ? backdateReason.trim() : undefined,
        },
        idempotencyKey.current(),
      ),
    onSuccess: async (result) => {
      toast.success(t.attendance.done(result.sessionNumber, result.planProgress.planned))
      if (result.planProgress.planExceeded) toast.info(t.attendance.planExceeded)
      await invalidatePatientData(queryClient, patientId)
      onClose()
    },
    onError: (error) => {
      // A network failure may or may not have saved: keep the key so a retry cannot double-charge.
      idempotencyKey.afterError(error)
      if (isApiError(error, 'DUPLICATE_VISIT_TODAY')) {
        setConfirmSecond(true)
        return
      }
      if (isApiError(error, 'NO_ACTIVE_EPISODE')) void invalidatePatientData(queryClient, patientId)
      if (isApiError(error, 'FEE_REASON_REQUIRED')) setReasonError(t.attendance.reasonRequired)
      // Show the server's own words next to the field it refused (for example "before this episode started").
      const fieldMessage = (name: string) =>
        error instanceof ApiError ? error.fields.find((f) => f.field === name)?.message : undefined
      setDateServerError(fieldMessage('visitDate') ?? null)
      setBackdateError(fieldMessage('backdateReason') ?? null)
      const shown = error instanceof ApiError ? error.fields.map((f) => f.message).join(' ') : ''
      setFormError(shown || errorMessage(error, t.common.genericError))
    },
  })

  const patient = patientQuery.data
  const hasEpisode = !!patient?.activeEpisodeId
  const feeValid = !overrideOn || isValidAmount(feeText)
  const reasonValid = !overrideOn || reason.trim().length > 0
  const dateValid = !earlierDay || (visitDate !== '' && visitDate <= dayKey(new Date()))
  const backdateValid = !earlierDay || backdateReason.trim().length > 0
  const canSubmit =
    !!patient && hasEpisode && online && feeValid && reasonValid && dateValid && backdateValid && !attend.isPending

  function submit() {
    setFormError(null)
    setReasonError(null)
    setBackdateError(null)
    setDateServerError(null)
    attend.mutate()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.attendance.title}</DialogTitle>
        <DialogDescription>
          {patient ? `${patient.fullName} · ${patient.phone}` : t.attendance.description}
        </DialogDescription>
      </DialogHeader>

      {patientQuery.isLoading && <p className="text-sm text-muted-foreground">{t.common.loading}</p>}
      {patientQuery.isError && <FormAlert>{t.patient.notFound}</FormAlert>}

      {patient && patient.balance?.state === 'due' && (
        <Alert variant="destructive">
          <AlertTitle>{t.balance.dueTitle}</AlertTitle>
          <AlertDescription>{t.balance.duesWarning(formatINR(patient.balance.amount))}</AlertDescription>
        </Alert>
      )}

      {patient && !hasEpisode && (
        <Alert>
          <AlertTitle>{t.patient.noActiveEpisode}</AlertTitle>
          <AlertDescription>
            {canStartEpisode ? <StartEpisodeButton patientId={patientId} className="mt-2" /> : t.episode.askTherapist}
          </AlertDescription>
        </Alert>
      )}

      {patient && hasEpisode && (
        <div className="space-y-4">
          <Field id="att-therapist" label={t.attendance.therapist} optional>
            <select
              id="att-therapist"
              className={selectClassName}
              value={therapistId}
              onChange={(event) => setTherapistId(event.target.value)}
            >
              <option value="">{t.attendance.therapistNone}</option>
              {therapistsQuery.data?.map((th) => (
                <option key={th.id} value={th.id}>
                  {th.fullName}
                </option>
              ))}
            </select>
          </Field>

          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t.attendance.defaultFee}: </span>
            <span className="font-medium">{feeQuery.data ? formatINR(feeQuery.data.defaultFee) : '…'}</span>
          </div>

          {feeQuery.data && !feeQuery.data.isSet && (
            <Alert>
              <AlertDescription>{t.attendance.feeNotSet}</AlertDescription>
            </Alert>
          )}

          {canOverrideFee && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={overrideOn}
                  onChange={(event) => setOverrideOn(event.target.checked)}
                />
                {t.attendance.overrideFee}
              </label>
              {overrideOn && (
                <>
                  <Field
                    id="att-fee"
                    label={t.attendance.fee}
                    error={feeText && !feeValid ? t.payment.amountError : undefined}
                  >
                    <Input
                      id="att-fee"
                      className={inputClassName}
                      inputMode="decimal"
                      value={feeText}
                      onChange={(event) => setFeeText(event.target.value)}
                    />
                  </Field>
                  <Field
                    id="att-reason"
                    label={t.attendance.overrideReason}
                    error={reasonError ?? (feeText && !reasonValid ? t.attendance.reasonRequired : undefined)}
                  >
                    <Input
                      id="att-reason"
                      className={inputClassName}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </Field>
                </>
              )}
            </div>
          )}

          {canBackdate && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={earlierDay}
                  onChange={(event) => {
                    setEarlierDay(event.target.checked)
                    setConfirmSecond(false)
                  }}
                />
                {t.attendance.earlierDay}
              </label>
              {earlierDay && (
                <>
                  <Field
                    id="att-date"
                    label={t.attendance.visitDate}
                    error={dateServerError ?? (visitDate && !dateValid ? t.attendance.dateError : undefined)}
                  >
                    <Input
                      id="att-date"
                      type="date"
                      className={inputClassName}
                      max={dayKey(new Date())}
                      value={visitDate}
                      onChange={(event) => {
                        setVisitDate(event.target.value)
                        setDateServerError(null)
                        setConfirmSecond(false)
                      }}
                    />
                  </Field>
                  <Field
                    id="att-backdate-reason"
                    label={t.attendance.backdateReason}
                    error={backdateError ?? undefined}
                  >
                    <Input
                      id="att-backdate-reason"
                      className={inputClassName}
                      maxLength={500}
                      placeholder={t.attendance.backdateReasonPlaceholder}
                      value={backdateReason}
                      onChange={(event) => setBackdateReason(event.target.value)}
                    />
                  </Field>
                </>
              )}
            </div>
          )}

          {confirmSecond && (
            <Alert>
              <AlertTitle>{t.attendance.duplicateTitle}</AlertTitle>
              <AlertDescription>{t.attendance.duplicateBody}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {formError && <FormAlert>{formError}</FormAlert>}
      <OfflineNotice />

      <DialogFooter>
        <Button variant="outline" size="lg" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button size="lg" disabled={!canSubmit} onClick={submit}>
          {attend.isPending ? t.attendance.submitting : confirmSecond ? t.attendance.markAgain : t.attendance.submit}
        </Button>
      </DialogFooter>
    </>
  )
}
