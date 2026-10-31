import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import { useBranchScope } from '@/branchScope/context'
import { FormAlert } from '@/components/auth/FormAlert'
import { Avatar } from '@/components/common/Avatar'
import { BalanceBadge } from '@/components/common/Balance'
import { EmptyState } from '@/components/common/EmptyState'
import { SoftPill } from '@/components/common/SectionCard'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTime } from '@/lib/date'
import { formatINR } from '@/lib/money'
import { queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

/**
 * VIS-001: who has been marked present today, newest first, with the dues indicator (BILL-008). Staff see their own
 * branch; an owner sees the branch chosen in the top bar, or every branch.
 */
export function TodayVisits() {
  const { branchId, branch } = useBranchScope()
  const visits = useQuery({
    queryKey: queryKeys.todayVisitsFor(branchId),
    queryFn: () => api.visits.today(branchId ?? undefined),
  })
  const items = visits.data ?? []

  return (
    <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
          <CalendarCheck className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{t.today.title}</span>
        </h2>
        {visits.data && items.length > 0 && <SoftPill tone="primary">{items.length}</SoftPill>}
      </header>

      {visits.isPending ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : visits.isError ? (
        <div className="p-5">
          <FormAlert>{t.today.loadError}</FormAlert>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={CalendarCheck}>{branch ? t.today.emptyBranch(branch.name) : t.today.empty}</EmptyState>
      ) : (
        <ul className="divide-y">
          {items.map((visit) => (
            <li key={visit.id}>
              <Link
                to={`/patients/${visit.patientId}`}
                className="group flex items-center gap-3.5 px-4 py-3 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 sm:px-5"
              >
                <Avatar name={visit.patientName} />
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'truncate font-medium group-hover:text-primary',
                      visit.reversed && 'text-muted-foreground line-through',
                    )}
                  >
                    {visit.patientName}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {formatTime(visit.visitedAt)}
                    {!branch && ` · ${visit.branchName}`}
                    {visit.therapistName && ` · ${t.visit.therapist(visit.therapistName)}`}
                    {` · ${formatINR(visit.fee)}`}
                  </div>
                </div>
                {visit.reversed && <SoftPill tone="danger">{t.visit.reversedPill}</SoftPill>}
                <BalanceBadge balance={visit.balance} />
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
