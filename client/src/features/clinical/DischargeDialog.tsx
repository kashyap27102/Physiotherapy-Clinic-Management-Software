import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage, isApiError, type Balance } from '@/api'
import { FormAlert } from '@/components/auth/FormAlert'
import { Field, textareaClassName } from '@/components/common/Field'
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
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { formatINR } from '@/lib/money'
import { invalidatePatientData, queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

interface Props {
  patientId: string
  episodeId: string
  /** The balance known before discharging; null when the viewer cannot see balances. */
  balance: Balance | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** CLN-004 / US-24: close the episode with an optional note. Dues are shown but never block it (BR-CLN-7). */
export function DischargeDialog({ patientId, episodeId, balance, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <DischargeForm
            patientId={patientId}
            episodeId={episodeId}
            balance={balance}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function MoneyNotice({ balance }: { balance: Balance | null }) {
  if (balance?.state === 'due') {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t.episode.dischargeDues(formatINR(balance.amount))}</AlertDescription>
      </Alert>
    )
  }
  if (balance?.state === 'credit') {
    return (
      <Alert>
        <AlertDescription>{t.episode.dischargeCredit(formatINR(balance.amount))}</AlertDescription>
      </Alert>
    )
  }
  return null
}

function DischargeForm({
  patientId,
  episodeId,
  balance,
  onClose,
}: Omit<Props, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const discharge = useMutation({
    mutationFn: () => api.episodes.discharge(episodeId, note.trim() || undefined),
    onSuccess: async (result) => {
      toast.success(t.episode.dischargedToast)
      // US-24.3: an advance still held is worth a reminder after the dialog closes.
      if (result.balance?.state === 'credit') toast.info(t.episode.dischargeCredit(formatINR(result.balance.amount)))
      await Promise.all([
        invalidatePatientData(queryClient, patientId),
        queryClient.invalidateQueries({ queryKey: queryKeys.episode(episodeId) }),
      ])
      onClose()
    },
    onError: async (failure) => {
      // Someone else discharged it a moment ago: refresh so the screen shows the real state.
      if (isApiError(failure, 'NO_ACTIVE_EPISODE')) {
        await invalidatePatientData(queryClient, patientId)
        await queryClient.invalidateQueries({ queryKey: queryKeys.episode(episodeId) })
      }
      setError(errorMessage(failure, t.common.genericError))
    },
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.episode.dischargeTitle}</DialogTitle>
        <DialogDescription>{t.episode.dischargeBody}</DialogDescription>
      </DialogHeader>

      <MoneyNotice balance={balance} />

      <Field id="discharge-note" label={t.episode.dischargeNote} optional>
        <textarea
          id="discharge-note"
          rows={3}
          maxLength={1000}
          className={textareaClassName}
          placeholder={t.episode.dischargeNotePlaceholder}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>

      {error && <FormAlert>{error}</FormAlert>}
      {!online && <FormAlert tone="info">{t.offline.blocked}</FormAlert>}

      <DialogFooter>
        <Button variant="outline" className="h-10" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button
          variant="destructive"
          className="h-10"
          disabled={discharge.isPending || !online}
          onClick={() => {
            setError(null)
            discharge.mutate()
          }}
        >
          {discharge.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {discharge.isPending ? t.episode.discharging : t.episode.dischargeConfirm}
        </Button>
      </DialogFooter>
    </>
  )
}
