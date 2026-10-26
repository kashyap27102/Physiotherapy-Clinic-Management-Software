import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, IndianRupee, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type PatientListItem, type TodayVisit } from '@/api'
import { Can } from '@/auth/guards'
import { BalanceBadge } from '@/components/common/Balance'
import { SectionCard, SoftPill } from '@/components/common/SectionCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { RecordPaymentDialog } from '@/features/billing/RecordPaymentDialog'
import { MarkAttendanceDialog } from '@/features/visits/MarkAttendanceDialog'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatDate, formatTime } from '@/lib/date'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

export function HomePage() {
  const [text, setText] = useState('')
  const q = useDebouncedValue(text.trim(), 250)
  const searching = q.length >= 2
  const [attendFor, setAttendFor] = useState<string | null>(null)
  const [payFor, setPayFor] = useState<string | null>(null)

  const results = useQuery({
    queryKey: queryKeys.patientSearch(q),
    queryFn: () => api.patients.search({ q }),
    enabled: searching,
  })
  const today = useQuery({ queryKey: queryKeys.todayVisits, queryFn: () => api.visits.today() })

  return (
    <>
      <PageHeader
        crumbs={[{ label: t.nav.patients }]}
        actions={
          <Can permission="patient.register">
            <Link
              to="/patients/new"
              state={{ prefill: text.trim() }}
              className={buttonVariants({ className: 'h-10 gap-2 px-4 text-sm' })}
            >
              <Plus aria-hidden />
              {t.home.registerNew}
            </Link>
          </Can>
        }
      />

      <div className="relative mb-6">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label={t.home.searchLabel}
          placeholder={t.home.searchPlaceholder}
          className="h-11 pl-9 text-base md:text-sm"
          value={text}
          onChange={(event) => setText(event.target.value)}
          autoFocus
        />
      </div>

      {searching && (
        <SectionCard title={t.home.resultsTitle} className="mb-6" bodyClassName="p-0">
          {results.isLoading && <ListSkeleton />}
          {results.data && results.data.items.length === 0 && (
            <div className="flex flex-col items-start gap-3 p-5">
              <p className="text-sm text-muted-foreground">{t.home.noResults}</p>
              <Can permission="patient.register">
                <Link
                  to="/patients/new"
                  state={{ prefill: text.trim() }}
                  className={buttonVariants({ variant: 'outline', className: 'h-10 px-4' })}
                >
                  {t.home.registerWithQuery}
                </Link>
              </Can>
            </div>
          )}
          <ul className="divide-y">
            {results.data?.items.map((patient) => (
              <PatientRow key={patient.id} patient={patient} onAttend={() => setAttendFor(patient.id)} />
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard
        title={t.home.todayTitle}
        badge={today.data ? <SoftPill>{today.data.length}</SoftPill> : undefined}
        bodyClassName="p-0"
      >
        {today.isLoading && <ListSkeleton />}
        {today.data && today.data.length === 0 && (
          <p className="p-5 text-sm text-muted-foreground">{t.home.todayEmpty}</p>
        )}
        <ul className="divide-y">
          {today.data?.map((visit) => (
            <TodayRow key={visit.id} visit={visit} onPay={() => setPayFor(visit.patientId)} />
          ))}
        </ul>
      </SectionCard>

      {attendFor && (
        <MarkAttendanceDialog patientId={attendFor} open onOpenChange={(open) => !open && setAttendFor(null)} />
      )}
      {payFor && <RecordPaymentDialog patientId={payFor} open onOpenChange={(open) => !open && setPayFor(null)} />}
    </>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-3 p-5">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  )
}

function PatientRow({ patient, onAttend }: { patient: PatientListItem; onAttend: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <Link to={`/patients/${patient.id}`} className="font-medium hover:text-primary hover:underline">
          {patient.fullName}
        </Link>
        <div className="text-sm text-muted-foreground">
          {t.patient.ageYears(patient.age)} · {t.patient.gender[patient.gender]} · {patient.phone}
        </div>
        <div className="text-xs text-muted-foreground">
          {patient.lastVisitAt
            ? `${t.home.lastVisit}: ${formatDate(patient.lastVisitAt)}${patient.lastVisitBranch ? ` · ${patient.lastVisitBranch}` : ''}`
            : t.home.neverVisited}
        </div>
      </div>
      <BalanceBadge balance={patient.balance} />
      <Can permission="visit.mark">
        <Button variant="outline" className="h-10 gap-1.5 px-3" onClick={onAttend}>
          <CalendarCheck aria-hidden />
          {t.home.markAttendance}
        </Button>
      </Can>
    </li>
  )
}

function TodayRow({ visit, onPay }: { visit: TodayVisit; onPay: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <div className="w-20 shrink-0 text-sm tabular-nums text-muted-foreground">{formatTime(visit.visitedAt)}</div>
      <div className="min-w-0 flex-1">
        <Link to={`/patients/${visit.patientId}`} className="font-medium hover:text-primary hover:underline">
          {visit.patientName}
        </Link>
        <div className="text-sm text-muted-foreground">
          {visit.patientPhone}
          {visit.therapistName ? ` · ${t.home.therapist}: ${visit.therapistName}` : ''}
        </div>
      </div>
      {visit.reversed && <SoftPill tone="danger">{t.home.reversed}</SoftPill>}
      <BalanceBadge balance={visit.balance} />
      <Can permission="payment.record">
        <Button variant="outline" className="h-10 gap-1.5 px-3" onClick={onPay}>
          <IndianRupee aria-hidden />
          {t.home.takePayment}
        </Button>
      </Can>
    </li>
  )
}
