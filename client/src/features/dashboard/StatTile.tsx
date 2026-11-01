import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatTileProps {
  /** Sentence case, no trailing colon. */
  label: string
  value: ReactNode
  icon: LucideIcon
  /** The one number the page leads with: larger than the rest. Use it once per page. */
  hero?: boolean
  /** Dues use the reserved danger colour, always with their icon and wording rather than colour alone. */
  tone?: 'default' | 'danger'
  /** Small print under the value. */
  notes?: string[]
  className?: string
}

/** One headline figure. The number is the chart: no plot, no axis (values use proportional digits, not tabular). */
export function StatTile({ label, value, icon: Icon, hero, tone = 'default', notes = [], className }: StatTileProps) {
  return (
    <section
      className={cn(
        'flex flex-col justify-between gap-4 rounded-xl border bg-card p-5 shadow-xs',
        tone === 'danger' && 'border-destructive/30 bg-destructive/5',
        className,
      )}
    >
      <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span
          className={cn(
            'flex size-8 items-center justify-center rounded-lg',
            tone === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        {label}
      </h2>
      <div>
        <p
          className={cn(
            'font-semibold tracking-tight',
            hero ? 'text-5xl' : 'text-3xl',
            tone === 'danger' && 'text-destructive',
          )}
        >
          {value}
        </p>
        {notes.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-x-2 text-sm text-muted-foreground">
            {notes.map((note, index) => (
              <span key={note}>
                {index > 0 && <span aria-hidden>· </span>}
                {note}
              </span>
            ))}
          </p>
        )}
      </div>
    </section>
  )
}
