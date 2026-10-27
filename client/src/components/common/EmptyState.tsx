import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Centred icon, sentence and optional action for an empty list. */
export function EmptyState({
  icon: Icon,
  children,
  action,
}: {
  icon: LucideIcon
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="max-w-sm text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  )
}
