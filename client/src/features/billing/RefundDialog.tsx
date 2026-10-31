import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage, type Balance, type PaymentMethod } from '@/api'
import { FormAlert } from '@/components/auth/FormAlert'
import { Field, inputClassName } from '@/components/common/Field'
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
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { formatINR, fromPaise, toPaise } from '@/lib/money'
import { invalidatePatientData } from '@/lib/queryKeys'
import { t } from '@/strings/en'
import { MethodPicker } from './MethodPicker'

interface Props {
  patientId: string
  /** Only a balance in credit can be refunded. */
  credit: Balance
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** BILL-004: give back unused advance credit, never more than is held (BR-BILL-12). */
export function RefundDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <RefundForm {...rest} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function RefundForm({ patientId, credit, onClose }: Omit<Props, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [amountText, setAmountText] = useState(credit.amount)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const idempotencyKey = useIdempotencyKey()

  const paise = toPaise(amountText)
  const available = toPaise(credit.amount) ?? 0
  const amountValid = paise !== null && paise > 0
  const tooMuch = paise !== null && paise > available
  const canSubmit = amountValid && !tooMuch && reason.trim() !== '' && online

  const refund = useMutation({
    mutationFn: () =>
      api.payments.refund(
        { patientId, amount: fromPaise(paise ?? 0), method, reason: reason.trim() },
        idempotencyKey.current(),
      ),
    onSuccess: async () => {
      toast.success(t.refund.done(formatINR(fromPaise(paise ?? 0))))
      await invalidatePatientData(queryClient, patientId)
      onClose()
    },
    onError: async (failure) => {
      idempotencyKey.afterError(failure)
      // The credit may have been spent or refunded by someone else: show the real amount.
      await invalidatePatientData(queryClient, patientId)
      setError(errorMessage(failure, t.common.genericError))
    },
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.refund.title}</DialogTitle>
        <DialogDescription>{t.refund.description}</DialogDescription>
      </DialogHeader>

      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
        <span className="text-muted-foreground">{t.refund.available}</span>
        <span className="font-medium">{formatINR(credit.amount)}</span>
      </div>

      <Field
        id="refund-amount"
        label={t.refund.amount}
        error={amountText && !amountValid ? t.payment.amountError : tooMuch ? t.refund.exceeds : undefined}
      >
        <div className="flex gap-2">
          <Input
            id="refund-amount"
            className={inputClassName}
            inputMode="decimal"
            autoComplete="off"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            className="h-10 shrink-0"
            onClick={() => setAmountText(credit.amount)}
          >
            {t.refund.refundAll}
          </Button>
        </div>
      </Field>

      <MethodPicker value={method} onChange={setMethod} legend={t.refund.method} />

      <Field id="refund-reason" label={t.refund.reason}>
        <Input
          id="refund-reason"
          className={inputClassName}
          maxLength={500}
          placeholder={t.refund.reasonPlaceholder}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>

      {error && <FormAlert>{error}</FormAlert>}
      <OfflineNotice />

      <DialogFooter>
        <Button variant="outline" size="lg" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button
          size="lg"
          disabled={!canSubmit || refund.isPending}
          onClick={() => {
            setError(null)
            refund.mutate()
          }}
        >
          {refund.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {refund.isPending ? t.refund.submitting : t.refund.submit}
        </Button>
      </DialogFooter>
    </>
  )
}
