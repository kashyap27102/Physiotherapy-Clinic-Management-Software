import { useQuery } from '@tanstack/react-query'
import { Building2, CalendarDays, ClipboardPen, History, LogOut, NotebookPen, Stethoscope, Target } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { api, isApiError, type Episode, type EpisodeDetail, type PatientDetail, type PlanProgress } from '@/api'
import { Can } from '@/auth/guards'
import { useCan } from '@/auth/hooks'
import { EmptyState } from '@/components/common/EmptyState'
import { selectClassName } from '@/components/common/Field'
import { SectionCard, SoftPill } from '@/components/common/SectionCard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/date'
import { queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'
import { AssessmentDialog } from './AssessmentDialog'
import { AssessmentView, PlanView } from './ClinicalViews'
import { DischargeDialog } from './DischargeDialog'
import { PlanDialog } from './PlanDialog'
import { StartEpisodeButton } from './StartEpisodeButton'
import { VersionHistoryDialog } from './VersionHistoryDialog'

/**
 * PAT-003 Treatment tab (CLN-001 to CLN-004): the current episode with its assessment, plan and progress, and every
 * earlier episode one tap away. Discharged episodes are read-only. Only shown to users with clinical.view.
 */
export function TreatmentTab({ patient }: { patient: PatientDetail }) {
  const episodesQuery = useQuery({
    queryKey: queryKeys.patientEpisodes(patient.id),
    queryFn: () => api.episodes.list(patient.id),
  })
  const [picked, setPicked] = useState<string | null>(null)
  const episodes = episodesQuery.data ?? []
  // The current episode first; otherwise the most recent one. A pick that no longer exists falls back the same way.
  const selected =
    episodes.find((episode) => episode.id === picked) ??
    episodes.find((episode) => episode.id === patient.activeEpisodeId) ??
    episodes[0]

  if (episodesQuery.isPending) return <TabSkeleton />
  if (episodesQuery.isError) return <ErrorCard />

  return (
    <div className="space-y-5">
      {!patient.activeEpisodeId && <NoActiveEpisode patientId={patient.id} returning={episodes.length > 0} />}

      {episodes.length > 1 && selected && (
        <EpisodePicker episodes={episodes} value={selected.id} onChange={setPicked} />
      )}

      {selected && <EpisodePanel key={selected.id} episodeId={selected.id} patient={patient} />}
    </div>
  )
}

/* ------------------------------------------------------------- pieces */

function TabSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  )
}

function ErrorCard() {
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <EmptyState icon={Target}>{t.episode.loadError}</EmptyState>
    </div>
  )
}

function NoActiveEpisode({ patientId, returning }: { patientId: string; returning: boolean }) {
  const canStart = useCan('episode.manage')
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-dashed bg-card p-5 shadow-xs sm:flex-row sm:items-center">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <Stethoscope className="size-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold">{t.episode.noEpisodeTitle}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {canStart ? (returning ? t.episode.returningBody : t.episode.noEpisodeBody) : t.episode.askTherapist}
        </p>
      </div>
      {canStart && <StartEpisodeButton patientId={patientId} size="lg" className="w-full sm:w-auto" />}
    </section>
  )
}

function EpisodePicker({
  episodes,
  value,
  onChange,
}: {
  episodes: Episode[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <label htmlFor="episode-picker" className="text-sm font-medium text-muted-foreground">
        {t.episode.episodes}
      </label>
      <select
        id="episode-picker"
        className={cn(selectClassName, 'sm:w-auto sm:min-w-80')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {episodes.map((episode, index) => (
          <option key={episode.id} value={episode.id}>
            {t.episode.episodeOption(
              episodes.length - index,
              formatDate(episode.startedAt),
              t.episode.status[episode.status],
            )}
          </option>
        ))}
      </select>
    </div>
  )
}

/* ------------------------------------------------------------ episode */

type Open = 'assessment' | 'plan' | 'assessmentHistory' | 'planHistory' | 'discharge' | null

function EpisodePanel({ episodeId, patient }: { episodeId: string; patient: PatientDetail }) {
  const query = useQuery({
    queryKey: queryKeys.episode(episodeId),
    queryFn: () => api.episodes.get(episodeId),
    retry: (count, error) => !isApiError(error, 'NOT_FOUND') && count < 2,
    // Each fetch is a recorded view (US-12.5), so do not refetch on focus or remount.
    staleTime: 60_000,
  })
  const [open, setOpen] = useState<Open>(null)
  const close = (isOpen: boolean) => !isOpen && setOpen(null)

  if (query.isPending) return <TabSkeleton />
  if (query.isError) return <ErrorCard />

  const detail = query.data
  const active = detail.episode.status === 'active'
  return (
    <>
      <EpisodeSummary detail={detail} onDischarge={() => setOpen('discharge')} />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ClinicalCard
          title={t.episode.assessmentTitle}
          icon={ClipboardPen}
          version={detail.assessment?.version}
          meta={
            detail.assessment &&
            t.episode.versionMeta(
              detail.assessment.version,
              detail.assessment.author,
              formatDate(detail.assessment.createdAt),
            )
          }
          editable={active}
          editLabel={detail.assessment ? t.episode.editAssessment : t.episode.record}
          onEdit={() => setOpen('assessment')}
          onHistory={() => setOpen('assessmentHistory')}
          empty={t.episode.notAssessed}
        >
          {detail.assessment && <AssessmentView assessment={detail.assessment} />}
        </ClinicalCard>

        <ClinicalCard
          title={t.episode.plan}
          icon={NotebookPen}
          version={detail.plan?.version}
          meta={
            detail.plan &&
            t.episode.versionMeta(detail.plan.version, detail.plan.author, formatDate(detail.plan.createdAt))
          }
          editable={active}
          editLabel={detail.plan ? t.episode.editPlan : t.episode.writePlan}
          onEdit={() => setOpen('plan')}
          onHistory={() => setOpen('planHistory')}
          empty={t.episode.noPlan}
        >
          {detail.plan && <PlanView plan={detail.plan} />}
        </ClinicalCard>
      </div>

      {active && (
        <>
          <AssessmentDialog
            episodeId={episodeId}
            latest={detail.assessment}
            open={open === 'assessment'}
            onOpenChange={close}
          />
          <PlanDialog
            episodeId={episodeId}
            latest={detail.plan}
            assessmentDiagnosis={detail.assessment?.diagnosis ?? null}
            open={open === 'plan'}
            onOpenChange={close}
          />
          <DischargeDialog
            patientId={patient.id}
            episodeId={episodeId}
            balance={patient.balance}
            open={open === 'discharge'}
            onOpenChange={close}
          />
        </>
      )}
      <VersionHistoryDialog
        kind="assessment"
        episodeId={episodeId}
        open={open === 'assessmentHistory'}
        onOpenChange={close}
      />
      <VersionHistoryDialog kind="plan" episodeId={episodeId} open={open === 'planHistory'} onOpenChange={close} />
    </>
  )
}

function EpisodeSummary({ detail, onDischarge }: { detail: EpisodeDetail; onDischarge: () => void }) {
  const { episode, progress } = detail
  const active = episode.status === 'active'
  return (
    <section className="grid gap-5 rounded-xl border bg-card p-5 shadow-xs md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] md:items-center">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">{active ? t.episode.current : t.episode.viewing}</h2>
          <SoftPill tone={active ? 'success' : 'muted'}>{t.episode.status[episode.status]}</SoftPill>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-3.5" aria-hidden />
            {t.episode.startedOn(formatDate(episode.startedAt), episode.startedBranch.name)}
          </span>
          {episode.dischargedAt && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" aria-hidden />
              {t.episode.dischargedOn(formatDate(episode.dischargedAt), episode.dischargedBy)}
            </span>
          )}
        </div>
        {episode.dischargeNote && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap">
            <span className="font-medium">{t.episode.dischargeNote}: </span>
            {episode.dischargeNote}
          </p>
        )}
        {!active && <p className="text-xs text-muted-foreground">{t.episode.readOnly}</p>}
        {active && (
          <Can permission="episode.manage">
            <Button variant="destructive" className="mt-2 h-10 gap-1.5 px-4" onClick={onDischarge}>
              <LogOut aria-hidden />
              {t.episode.discharge}
            </Button>
          </Can>
        )}
      </div>
      <ProgressMeter progress={progress} />
    </section>
  )
}

/** "Session 6 of 10" with a bar. Going past the plan turns amber with a note, but never blocks (BR-CLN-6). */
export function ProgressMeter({ progress }: { progress: PlanProgress }) {
  const { sessionsDone, plannedSessions, exceeded } = progress
  const ratio = plannedSessions ? Math.min(sessionsDone / plannedSessions, 1) : 0
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.episode.progressTitle}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">
        {plannedSessions ? t.episode.progress(sessionsDone, plannedSessions) : t.episode.progressNoPlan(sessionsDone)}
      </div>
      {plannedSessions !== null && (
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={plannedSessions}
          aria-valuenow={sessionsDone}
          aria-label={t.episode.progressTitle}
        >
          <div
            className={cn('h-full rounded-full transition-[width]', exceeded ? 'bg-amber-500' : 'bg-primary')}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      )}
      <p className={cn('mt-2 text-xs', exceeded ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
        {exceeded ? t.episode.progressExceeded : t.episode.progressHint}
      </p>
    </div>
  )
}

function ClinicalCard({
  title,
  icon: Icon,
  version,
  meta,
  editable,
  editLabel,
  onEdit,
  onHistory,
  empty,
  children,
}: {
  title: string
  icon: typeof ClipboardPen
  version: number | undefined
  meta: string | null
  editable: boolean
  editLabel: string
  onEdit: () => void
  onHistory: () => void
  empty: string
  children: ReactNode
}) {
  const canEdit = useCan('clinical.edit') && editable
  return (
    <SectionCard
      title={title}
      badge={version !== undefined ? <SoftPill tone="primary">{t.episode.versionLabel(version)}</SoftPill> : undefined}
      action={
        <div className="flex flex-wrap gap-2">
          {version !== undefined && version > 1 && (
            <Button variant="ghost" className="h-9 gap-1.5 px-3" onClick={onHistory}>
              <History aria-hidden />
              {t.episode.versions(version)}
            </Button>
          )}
          {canEdit && version !== undefined && (
            <Button variant="outline" className="h-9 gap-1.5 px-3" onClick={onEdit}>
              <Icon aria-hidden />
              {editLabel}
            </Button>
          )}
        </div>
      }
    >
      {version === undefined ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Icon className="size-5" aria-hidden />
          </span>
          <p className="text-sm text-muted-foreground">{empty}</p>
          {canEdit && (
            <Button className="h-10 px-4" onClick={onEdit}>
              {editLabel}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {children}
          {meta && <p className="border-t pt-3 text-xs text-muted-foreground">{meta}</p>}
        </div>
      )}
    </SectionCard>
  )
}
