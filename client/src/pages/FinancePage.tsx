import { useQuery } from '@tanstack/react-query'
import { Banknote, Building2, CircleAlert, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import { useBranchScope } from '@/branchScope/context'
import { FormAlert } from '@/components/auth/FormAlert'
import { Avatar } from '@/components/common/Avatar'
import { EmptyState } from '@/components/common/EmptyState'
import { SectionCard } from '@/components/common/SectionCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { collectionNotes } from '@/features/dashboard/dashboardText'
import { StatTile } from '@/features/dashboard/StatTile'
import { formatDate, formatTime } from '@/lib/date'
import { formatINR } from '@/lib/money'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

/**
 * REP-001 and US-26: where the money is. Collections (net of reversals and refunds), outstanding dues, collections by
 * method and by branch, and who owes the most, for today in India time. Needs `finance.view`. It follows the top-bar
 * branch, refreshes itself once a minute, and reading it is not recorded in the audit log.
 */
export function FinancePage() {
  const { branchId, branch, setBranchId } = useBranchScope()
  const query = useQuery({
    queryKey: queryKeys.financeToday(branchId),
    queryFn: ({ signal }) => api.finance.today(branchId ?? undefined, signal),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const summary = query.data

  return (
    <>
      <PageHeader
        crumbs={[{ label: t.finance.title }]}
        actions={
          summary && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{t.finance.updated(formatTime(new Date(query.dataUpdatedAt).toISOString()))}</span>
              <Button
                variant="outline"
                size="icon"
                aria-label={t.finance.refresh}
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />
              </Button>
            </div>
          )
        }
      />
      {summary && (
        <p className="-mt-2 mb-4 text-sm text-muted-foreground sm:-mt-3 sm:mb-5">
          {t.finance.today(formatDate(`${summary.date}T12:00:00+05:30`))}
          {branch && ` · ${branch.name}`}
        </p>
      )}

      {query.isPending ? (
        <FinanceSkeleton />
      ) : query.isError || !summary ? (
        <>
          <FormAlert>{t.finance.loadError}</FormAlert>
          <Button variant="outline" className="mt-3 h-10 px-4" onClick={() => void query.refetch()}>
            {t.common.retry}
          </Button>
        </>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <StatTile
              hero
              label={t.finance.collected}
              icon={Banknote}
              value={formatINR(summary.collections.net)}
              notes={collectionNotes(summary.collections)}
            />
            <StatTile
              label={t.finance.dues}
              icon={CircleAlert}
              tone={summary.dues.patients > 0 ? 'danger' : 'default'}
              value={formatINR(summary.dues.total)}
              notes={[t.finance.duesPatients(summary.dues.patients)]}
            />
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <div className="space-y-5">
              <SectionCard title={t.finance.byMethod} bodyClassName="p-0">
                <ul className="divide-y">
                  {summary.collections.byMethod.map((row) => (
                    <li key={row.method} className="flex items-center justify-between px-4 py-3 text-sm sm:px-5">
                      <span>{t.payment.methods[row.method]}</span>
                      <span className="font-medium tabular-nums">{formatINR(row.amount)}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>

              {summary.byBranch && summary.byBranch.length > 1 && (
                <SectionCard title={t.finance.byBranch} bodyClassName="p-0">
                  <ul className="divide-y">
                    {summary.byBranch.map((row) => (
                      <li key={row.branchId} className="flex items-center justify-between gap-3 px-4 py-1 sm:px-5">
                        <button
                          type="button"
                          onClick={() => setBranchId(row.branchId)}
                          title={t.finance.showBranch(row.name)}
                          className="flex min-h-11 min-w-0 items-center gap-2 rounded text-sm font-medium outline-none hover:text-primary focus-visible:underline"
                        >
                          <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate">{row.name}</span>
                        </button>
                        <span className="text-sm font-medium tabular-nums">{formatINR(row.collected)}</span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
            </div>

            <SectionCard title={t.finance.topDues} bodyClassName="p-0">
              {summary.dues.top.length === 0 ? (
                <EmptyState icon={CircleAlert}>{t.finance.topDuesEmpty}</EmptyState>
              ) : (
                <ul className="divide-y">
                  {summary.dues.top.map((row) => (
                    <li key={row.patientId}>
                      <Link
                        to={`/patients/${row.patientId}`}
                        className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm outline-none hover:bg-muted/50 focus-visible:bg-muted/50 sm:px-5"
                      >
                        <Avatar name={row.fullName ?? t.finance.unknownPatient} className="size-8 text-xs" />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {row.fullName ?? t.finance.unknownPatient}
                        </span>
                        <span className="font-medium text-destructive tabular-nums">{formatINR(row.amount)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {branch && (
                <p className="border-t px-4 py-3 text-xs text-muted-foreground sm:px-5">{t.finance.duesBranchNote}</p>
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </>
  )
}

function FinanceSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  )
}
