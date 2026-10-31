import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, isApiError, type ReverseResult } from '@/api'
import { FormAlert } from '@/components/auth/FormAlert'
import { Field, textareaClassName } from '@/components/common/Field'
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
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { invalidatePatientData } from '@/lib/queryKeys'
import { t } from '@/strings/en'

interface Props {
  patientId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  /** Sends the reversal. Used for a visit and for a ledger entry alike (BILL-005). */
  reverse: (reason: string, idempotencyKey: string) => Promise<ReverseResult>
}

/**
 * BILL-005: reverse a wrong attendance or payment with a reason. Nothing is deleted: the original stays in the history
 * marked as reversed, and a reversed payment also gets a reversal receipt.
 */
export function ReverseDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Mounted only while open, so each opening starts with an empty reason and a fresh idempotency key. */}
        {open && <ReverseForm {...rest} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function ReverseForm({
  patientId,
  title,
  description,
  reverse,
  onClose,
}: Omit<Props, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const idempotencyKey = useIdempotencyKey()

  const mutation = useMutation({
    mutationFn: () => reverse(reason.trim(), idempotencyKey.current()),
    onSuccess: async (result) => {
      toast.success(
        result.reversalReceipt ? t.ledger.reversedWithReceipt(result.reversalReceipt.number) : t.ledger.reversedToast,
      )
      await invalidatePatientData(queryClient, patientId)
      onClose()
    },
    onError: async (failure) => {
      idempotencyKey.afterError(failure)
      // Someone reversed it a moment ago: refresh so the screen shows the real state.
      if (isApiError(failure, 'ALREADY_REVERSED')) await invalidatePatientData(queryClient, patientId)
      setError(errorMessage(failure, t.common.genericError))
    },
  })

  const reasonMissing = reason.trim() === ''

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <Field id="reverse-reason" label={t.ledger.reverseReason}>
        <textarea
          id="reverse-reason"
          rows={2}
          maxLength={500}
          className={textareaClassName}
          placeholder={t.ledger.reverseReasonPlaceholder}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>

      {error && <FormAlert>{error}</FormAlert>}
      <OfflineNotice />

      <DialogFooter>
        <Button variant="outline" className="h-10" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button
          variant="destructive"
          className="h-10"
          disabled={reasonMissing || mutation.isPending || !online}
          onClick={() => {
            setError(null)
            mutation.mutate()
          }}
        >
          {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {mutation.isPending ? t.ledger.reverseSubmitting : t.ledger.reverseSubmit}
        </Button>
      </DialogFooter>
    </>
  )
}
