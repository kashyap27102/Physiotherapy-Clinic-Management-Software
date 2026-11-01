import { useQuery } from '@tanstack/react-query'
import { Building2, FilterX, ScrollText, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type AuditEntry } from '@/api'
import { useCan } from '@/auth/hooks'
import { useBranchScope } from '@/branchScope/context'
import { FormAlert } from '@/components/auth/FormAlert'
import { EmptyState } from '@/components/common/EmptyState'
import { Pagination } from '@/components/common/Pagination'
import { SoftPill } from '@/components/common/SectionCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AuditDetailDialog } from '@/features/audit/AuditDetailDialog'
import { AuditFilterBar } from '@/features/audit/AuditFilterBar'
import {
  activeFilterCount,
  PAGE_SIZES,
  readFilters,
  toInput,
  writeFilters,
  type AuditFilters,
} from '@/features/audit/auditFilters'
import { AuditTable } from '@/features/audit/AuditTable'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

/**
 * AUD-001: the clinic's audit log for the owner. Filters and the page live in the address bar, so a bookmark, the
 * "activity" links on a patient or a staff member, and going back all keep them. The branch follows the top bar.
 */
export function AuditLogPage() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const { branchId, branch } = useBranchScope()
  const canListStaff = useCan('staff.manage')
  const [opened, setOpened] = useState<AuditEntry | null>(null)
  // Names are never put in the address; a patient chosen here is remembered for the chip until the page is left.
  const [picked, setPicked] = useState<{ id: string; fullName: string } | null>(null)

  const update = (patch: Partial<AuditFilters>) =>
    setParams(writeFilters({ ...filters, page: 1, ...patch }), { replace: true })

  // Choosing another branch in the top bar also starts again from page 1.
  const shownBranch = useRef(branchId)
  useEffect(() => {
    if (shownBranch.current === branchId) return
    shownBranch.current = branchId
    setParams((current) => writeFilters({ ...readFilters(current), page: 1 }), { replace: true })
  }, [branchId, setParams])

  const input = toInput(filters, branchId)
  const log = useQuery({
    queryKey: queryKeys.auditLog(input),
    queryFn: ({ signal }) => api.audit.list(input, signal),
    placeholderData: (previous) => previous,
    // The log is a record, not a live feed: no refetch just because the window regained focus.
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
  const staff = useQuery({
    queryKey: queryKeys.staff({}),
    queryFn: () => api.users.list(),
    enabled: canListStaff,
  })

  const entries = log.data?.items ?? []
  const total = log.data?.total ?? 0
  const filterCount = activeFilterCount(filters)
  const clearFilters = () =>
    update({
      userId: undefined,
      patientId: undefined,
      action: undefined,
      preset: undefined,
      from: undefined,
      to: undefined,
    })

  // Names for the ids in the address come from the entries themselves, so no extra lookup (and no extra audit row).
  const patientName =
    (picked && picked.id === filters.patientId ? picked.fullName : null) ??
    entries.find((entry) => entry.patient?.id === filters.patientId)?.patient?.fullName ??
    null
  const userName = entries.find((entry) => entry.user?.id === filters.userId)?.user?.fullName ?? null

  return (
    <>
      <PageHeader crumbs={[{ label: t.audit.title }]} />
      <p className="-mt-3 mb-5 text-sm text-muted-foreground">{t.audit.subtitle}</p>

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
            {branch && <Building2 className="size-4 shrink-0 text-primary" aria-hidden />}
            <span className="truncate">{branch ? `${t.audit.listTitle} · ${branch.name}` : t.audit.listTitle}</span>
          </h2>
          {log.data && total > 0 && <SoftPill tone="primary">{total}</SoftPill>}
        </header>

        <AuditFilterBar
          filters={filters}
          staff={staff.data}
          patientName={patientName}
          userName={userName}
          onChange={update}
          onPickPatient={(patient) => {
            setPicked(patient)
            update({ patientId: patient.id })
          }}
          onClear={clearFilters}
        />

        {log.isPending ? (
          <ListSkeleton />
        ) : log.isError ? (
          <div className="p-5">
            <FormAlert>{t.audit.loadError}</FormAlert>
            <Button variant="outline" className="mt-3 h-10 px-4" onClick={() => void log.refetch()}>
              {t.common.retry}
            </Button>
          </div>
        ) : entries.length === 0 ? (
          filterCount > 0 || branch ? (
            <EmptyState
              icon={FilterX}
              action={
                filterCount > 0 ? (
                  <Button variant="outline" className="h-10 gap-2 px-4" onClick={clearFilters}>
                    <X aria-hidden />
                    {t.audit.filters.clear}
                  </Button>
                ) : undefined
              }
            >
              <strong className="block text-foreground">{t.audit.emptyTitle}</strong>
              {t.audit.emptyBody}
            </EmptyState>
          ) : (
            <EmptyState icon={ScrollText}>{t.audit.emptyNoneBody}</EmptyState>
          )
        ) : (
          <>
            <AuditTable entries={entries} showBranch={!branch} onOpen={setOpened} stale={log.isPlaceholderData} />
            <Pagination
              page={filters.page}
              pageSize={filters.pageSize}
              total={total}
              pageSizes={PAGE_SIZES}
              onPageChange={(page) => update({ page })}
              onPageSizeChange={(pageSize) => update({ pageSize })}
            />
          </>
        )}
      </section>

      <AuditDetailDialog entry={opened} onOpenChange={(open) => !open && setOpened(null)} />
    </>
  )
}

function ListSkeleton() {
  return (
    <div className="divide-y">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3.5 px-5 py-3.5">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-64 md:hidden" />
          </div>
          <Skeleton className="hidden h-4 w-28 md:block" />
        </div>
      ))}
    </div>
  )
}
