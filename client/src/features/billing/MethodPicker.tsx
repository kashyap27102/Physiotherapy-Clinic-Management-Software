import type { PaymentMethod } from '@/api'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

const METHODS: PaymentMethod[] = ['cash', 'upi', 'card', 'bank_transfer']

/** Four big tap targets for how money moved: cash, UPI, card or bank transfer. */
export function MethodPicker({
  value,
  onChange,
  legend,
}: {
  value: PaymentMethod
  onChange: (method: PaymentMethod) => void
  legend: string
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {METHODS.map((method) => (
          <button
            key={method}
            type="button"
            aria-pressed={value === method}
            onClick={() => onChange(method)}
            className={cn(
              'h-10 rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              value === method ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
            )}
          >
            {t.payment.methods[method]}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
