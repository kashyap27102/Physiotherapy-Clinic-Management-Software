import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SectionCardProps {
  title: string
  action?: ReactNode
  badge?: ReactNode
  className?: string
  bodyClassName?: string
  children: ReactNode
}

/** Bordered card with a titled header row, the basic building block of every screen. */
export function SectionCard({ title, action, badge, className, bodyClassName, children }: SectionCardProps) {
  return (
    <section className={cn('rounded-xl border bg-card text-card-foreground shadow-xs', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          {badge}
        </div>
        {action}
      </header>
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

/** Soft green pill used for counts and "active" states (like "2 sessions" in the reference). */
export function SoftPill({
  children,
  tone = 'success',
}: {
  children: ReactNode
  tone?: 'success' | 'primary' | 'muted' | 'danger'
}) {
  const tones = {
    success: 'bg-success-soft text-success',
    primary: 'bg-accent text-accent-foreground',
    muted: 'bg-muted text-muted-foreground',
    danger: 'bg-destructive/10 text-destructive',
  }
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}
