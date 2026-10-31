import { useQuery } from '@tanstack/react-query'
import { Building2, CalendarPlus, ClipboardList, NotebookPen, Plus, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { api, type PatientDetail, type VisitRecord } from '@/api'
import { Can } from '@/auth/guards'
import { useCan } from '@/auth/hooks'
import { EmptyState } from '@/components/common/EmptyState'
import { SectionCard, SoftPill } from '@/components/common/SectionCard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ReverseDialog } from '@/features/billing/ReverseDialog'
import { formatDate, formatTime } from '@/lib/date'
import { formatINR } from '@/lib/money'
import { queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'
import { BulkDaysDialog } from './BulkDaysDialog'
import { MarkAttendanceDialog } from './MarkAttendanceDialog'
import { SessionNoteDialog } from './SessionNoteDialog'

/**
 * PAT-003 Visits tab (VIS-003): every visit across episodes and branches, newest first and tagged with the branch.
 * A reversed visit stays listed, marked as reversed, and no longer counts as a session.
 */
export function VisitsTab({ patient }: { patient: PatientDetail }) {
  const canSeeClinical = useCan('clinical.view')
  const canReverse = useCan('entry.reverse')
  const visits = useQuery({
    queryKey: queryKeys.patientVisits(patient.id),
    queryFn: () => api.visits.forPatient(patient.id),
  })

  const [marking, setMarking] = useState(false)
  const [bulkDays, setBulkDays] = useState(false)
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [reversing, setReversing] = useState<VisitRecord | null>(null)

  if (visits.isPending) return <Skeleton className="h-64 w-full rounded-xl" />
  if (visits.isError) {
    return (
      <div className="rounded-xl border bg-card shadow-xs">
        <EmptyState icon={ClipboardList}>{t.visit.loadError}</EmptyState>
      </div>
    )
  }

  const items = visits.data
  const counted = items.filter((visit) => !visit.reversed).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Can permission="visit.mark">
          <Button className="h-10 gap-2 px-4" onClick={() => setMarking(true)}>
            <Plus aria-hidden />
            {t.visit.markAttendance}
          </Button>
        </Can>
        <Can permission="visit.bulk">
          <Button variant="outline" className="h-10 gap-2 px-4" onClick={() => setBulkDays(true)}>
            <CalendarPlus aria-hidden />
            {t.bulk.manyDaysButton}
          </Button>
        </Can>
      </div>

      <SectionCard
        title={t.patient.tabs.visits}
        badge={items.length > 0 ? <SoftPill tone="primary">{t.visit.count(counted)}</SoftPill> : undefined}
        bodyClassName="p-0"
      >
        {items.length === 0 ? (
          <EmptyState icon={ClipboardList}>
            <strong className="block text-foreground">{t.patient.visitsEmptyTitle}</strong>
            {t.patient.visitsEmptyBody}
          </EmptyState>
        ) : (
          <ul className="divide-y">
            {items.map((visit) => (
              <li key={visit.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('font-medium', visit.reversed && 'text-muted-foreground line-through')}>
                      {formatDate(visit.visitedAt)}
                    </span>
                    <span className="text-sm text-muted-foreground">{formatTime(visit.visitedAt)}</span>
                    <SoftPill tone="muted">
                      <Building2 className="mr-1 size-3" aria-hidden />
                      {visit.branchName}
                    </SoftPill>
                    {visit.reversed && <SoftPill tone="danger">{t.visit.reversedPill}</SoftPill>}
                    {visit.feeOverrideReason && <SoftPill tone="primary">{t.visit.feeChanged}</SoftPill>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {visit.therapistName ? t.visit.therapist(visit.therapistName) : t.visit.noTherapist}
                    {visit.feeOverrideReason ? ` · ${t.visit.feeChangedReason(visit.feeOverrideReason)}` : ''}
                  </div>
                </div>

                <div
                  className={cn(
                    'text-right font-semibold tabular-nums',
                    visit.reversed && 'text-muted-foreground line-through',
                  )}
                >
                  {formatINR(visit.fee)}
                </div>

                <div className="flex items-center gap-2">
                  {canSeeClinical && (
                    <Button variant="outline" className="h-9 gap-1.5 px-3" onClick={() => setNoteFor(visit.id)}>
                      <NotebookPen aria-hidden />
                      {visit.hasNote ? t.visit.viewNote : t.visit.addNote}
                    </Button>
                  )}
                  {canReverse && !visit.reversed && (
                    <Button
                      variant="ghost"
                      className="h-9 gap-1.5 px-3 text-muted-foreground hover:text-destructive"
                      onClick={() => setReversing(visit)}
                    >
                      <Undo2 aria-hidden />
                      {t.visit.reverse}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <MarkAttendanceDialog patientId={patient.id} open={marking} onOpenChange={setMarking} />
      <BulkDaysDialog patientId={patient.id} open={bulkDays} onOpenChange={setBulkDays} />
      {noteFor && (
        <SessionNoteDialog
          patientId={patient.id}
          visitId={noteFor}
          open
          onOpenChange={(open) => !open && setNoteFor(null)}
        />
      )}
      <ReverseDialog
        patientId={patient.id}
        open={reversing !== null}
        onOpenChange={(open) => !open && setReversing(null)}
        title={t.visit.reverseTitle}
        description={reversing ? t.visit.reverseBody(formatDate(reversing.visitedAt)) : ''}
        reverse={(reason, key) => api.visits.reverse(reversing?.id ?? '', reason, key)}
      />
    </div>
  )
}
