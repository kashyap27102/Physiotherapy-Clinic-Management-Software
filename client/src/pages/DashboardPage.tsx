import { useQuery } from '@tanstack/react-query'
import { Banknote, Building2, CircleAlert, RefreshCw, UsersRound } from 'lucide-react'
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
import { collectionNotes, seenNotes } from '@/features/dashboard/dashboardText'
import { StatTile } from '@/features/dashboard/StatTile'
import { formatDate, formatTime } from '@/lib/date'
import { formatINR } from '@/lib/money'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

/**
 * REP-001 and US-26: how the day is going. Patients seen, collections (net of reversals and refunds) and outstanding
 * dues for today in India time, for every branch together or the branch chosen in the top bar. It refreshes itself
 * once a minute; reading it is not recorded in the audit log.
 */
export function DashboardPage() {
  const { branchId, branch, setBranchId } = useBranchScope()
  const query = useQuery({
    queryKey: queryKeys.dashboardToday(branchId),
    queryFn: ({ signal }) => api.dashboard.today(branchId ?? undefined, signal),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const summary = query.data

  return (
    <>
      <PageHeader
        crumbs={[{ label: t.dashboard.title }]}
        actions={
          summary && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{t.dashboard.updated(formatTime(new Date(query.dataUpdatedAt).toISOString()))}</span>
              <Button
                variant="outline"
                size="icon"
                aria-label={t.dashboard.refresh}
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
        <p className="-mt-3 mb-5 text-sm text-muted-foreground">
          {t.dashboard.today(formatDate(`${summary.date}T12:00:00+05:30`))}
          {branch && ` · ${branch.name}`}
        </p>
      )}

      {query.isPending ? (
        <DashboardSkeleton />
      ) : query.isError || !summary ? (
        <>
          <FormAlert>{t.dashboard.loadError}</FormAlert>
          <Button variant="outline" className="mt-3 h-10 px-4" onClick={() => void query.refetch()}>
            {t.common.retry}
          </Button>
        </>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatTile
              hero
              label={t.dashboard.collected}
              icon={Banknote}
              value={formatINR(summary.collections.net)}
              notes={collectionNotes(summary.collections)}
              className="lg:col-span-2"
            />
            <StatTile
              label={t.dashboard.patientsSeen}
              icon={UsersRound}
              value={summary.patientsSeen}
              notes={seenNotes(summary)}
            />
            <StatTile
              label={t.dashboard.dues}
              icon={CircleAlert}
              tone={summary.dues.patients > 0 ? 'danger' : 'default'}
              value={formatINR(summary.dues.total)}
              notes={[t.dashboard.duesPatients(summary.dues.patients)]}
            />
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <div className="space-y-5">
              <SectionCard title={t.dashboard.byMethod} bodyClassName="p-0">
                <ul className="divide-y">
                  {summary.collections.byMethod.map((row) => (
                    <li key={row.method} className="flex items-center justify-between px-5 py-3 text-sm">
                      <span>{t.payment.methods[row.method]}</span>
                      <span className="font-medium tabular-nums">{formatINR(row.amount)}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>

              {summary.byBranch && summary.byBranch.length > 1 && (
                <SectionCard title={t.dashboard.byBranch} bodyClassName="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                        <tr>
                          <th className="px-5 py-2.5 font-medium">{t.dashboard.branch}</th>
                          <th className="px-3 py-2.5 text-right font-medium">{t.dashboard.patientsSeen}</th>
                          <th className="px-5 py-2.5 text-right font-medium">{t.dashboard.collectedShort}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {summary.byBranch.map((row) => (
                          <tr key={row.branchId}>
                            <td className="px-5 py-3">
                              <button
                                type="button"
                                onClick={() => setBranchId(row.branchId)}
                                title={t.dashboard.showBranch(row.name)}
                                className="flex items-center gap-2 rounded font-medium outline-none hover:text-primary focus-visible:underline"
                              >
                                <Building2 className="size-4 text-muted-foreground" aria-hidden />
                                {row.name}
                              </button>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">{row.patientsSeen}</td>
                            <td className="px-5 py-3 text-right font-medium tabular-nums">
                              {formatINR(row.collected)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              )}
            </div>

            <SectionCard title={t.dashboard.topDues} bodyClassName="p-0">
              {summary.dues.top.length === 0 ? (
                <EmptyState icon={CircleAlert}>{t.dashboard.topDuesEmpty}</EmptyState>
              ) : (
                <ul className="divide-y">
                  {summary.dues.top.map((row) => (
                    <li key={row.patientId}>
                      <Link
                        to={`/patients/${row.patientId}`}
                        className="flex items-center gap-3 px-5 py-3 text-sm outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                      >
                        <Avatar name={row.fullName ?? t.dashboard.unknownPatient} className="size-8 text-xs" />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {row.fullName ?? t.dashboard.unknownPatient}
                        </span>
                        <span className="font-medium text-destructive tabular-nums">{formatINR(row.amount)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {branch && (
                <p className="border-t px-5 py-3 text-xs text-muted-foreground">{t.dashboard.duesBranchNote}</p>
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-40 rounded-xl lg:col-span-2" />
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
