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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-2xl font-semibold tracking-tight">
        {parents.map((crumb) => (
          <span key={crumb.label} className="flex items-center gap-2 text-muted-foreground">
            {crumb.to ? (
              <Link to={crumb.to} className="hover:text-foreground">
                {crumb.label}
              </Link>
            ) : (
              crumb.label
            )}
            <ChevronRight className="size-5" aria-hidden />
          </span>
        ))}
        <span className="truncate">{current?.label}</span>
        {badge}
      </h1>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
