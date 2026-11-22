import { useQuery } from '@tanstack/react-query'
import { Banknote, Building2, RefreshCw, UserRoundPlus, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import { useCan } from '@/auth/hooks'
import { useBranchScope } from '@/branchScope/context'
import { FormAlert } from '@/components/auth/FormAlert'
import { SectionCard } from '@/components/common/SectionCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { seenNotes } from '@/features/dashboard/dashboardText'
import { QuickActions } from '@/features/dashboard/QuickActions'
import { StatTile } from '@/features/dashboard/StatTile'
import { TodayVisits } from '@/features/visits/TodayVisits'
import { formatDate, formatTime } from '@/lib/date'
import { formatINR } from '@/lib/money'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

/**
 * The home screen: quick actions, then how the day is going. Everyone who can see patients gets the quick actions and
 * today's visits (VIS-001); the KPI tiles need `report.view`, and the money lives on the Finance page (`finance.view`).
 * It follows the top-bar branch and refreshes itself once a minute; reading it is not recorded in the audit log.
 */
export function DashboardPage() {
  const canReport = useCan('report.view')
  const { branchId, branch, setBranchId } = useBranchScope()
  const query = useQuery({
    queryKey: queryKeys.dashboardToday(branchId),
    queryFn: ({ signal }) => api.dashboard.today(branchId ?? undefined, signal),
    enabled: canReport,
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
          canReport &&
          summary && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground max-sm:justify-between">
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
      {canReport && summary && (
        <p className="-mt-2 mb-4 text-sm text-muted-foreground sm:-mt-3 sm:mb-5">
          {t.dashboard.today(formatDate(`${summary.date}T12:00:00+05:30`))}
          {branch && ` · ${branch.name}`}
        </p>
      )}

      <QuickActions />

      <div className="space-y-5">
        {canReport &&
          (query.isPending ? (
            <KpiSkeleton />
          ) : query.isError || !summary ? (
            <div>
              <FormAlert>{t.dashboard.loadError}</FormAlert>
              <Button variant="outline" className="mt-3 h-10 px-4" onClick={() => void query.refetch()}>
                {t.common.retry}
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                hero
                label={t.dashboard.patientsSeen}
                icon={UsersRound}
                value={summary.patientsSeen}
                notes={seenNotes(summary)}
                className="sm:col-span-2"
              />
              <StatTile
                label={t.dashboard.newPatientsTile}
                icon={UserRoundPlus}
                value={summary.newPatients}
                notes={[]}
              />
              <CollectedLink />
            </div>
          ))}

        {/* VIS-001: who has been marked present today. */}
        <TodayVisits />

        {canReport && summary?.byBranch && summary.byBranch.length > 1 && (
          <SectionCard title={t.dashboard.byBranch} bodyClassName="p-0">
            <ul className="divide-y">
              {summary.byBranch.map((row) => (
                <li key={row.branchId} className="flex items-center justify-between gap-3 px-4 py-1 sm:px-5">
                  <button
                    type="button"
                    onClick={() => setBranchId(row.branchId)}
                    title={t.dashboard.showBranch(row.name)}
                    className="flex min-h-11 min-w-0 items-center gap-2 rounded text-sm font-medium outline-none hover:text-primary focus-visible:underline"
                  >
                    <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{row.name}</span>
                  </button>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {t.dashboard.sessionsNote(row.patientsSeen)} · {t.dashboard.sessions(row.sessions)}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    </>
  )
}

/**
 * "Collected today" as a link to the Finance page, for people who hold `finance.view`. It shares the Finance page's
 * query, so opening the page right after shows the same figures at once.
 */
function CollectedLink() {
  const canSeeFinance = useCan('finance.view')
  const { branchId } = useBranchScope()
  const finance = useQuery({
    queryKey: queryKeys.financeToday(branchId),
    queryFn: ({ signal }) => api.finance.today(branchId ?? undefined, signal),
    enabled: canSeeFinance,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  if (!canSeeFinance) return null

  return (
    <Link
      to="/finance"
      aria-label={`${t.dashboard.collectedLink}: ${t.dashboard.openFinance}`}
      className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <StatTile
        label={t.dashboard.collectedLink}
        icon={Banknote}
        value={finance.data ? formatINR(finance.data.collections.net) : '–'}
        notes={[t.dashboard.openFinance]}
        className="h-full transition-colors group-hover:bg-muted/50"
      />
    </Link>
  )
}

function KpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
      <Skeleton className="h-40 rounded-xl sm:col-span-2" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  )
}
