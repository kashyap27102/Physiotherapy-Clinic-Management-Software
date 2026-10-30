import { useQuery } from '@tanstack/react-query'
import { Building2, FilterX, Loader2, Plus, Search, UserRoundPlus, UsersRound, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '@/api'
import { useCan } from '@/auth/hooks'
import { Can } from '@/auth/guards'
import { useBranchScope } from '@/branchScope/context'
import { FormAlert } from '@/components/auth/FormAlert'
import { EmptyState } from '@/components/common/EmptyState'
import { Pagination } from '@/components/common/Pagination'
import { SoftPill } from '@/components/common/SectionCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PatientFilterBar } from '@/features/patients/PatientFilterBar'
import {
  activeFilterCount,
  PAGE_SIZES,
  readFilters,
  toSearchInput,
  writeFilters,
  type PatientFilters,
} from '@/features/patients/patientFilters'
import { PatientTable } from '@/features/patients/PatientTable'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

/** Digits and phone punctuation only: a phone fragment, which needs four digits before the server will search. */
const isPhoneText = (text: string) => /^[\d\s+().-]+$/.test(text)
const digitCount = (text: string) => text.replace(/\D/g, '').length
const tooShortToSearch = (text: string) =>
  text.length > 0 && (isPhoneText(text) ? digitCount(text) < 4 : text.length < 2)

/**
 * PAT-002 and PAT-005: find any patient of the clinic by name or phone, narrowed by filters and by the branch chosen in
 * the top bar. Search text, filters and the page live in the address bar, so going back from a profile keeps them.
 */
export function HomePage() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const { branchId, branch, setBranchId } = useBranchScope()
  const canSeeBalance = useCan('ledger.view')

  const [text, setText] = useState(() => params.get('q') ?? '')
  const typed = text.trim()
  const q = useDebouncedValue(typed, 250)
  const tooShort = tooShortToSearch(typed)
  const searching = typed.length > 0

  const update = (patch: Partial<PatientFilters>) =>
    setParams(writeFilters({ ...filters, page: 1, ...patch }, q), { replace: true })

  // The settled search text goes into the address; a new search starts again from page 1.
  useEffect(() => {
    if ((params.get('q') ?? '') !== q)
      setParams(writeFilters({ ...readFilters(params), page: 1 }, q), { replace: true })
  }, [q, params, setParams])

  // Choosing another branch in the top bar also starts again from page 1.
  const shownBranch = useRef(branchId)
  useEffect(() => {
    if (shownBranch.current === branchId) return
    shownBranch.current = branchId
    setParams((current) => writeFilters({ ...readFilters(current), page: 1 }, current.get('q') ?? ''), {
      replace: true,
    })
  }, [branchId, setParams])

  const input = toSearchInput(filters, q, branchId)
  const patients = useQuery({
    queryKey: queryKeys.patientSearch(input),
    // React Query's signal cancels a search that a newer one has replaced.
    queryFn: ({ signal }) => api.patients.search(input, signal),
    // Wait for typing to settle, and do not ask the server for what it will refuse (fewer than 4 phone digits).
    enabled: q === typed && !tooShortToSearch(q),
    placeholderData: (previous) => previous,
  })

  const items = patients.data?.items ?? []
  const total = patients.data?.total ?? 0
  const waiting = searching && (q !== typed || patients.isFetching)
  const filterCount = activeFilterCount(filters)
  const clearFilters = () =>
    update({
      gender: undefined,
      status: undefined,
      phoneContactType: undefined,
      registered: undefined,
      registeredFrom: undefined,
      registeredTo: undefined,
    })

  const title = branch
    ? t.home.branchPatientsTitle(branch.name)
    : searching && !tooShort
      ? t.home.resultsTitle
      : t.home.allPatientsTitle

  return (
    <>
      <PageHeader
        crumbs={[{ label: t.home.title }]}
        actions={
          <Can permission="patient.register">
            <Link
              to="/patients/new"
              state={{ prefill: typed }}
              className={buttonVariants({ className: 'h-10 gap-2 px-4' })}
            >
              <Plus aria-hidden />
              {t.home.registerNew}
            </Link>
          </Can>
        }
      />
      <p className="-mt-3 mb-5 text-sm text-muted-foreground">{t.home.subtitle}</p>

      <div className="relative mb-2">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          autoFocus
          autoComplete="off"
          aria-label={t.home.searchLabel}
          placeholder={t.home.searchPlaceholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="h-13 w-full rounded-2xl border border-input bg-card pr-12 pl-12 text-base shadow-xs transition-all outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/25 [&::-webkit-search-cancel-button]:hidden"
        />
        <div className="absolute top-1/2 right-3 -translate-y-1/2">
          {waiting ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t.home.searching} />
          ) : text ? (
            <button
              type="button"
              onClick={() => setText('')}
              aria-label={t.home.clearSearch}
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      <p className="mb-6 px-1 text-xs text-muted-foreground" aria-live="polite">
        {tooShort ? t.home.searchHint : patients.data && searching ? t.home.resultCount(total) : ' '}
      </p>

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
            {branch && <Building2 className="size-4 shrink-0 text-primary" aria-hidden />}
            <span className="truncate">{title}</span>
          </h2>
          {patients.data && !tooShort && total > 0 && <SoftPill tone="primary">{total}</SoftPill>}
        </header>

        <PatientFilterBar filters={filters} onChange={update} onClear={clearFilters} />

        {tooShort ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t.home.searchHint}</p>
        ) : patients.isPending ? (
          <ListSkeleton />
        ) : patients.isError ? (
          <div className="p-5">
            <FormAlert>{t.home.loadError}</FormAlert>
          </div>
        ) : items.length === 0 ? (
          <NoPatients
            searching={searching}
            typed={typed}
            branchName={branch?.name ?? null}
            filtered={filterCount > 0}
            onSearchEveryBranch={() => setBranchId(null)}
            onClearFilters={clearFilters}
          />
        ) : (
          <>
            <PatientTable
              patients={items}
              showBranch={!branch}
              showBalance={canSeeBalance}
              stale={patients.isPlaceholderData}
            />
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
    </>
  )
}

interface NoPatientsProps {
  searching: boolean
  typed: string
  branchName: string | null
  filtered: boolean
  onSearchEveryBranch: () => void
  onClearFilters: () => void
}

/** Why the list is empty, with the one action most likely to help. */
function NoPatients({ searching, typed, branchName, filtered, onSearchEveryBranch, onClearFilters }: NoPatientsProps) {
  const register = (
    <Can permission="patient.register">
      <Link
        to="/patients/new"
        state={{ prefill: typed }}
        className={buttonVariants({ variant: 'outline', className: 'h-10 gap-2 px-4' })}
      >
        <UserRoundPlus aria-hidden />
        {t.home.registerWithQuery}
      </Link>
    </Can>
  )

  // PAT-005: a patient may be registered at another branch, so offer to look everywhere before registering again.
  if (searching && branchName) {
    return (
      <EmptyState
        icon={Search}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button className="h-10 gap-2 px-4" onClick={onSearchEveryBranch}>
              <Building2 aria-hidden />
              {t.home.searchEveryBranch}
            </Button>
            {register}
          </div>
        }
      >
        <strong className="block text-foreground">{t.home.noResultsTitle}</strong>
        {t.home.noResultsInBranch(typed, branchName)}
      </EmptyState>
    )
  }
  if (filtered) {
    return (
      <EmptyState
        icon={FilterX}
        action={
          <Button variant="outline" className="h-10 gap-2 px-4" onClick={onClearFilters}>
            <X aria-hidden />
            {t.home.filters.clear}
          </Button>
        }
      >
        <strong className="block text-foreground">{t.home.filters.noMatchTitle}</strong>
        {t.home.filters.noMatchBody}
      </EmptyState>
    )
  }
  if (searching) {
    return (
      <EmptyState icon={Search} action={register}>
        <strong className="block text-foreground">{t.home.noResultsTitle}</strong>
        {t.home.noResultsBody(typed)}
      </EmptyState>
    )
  }
  return (
    <EmptyState
      icon={UsersRound}
      action={
        <Can permission="patient.register">
          <Link to="/patients/new" className={buttonVariants({ className: 'h-10 gap-2 px-4' })}>
            <UserRoundPlus aria-hidden />
            {t.home.registerNew}
          </Link>
        </Can>
      }
    >
      <strong className="block text-foreground">{t.home.recentEmptyTitle}</strong>
      {t.home.recentEmptyBody}
    </EmptyState>
  )
}

function ListSkeleton() {
  return (
    <div className="divide-y">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3.5 px-5 py-3.5">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-64 md:hidden" />
          </div>
          <Skeleton className="hidden h-4 w-28 md:block" />
          <Skeleton className="hidden h-4 w-24 lg:block" />
        </div>
      ))}
    </div>
  )
}
