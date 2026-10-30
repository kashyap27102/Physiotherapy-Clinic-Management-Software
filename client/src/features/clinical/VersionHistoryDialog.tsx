import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { api, type Assessment, type TreatmentPlan } from '@/api'
import { FormAlert } from '@/components/auth/FormAlert'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/date'
import { queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'
import { AssessmentView, PlanView } from './ClinicalViews'

type Kind = 'assessment' | 'plan'

interface Props {
  kind: Kind
  episodeId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** US-12.2 / US-13.2: every saved version, read-only. Opening it is audited on the server (US-12.5). */
export function VersionHistoryDialog({ kind, episodeId, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] flex-col gap-0 p-0 sm:max-w-2xl">
        {open && <History_ kind={kind} episodeId={episodeId} />}
      </DialogContent>
    </Dialog>
  )
}

function History_({ kind, episodeId }: { kind: Kind; episodeId: string }) {
  const query = useQuery<(Assessment | TreatmentPlan)[]>({
    queryKey: kind === 'assessment' ? queryKeys.episodeAssessments(episodeId) : queryKeys.episodePlans(episodeId),
    queryFn: () => (kind === 'assessment' ? api.episodes.assessments(episodeId) : api.episodes.plans(episodeId)),
  })
  const [chosen, setChosen] = useState<number | null>(null)
  const versions = query.data ?? []
  const shown = versions.find((item) => item.version === chosen) ?? versions[0]

  let body: ReactNode
  if (query.isPending) body = <Skeleton className="h-48 w-full rounded-xl" />
  else if (query.isError) body = <FormAlert>{t.common.genericError}</FormAlert>
  else if (!shown)
    body = (
      <p className="text-sm text-muted-foreground">
        {kind === 'assessment' ? t.episode.notAssessed : t.episode.noPlan}
      </p>
    )
  else {
    body = (
      <>
        <div
          role="tablist"
          aria-label={t.episode.versions(versions.length)}
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        >
          {versions.map((item, index) => {
            const selected = item.version === shown.version
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setChosen(item.version)}
                className={cn(
                  'flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors outline-none',
                  'focus-visible:ring-3 focus-visible:ring-ring/50',
                  selected
                    ? 'border-primary bg-accent font-medium text-accent-foreground'
                    : 'border-input hover:bg-muted',
                )}
              >
                {t.episode.versionLabel(item.version)}
                {index === 0 && <span className="text-xs text-muted-foreground">· {t.episode.latest}</span>}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {t.episode.versionMeta(shown.version, shown.author, formatDateTime(shown.createdAt))}
        </p>
        <div className="rounded-xl border bg-muted/20 p-4">
          {kind === 'assessment' ? (
            <AssessmentView assessment={shown as Assessment} />
          ) : (
            <PlanView plan={shown as TreatmentPlan} />
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <DialogHeader className="px-5 pt-5 pb-4 pr-12">
        <DialogTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-muted-foreground" aria-hidden />
          {kind === 'assessment' ? t.episode.historyTitleAssessment : t.episode.historyTitlePlan}
        </DialogTitle>
        <DialogDescription>{t.episode.historyBody}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto border-t px-5 py-5">{body}</div>
    </>
  )
}
