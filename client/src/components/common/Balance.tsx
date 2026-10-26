import type { Balance } from '@/api'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatINR } from '@/lib/money'
import { t } from '@/strings/en'

/** Compact balance indicator for lists. Renders nothing when the viewer cannot see balances. */
export function BalanceBadge({ balance }: { balance: Balance | null }) {
  if (!balance) return null
  const amount = formatINR(balance.amount)
  if (balance.state === 'due') return <Badge variant="destructive">{t.balance.due(amount)}</Badge>
  if (balance.state === 'credit') {
    return (
      <Badge variant="outline" className="border-emerald-600/40 text-emerald-700 dark:text-emerald-400">
        {t.balance.credit(amount)}
      </Badge>
    )
  }
  return <Badge variant="secondary">{t.balance.zero}</Badge>
}

/** Prominent balance block for the top of a patient profile (PRD Q34 item B). */
export function BalanceBanner({ balance }: { balance: Balance }) {
  const tone =
    balance.state === 'due'
      ? 'border-destructive/40 bg-destructive/5 text-destructive'
      : balance.state === 'credit'
        ? 'border-emerald-600/40 bg-emerald-600/5 text-emerald-700 dark:text-emerald-400'
        : 'border-border bg-muted/40 text-muted-foreground'
  const title =
    balance.state === 'due'
      ? t.balance.dueTitle
      : balance.state === 'credit'
        ? t.balance.creditTitle
        : t.balance.zeroTitle
  return (
    <div className={cn('rounded-xl border px-4 py-3', tone)} role="status">
      <div className="text-xs font-medium uppercase tracking-wide">{title}</div>
      {balance.state !== 'zero' && <div className="text-2xl font-semibold">{formatINR(balance.amount)}</div>}
    </div>
  )
}
