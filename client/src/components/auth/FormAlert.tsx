import { CircleAlert, Clock, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const TONES: Record<'error' | 'info', { icon: LucideIcon; className: string }> = {
  error: { icon: CircleAlert, className: 'border-destructive/25 bg-destructive/8 text-destructive' },
  info: { icon: Clock, className: 'border-primary/20 bg-accent text-accent-foreground' },
}

/** Inline message for auth forms: soft tinted box with an icon, announced to screen readers. */
export function FormAlert({ tone = 'error', children }: { tone?: 'error' | 'info'; children: ReactNode }) {
  const { icon: Icon, className } = TONES[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex animate-in gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed duration-300 fade-in slide-in-from-top-1',
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  )
}
