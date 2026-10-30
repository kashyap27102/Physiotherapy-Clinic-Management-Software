import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage, type PaymentMethod } from '@/api'
import { BalanceBadge } from '@/components/common/Balance'
import { Field, inputClassName } from '@/components/common/Field'
import { FormAlert } from '@/components/auth/FormAlert'
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
import { invalidatePatientData, queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { OfflineNotice } from '@/components/common/OfflineNotice'
import { t } from '@/strings/en'

const METHODS: PaymentMethod[] = ['cash', 'upi', 'card', 'bank_transfer']

interface Props {
  patientId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RecordPaymentDialog({ patientId, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <PaymentForm patientId={patientId} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

/** Balance after paying, using whole paise (never floating point). */
function balanceAfter(current: { amount: string; state: 'due' | 'credit' | 'zero' }, payPaise: number) {
  const currentPaise = toPaise(current.amount) ?? 0
  const signed = current.state === 'due' ? currentPaise : current.state === 'credit' ? -currentPaise : 0
  const after = signed - payPaise
  return {
    amount: fromPaise(Math.abs(after)),
    state: after > 0 ? ('due' as const) : after < 0 ? ('credit' as const) : ('zero' as const),
  }
}

function PaymentForm({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const patientQuery = useQuery({ queryKey: queryKeys.patient(patientId), queryFn: () => api.patients.get(patientId) })

  const [amountText, setAmountText] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const idempotencyKey = useIdempotencyKey()

  const patient = patientQuery.data
  const payPaise = toPaise(amountText)
  const amountValid = payPaise !== null && payPaise > 0
  const referenceMissing = method === 'bank_transfer' && reference.trim() === ''
  const canSubmit = !!patient && amountValid && !referenceMissing && online

  const record = useMutation({
    mutationFn: () =>
      api.payments.create(
        { patientId, amount: fromPaise(payPaise ?? 0), method, reference: reference.trim() || undefined },
        idempotencyKey.current(),
      ),
    onSuccess: async (result) => {
      toast.success(t.payment.done(result.receipt.number))
      await invalidatePatientData(queryClient, patientId)
      onClose()
    },
    onError: (error) => {
      idempotencyKey.afterError(error)
      setFormError(errorMessage(error, t.common.genericError))
    },
  })

  const current = patient?.balance ?? null
  const preview = current && amountValid ? balanceAfter(current, payPaise) : null

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.payment.title}</DialogTitle>
        <DialogDescription>
          {patient ? `${patient.fullName} · ${patient.phone}` : t.payment.description}
        </DialogDescription>
      </DialogHeader>

      {patientQuery.isLoading && <p className="text-sm text-muted-foreground">{t.common.loading}</p>}
      {patientQuery.isError && <FormAlert>{t.patient.notFound}</FormAlert>}

      {current && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t.payment.balanceBefore}</span>
          <BalanceBadge balance={current} />
        </div>
      )}

      <Field
        id="pay-amount"
        label={t.payment.amount}
        error={amountText && !amountValid ? t.payment.amountError : undefined}
      >
        <div className="flex gap-2">
          <Input
            id="pay-amount"
            className={inputClassName}
            inputMode="decimal"
            autoComplete="off"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
          />
          {current?.state === 'due' && (
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0"
              onClick={() => setAmountText(current.amount)}
            >
              {t.payment.payFullDues}
            </Button>
          )}
        </div>
      </Field>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{t.payment.method}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {METHODS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={method === m}
              onClick={() => setMethod(m)}
              className={cn(
                'h-10 rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                method === m ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
              )}
            >
              {t.payment.methods[m]}
            </button>
          ))}
        </div>
      </fieldset>

      <Field
        id="pay-ref"
        label={method === 'bank_transfer' ? t.payment.referenceRequired : t.payment.reference}
        error={method === 'bank_transfer' && referenceMissing && amountText ? t.payment.referenceError : undefined}
      >
        <Input
          id="pay-ref"
          className={inputClassName}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
      </Field>

      {preview && (
        <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t.payment.balanceAfter}</span>
          <span className="font-medium">
            {preview.state === 'zero'
              ? t.balance.zero
              : preview.state === 'due'
                ? t.balance.due(formatINR(preview.amount))
                : t.balance.credit(formatINR(preview.amount))}
          </span>
        </div>
      )}

      {formError && <FormAlert>{formError}</FormAlert>}
      <OfflineNotice />

      <DialogFooter>
        <Button variant="outline" size="lg" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button
          size="lg"
          disabled={!canSubmit || record.isPending}
          onClick={() => {
            setFormError(null)
            record.mutate()
          }}
        >
          {record.isPending ? t.payment.submitting : t.payment.submit}
        </Button>
      </DialogFooter>
    </>
  )
}
