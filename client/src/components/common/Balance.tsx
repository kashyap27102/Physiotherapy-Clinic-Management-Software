import { CircleAlert, CircleCheck, PiggyBank } from 'lucide-react'
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

/** Prominent balance block for the top of a patient profile (PRD Q34 item B): what is owed, or what is held in advance. */
export function BalanceBanner({ balance }: { balance: Balance }) {
  const style = {
    due: {
      icon: CircleAlert,
      box: 'border-destructive/30 bg-destructive/5',
      chip: 'bg-destructive/10 text-destructive',
      text: 'text-destructive',
      title: t.balance.dueTitle,
    },
    credit: {
      icon: PiggyBank,
      box: 'border-success/30 bg-success-soft/60',
      chip: 'bg-success-soft text-success',
      text: 'text-success',
      title: t.balance.creditTitle,
    },
    zero: {
      icon: CircleCheck,
      box: 'border-border bg-muted/40',
      chip: 'bg-muted text-muted-foreground',
      text: 'text-foreground',
      title: t.balance.zeroTitle,
    },
  }[balance.state]
  const Icon = style.icon
  return (
    <div className={cn('flex items-center gap-3.5 rounded-xl border px-4 py-3.5', style.box)} role="status">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', style.chip)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{style.title}</div>
        {balance.state !== 'zero' && (
          <div className={cn('text-2xl leading-tight font-semibold tabular-nums', style.text)}>
            {formatINR(balance.amount)}
          </div>
        )}
      </div>
    </div>
  )
}
