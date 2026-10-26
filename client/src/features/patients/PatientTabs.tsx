import { useQuery } from '@tanstack/react-query'
import { Building2, ChevronRight, Calendar, Stethoscope, UserRound } from 'lucide-react'
import { api, type EpisodeSummary, type LedgerRecord, type PatientDetail, type VisitRecord } from '@/api'
import { useCan } from '@/auth/hooks'
import { SectionCard, SoftPill } from '@/components/common/SectionCard'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatDateTime } from '@/lib/date'
import { formatINR } from '@/lib/money'
import { queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

function Loading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value || '—'}</dd>
    </div>
  )
}

/* ------------------------------- Overview tab ------------------------------- */

export function OverviewTab({ patient }: { patient: PatientDetail }) {
  const episodes = useQuery({ queryKey: queryKeys.patientEpisodes(patient.id), queryFn: () => api.patients.episodes(patient.id) })
  const active = episodes.data?.find((e) => e.status === 'active')

  return (
    <div className="space-y-6">
      <SectionCard title={t.patient.details}>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label={t.register.fullName} value={patient.fullName} />
          <Detail label={t.register.age} value={t.patient.ageYears(patient.age)} />
          <Detail label={t.register.gender} value={t.patient.gender[patient.gender]} />
          <Detail
            label={t.patient.phone}
            value={`${patient.phone}${patient.phoneContactType === 'guardian' ? ` (${t.register.contactGuardian.toLowerCase()})` : ''}`}
          />
          <Detail label={t.patient.email} value={patient.email} />
          <Detail label={t.patient.address} value={patient.address} />
          <Detail label={t.patient.emergencyContact} value={patient.emergencyContact} />
          <Detail label={t.patient.occupation} value={patient.occupation} />
          <Detail label={t.patient.referringDoctor} value={patient.referringDoctor} />
          <Detail label={t.patient.registeredAt} value={`${patient.registeredBranch} · ${formatDate(patient.createdAt)}`} />
          <div className="sm:col-span-2 lg:col-span-3">
            <Detail label={t.patient.notes} value={patient.notes} />
          </div>
        </dl>
      </SectionCard>

      <SectionCard title={t.patient.activeEpisode}>
        {episodes.isLoading && <Loading />}
        {episodes.data && !active && <p className="text-sm text-muted-foreground">{t.patient.noActiveEpisode}</p>}
        {active && <EpisodeCard episode={active} />}
      </SectionCard>
    </div>
  )
}

/* ------------------------------- Treatment tab ------------------------------ */

function EpisodeCard({ episode }: { episode: EpisodeSummary }) {
  const planned = episode.plan?.plannedSessions ?? null
  const percent = planned ? Math.min(100, Math.round((episode.sessionsDone / planned) * 100)) : null
  const title = episode.plan?.diagnosis || episode.assessment?.diagnosis || t.patient.activeEpisode

  return (
    <details className="group rounded-xl border bg-muted/30">
      <summary className="cursor-pointer list-none px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2">
          <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
          <Stethoscope className="size-4 text-primary" aria-hidden />
          <span className="font-semibold">{title}</span>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={planned ?? 0}
            aria-valuenow={episode.sessionsDone}
            aria-label={t.episode.plannedSessions}
          >
            <div className="h-full rounded-full bg-success" style={{ width: `${percent ?? 0}%` }} />
          </div>
          <span className="w-24 text-right text-sm font-medium text-success">
            {planned ? `${episode.sessionsDone} / ${planned}` : t.patient.sessionsDone(episode.sessionsDone)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="size-3.5" aria-hidden />
            {formatDate(episode.startedAt)}
            {episode.dischargedAt ? ` – ${formatDate(episode.dischargedAt)}` : ''}
          </span>
          <SoftPill tone={episode.status === 'active' ? 'primary' : 'muted'}>
            {episode.status === 'active' ? t.episode.active : t.episode.discharged}
          </SoftPill>
        </div>
      </summary>

      <div className="space-y-5 border-t px-4 py-4">
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t.episode.assessment}</h3>
          {episode.assessment ? (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Detail label={t.episode.history} value={episode.assessment.history} />
              <Detail label={t.episode.pain} value={episode.assessment.pain} />
              <Detail label={t.episode.rangeOfMotion} value={episode.assessment.rangeOfMotion} />
              <Detail label={t.episode.diagnosis} value={episode.assessment.diagnosis} />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{t.episode.notAssessed}</p>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t.episode.plan}</h3>
          {episode.plan ? (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Detail label={t.episode.goals} value={episode.plan.goals} />
              <Detail label={t.episode.frequency} value={episode.plan.frequency} />
              <Detail label={t.episode.therapyTypes} value={episode.plan.therapyTypes} />
              <Detail label={t.episode.plannedSessions} value={planned ? String(planned) : null} />
              <Detail label={t.episode.estimatedCost} value={episode.plan.estimatedCost ? formatINR(episode.plan.estimatedCost) : null} />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{t.episode.noPlan}</p>
          )}
        </div>
      </div>
    </details>
  )
}

export function TreatmentTab({ patientId }: { patientId: string }) {
  const canSeeClinical = useCan('clinical.view')
  const episodes = useQuery({ queryKey: queryKeys.patientEpisodes(patientId), queryFn: () => api.patients.episodes(patientId) })

  if (!canSeeClinical) return <p className="text-sm text-muted-foreground">{t.patient.clinicalHidden}</p>
  return (
    <SectionCard title={t.patient.tabs.treatment}>
      {episodes.isLoading && <Loading />}
      {episodes.data && episodes.data.length === 0 && <p className="text-sm text-muted-foreground">{t.patient.noActiveEpisode}</p>}
      <div className="space-y-3">{episodes.data?.map((episode) => <EpisodeCard key={episode.id} episode={episode} />)}</div>
    </SectionCard>
  )
}

/* -------------------------------- Visits tab -------------------------------- */

/** Session number inside each episode, counting only visits that were not reversed. */
function sessionNumbers(visits: VisitRecord[]): Map<string, number> {
  const numbers = new Map<string, number>()
  const counters = new Map<string, number>()
  for (const visit of [...visits].sort((a, b) => a.visitedAt.localeCompare(b.visitedAt))) {
    if (visit.reversed) continue
    const next = (counters.get(visit.episodeId) ?? 0) + 1
    counters.set(visit.episodeId, next)
    numbers.set(visit.id, next)
  }
  return numbers
}

export function VisitsTab({ patientId }: { patientId: string }) {
  const visits = useQuery({ queryKey: queryKeys.patientVisits(patientId), queryFn: () => api.patients.visits(patientId) })
  const numbers = visits.data ? sessionNumbers(visits.data) : new Map<string, number>()
  const count = visits.data ? visits.data.filter((v) => !v.reversed).length : 0

  return (
    <SectionCard title={t.patient.tabs.visits} badge={visits.data ? <SoftPill>{t.patient.sessionsDone(count)}</SoftPill> : undefined}>
      {visits.isLoading && <Loading />}
      {visits.data && visits.data.length === 0 && <p className="text-sm text-muted-foreground">{t.patient.noVisits}</p>}
      <ol className="relative space-y-3 border-l-2 border-border pl-6">
        {visits.data?.map((visit) => (
          <li key={visit.id} className="relative">
            <span
              className={cn(
                'absolute -left-[33px] top-4 size-3 rounded-full border-2 border-background ring-2',
                visit.reversed ? 'bg-muted-foreground ring-muted-foreground/40' : 'bg-primary ring-primary/40',
              )}
              aria-hidden
            />
            <div className={cn('rounded-xl border bg-card px-4 py-3', visit.reversed && 'opacity-60')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{formatDate(visit.visitedAt)}</span>
                  {numbers.has(visit.id) && <SoftPill>{t.visit.session(numbers.get(visit.id) ?? 0)}</SoftPill>}
                  {visit.reversed && <SoftPill tone="danger">{t.home.reversed}</SoftPill>}
                </div>
                <span className="text-xs text-muted-foreground">{formatDateTime(visit.visitedAt)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <UserRound className="size-3.5" aria-hidden />
                  {visit.therapistName ?? '—'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Building2 className="size-3.5" aria-hidden />
                  {visit.branchName}
                </span>
                <span className="rounded-full border px-2 py-0.5 text-xs text-foreground">{formatINR(visit.fee)}</span>
              </div>
              {visit.feeOverrideReason && <p className="mt-1.5 text-xs text-muted-foreground">{t.visit.feeChanged}: {visit.feeOverrideReason}</p>}
            </div>
          </li>
        ))}
      </ol>
    </SectionCard>
  )
}

/* ------------------------------- Payments tab ------------------------------- */

function ledgerTone(entry: LedgerRecord): string {
  if (entry.reversedByEntryId || entry.type === 'REVERSAL') return 'text-muted-foreground'
  if (entry.type === 'PAYMENT') return 'text-success'
  return 'text-foreground'
}

export function PaymentsTab({ patientId }: { patientId: string }) {
  const canSee = useCan('ledger.view')
  const ledger = useQuery({
    queryKey: queryKeys.patientLedger(patientId),
    queryFn: () => api.patients.ledger(patientId),
    enabled: canSee,
  })

  if (!canSee) return <p className="text-sm text-muted-foreground">{t.patient.paymentsHidden}</p>
  return (
    <SectionCard title={t.patient.tabs.payments} bodyClassName="p-0">
      {ledger.isLoading && <div className="p-5"><Loading /></div>}
      {ledger.data && ledger.data.length === 0 && <p className="p-5 text-sm text-muted-foreground">{t.patient.noPayments}</p>}
      <ul className="divide-y">
        {ledger.data?.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('text-sm font-medium', entry.reversedByEntryId && 'line-through')}>{t.ledger[entry.type]}</span>
                {entry.reversedByEntryId && <SoftPill tone="danger">{t.ledger.reversed}</SoftPill>}
                {entry.method && <SoftPill tone="muted">{t.payment.methods[entry.method]}</SoftPill>}
                <SoftPill tone="muted">{entry.branchName}</SoftPill>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(entry.createdAt)} · {entry.createdByName}
                {entry.documentNumber ? ` · ${t.ledger.receipt} ${entry.documentNumber}` : ''}
                {entry.reference ? ` · ${entry.reference}` : ''}
                {entry.reason ? ` · ${entry.reason}` : ''}
              </div>
            </div>
            <span className={cn('text-sm font-semibold tabular-nums', ledgerTone(entry))}>
              {entry.type === 'PAYMENT' ? '−' : entry.type === 'REVERSAL' ? '' : '+'}
              {formatINR(entry.amount)}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
