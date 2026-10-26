import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage, isApiError } from '@/api'
import { useCan, useUser } from '@/auth/hooks'
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
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { formatINR, isValidAmount } from '@/lib/money'
import { invalidatePatientData, queryKeys } from '@/lib/queryKeys'
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

  const patientQuery = useQuery({ queryKey: queryKeys.patient(patientId), queryFn: () => api.patients.get(patientId) })
  const feeQuery = useQuery({ queryKey: queryKeys.defaultFee, queryFn: () => api.clinic.defaultFee() })
  const therapistsQuery = useQuery({ queryKey: queryKeys.therapists, queryFn: () => api.clinic.therapists() })

  const [therapistId, setTherapistId] = useState(user.role === 'physiotherapist' ? user.id : '')
  const [overrideOn, setOverrideOn] = useState(false)
  const [feeText, setFeeText] = useState('')
  const [reason, setReason] = useState('')
  const [confirmSecond, setConfirmSecond] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [reasonError, setReasonError] = useState<string | null>(null)
  const idempotencyKey = useRef(crypto.randomUUID())

  const startEpisode = useMutation({
    mutationFn: () => api.episodes.start(patientId),
    onSuccess: () => invalidatePatientData(queryClient, patientId),
    onError: (error) => setFormError(errorMessage(error, t.common.genericError)),
  })

  const attend = useMutation({
    mutationFn: () =>
      api.visits.create(
        {
          patientId,
          therapistId: therapistId || undefined,
          feeOverride: overrideOn ? { amount: feeText.trim(), reason } : undefined,
          confirmSecondVisitToday: confirmSecond || undefined,
        },
        idempotencyKey.current,
      ),
    onSuccess: async (result) => {
      toast.success(t.attendance.done(result.sessionNumber, result.planProgress.planned))
      if (result.planProgress.planExceeded) toast.info(t.attendance.planExceeded)
      await invalidatePatientData(queryClient, patientId)
      onClose()
    },
    onError: (error) => {
      // A network failure may or may not have saved: keep the key so a retry cannot double-charge.
      if (!isApiError(error, 'NETWORK')) idempotencyKey.current = crypto.randomUUID()
      if (isApiError(error, 'DUPLICATE_VISIT_TODAY')) {
        setConfirmSecond(true)
        return
      }
      if (isApiError(error, 'NO_ACTIVE_EPISODE')) void invalidatePatientData(queryClient, patientId)
      if (isApiError(error, 'FEE_REASON_REQUIRED')) setReasonError(t.attendance.reasonRequired)
      setFormError(errorMessage(error, t.common.genericError))
    },
  })

  const patient = patientQuery.data
  const hasEpisode = !!patient?.activeEpisodeId
  const feeValid = !overrideOn || isValidAmount(feeText)
  const reasonValid = !overrideOn || reason.trim().length > 0
  const canSubmit = !!patient && hasEpisode && online && feeValid && reasonValid && !attend.isPending

  function submit() {
    setFormError(null)
    setReasonError(null)
    if (overrideOn && !reasonValid) {
      setReasonError(t.attendance.reasonRequired)
      return
    }
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
      {patientQuery.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t.patient.notFound}</AlertDescription>
        </Alert>
      )}

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
            {canStartEpisode ? (
              <Button
                size="lg"
                className="mt-2"
                disabled={startEpisode.isPending || !online}
                onClick={() => startEpisode.mutate()}
              >
                {startEpisode.isPending ? t.episode.starting : t.episode.start}
              </Button>
            ) : (
              t.episode.askTherapist
            )}
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
            <span className="font-medium">{feeQuery.data ? formatINR(feeQuery.data) : '…'}</span>
          </div>

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
                  <Field id="att-reason" label={t.attendance.overrideReason} error={reasonError ?? undefined}>
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

          {confirmSecond && (
            <Alert>
              <AlertTitle>{t.attendance.duplicateTitle}</AlertTitle>
              <AlertDescription>{t.attendance.duplicateBody}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      {!online && <p className="text-sm text-amber-700 dark:text-amber-400">{t.offline.blocked}</p>}

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
