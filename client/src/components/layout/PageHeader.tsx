import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Crumb {
  label: string
  to?: string
}

interface PageHeaderProps {
  /** Earlier crumbs are muted links; the last one is the page title. */
  crumbs: Crumb[]
  badge?: ReactNode
  actions?: ReactNode
}

/** "Patients > Nishant Tomar [badge]" with actions on the right, as in the reference design. */
export function PageHeader({ crumbs, badge, actions }: PageHeaderProps) {
  const current = crumbs[crumbs.length - 1]
  const parents = crumbs.slice(0, -1)
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <h1 className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xl font-semibold tracking-tight sm:text-2xl">
        {parents.map((crumb) => (
          <span key={crumb.label} className="flex items-center gap-2 text-muted-foreground">
            {crumb.to ? (
              <Link to={crumb.to} className="hover:text-foreground">
                {crumb.label}
              </Link>
            ) : (
              crumb.label
            )}
            <ChevronRight className="size-4 sm:size-5" aria-hidden />
          </span>
        ))}
        <span className="truncate">{current?.label}</span>
        {badge}
      </h1>
      {/* Phones: the actions share the full width, each a big labelled button. */}
      {actions && (
        <div className="flex w-full items-center gap-2 max-sm:*:h-11 max-sm:*:flex-1 sm:w-auto sm:flex-wrap">
          {actions}
        </div>
      )}
    </div>
  )
}
