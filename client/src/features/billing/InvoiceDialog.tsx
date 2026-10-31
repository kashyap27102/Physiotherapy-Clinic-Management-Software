import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/api'
import { useCan } from '@/auth/hooks'
import { FormAlert } from '@/components/auth/FormAlert'
import { Field, inputClassName, selectClassName } from '@/components/common/Field'
import { OfflineNotice } from '@/components/common/OfflineNotice'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { dayKey, formatDate } from '@/lib/date'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

interface Props {
  patientId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** BILL-007: an invoice on request for one episode or a date range, for an employer or insurer. It moves no money. */
export function InvoiceDialog({ open, onOpenChange, patientId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <InvoiceForm patientId={patientId} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

const daysAgo = (days: number) => dayKey(new Date(Date.now() - days * 86_400_000))

function InvoiceForm({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const canSeeEpisodes = useCan('clinical.view')
  const episodesQuery = useQuery({
    queryKey: queryKeys.patientEpisodes(patientId),
    queryFn: () => api.episodes.list(patientId),
    enabled: canSeeEpisodes,
  })
  const episodes = episodesQuery.data ?? []

  const [scope, setScope] = useState<'episode' | 'dates'>(canSeeEpisodes ? 'episode' : 'dates')
  const [episodeId, setEpisodeId] = useState('')
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(daysAgo(0))
  const [error, setError] = useState<string | null>(null)
  const idempotencyKey = useIdempotencyKey()

  // Until the user picks one, the first (newest) episode is the choice.
  const chosenEpisode = episodeId || episodes[0]?.id || ''
  const datesValid = from !== '' && to !== '' && from <= to
  const valid = scope === 'episode' ? chosenEpisode !== '' : datesValid

  const create = useMutation({
    mutationFn: () =>
      api.documents.invoice(
        scope === 'episode' ? { patientId, episodeId: chosenEpisode } : { patientId, from, to },
        idempotencyKey.current(),
      ),
    onSuccess: async (result) => {
      toast.success(result.reused ? t.documents.reused(result.number) : t.documents.done(result.number))
      await queryClient.invalidateQueries({ queryKey: queryKeys.patientDocuments(patientId) })
      // The new invoice opens straight away so it can be printed or saved.
      window.open(api.documents.pdfUrl(result.id), '_blank', 'noopener')
      onClose()
    },
    onError: (failure) => {
      idempotencyKey.afterError(failure)
      setError(errorMessage(failure, t.common.genericError))
    },
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.documents.invoiceTitle}</DialogTitle>
        <DialogDescription>{t.documents.invoiceBody}</DialogDescription>
      </DialogHeader>

      {canSeeEpisodes && (
        <div role="radiogroup" className="grid grid-cols-2 gap-2">
          {(['episode', 'dates'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={scope === value}
              onClick={() => setScope(value)}
              className={`h-10 rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                scope === value ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'
              }`}
            >
              {value === 'episode' ? t.documents.scopeEpisode : t.documents.scopeDates}
            </button>
          ))}
        </div>
      )}

      {scope === 'episode' ? (
        <Field id="inv-episode" label={t.documents.episode}>
          {episodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {episodesQuery.isPending ? t.common.loading : t.documents.noEpisodes}
            </p>
          ) : (
            <select
              id="inv-episode"
              className={selectClassName}
              value={chosenEpisode}
              onChange={(event) => setEpisodeId(event.target.value)}
            >
              {episodes.map((episode) => (
                <option key={episode.id} value={episode.id}>
                  {t.documents.episodeOption(formatDate(episode.startedAt), t.episode.status[episode.status])}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="inv-from"
            label={t.documents.from}
            error={from && to && !datesValid ? t.documents.dateError : undefined}
          >
            <Input
              id="inv-from"
              type="date"
              className={inputClassName}
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field id="inv-to" label={t.documents.to}>
            <Input
              id="inv-to"
              type="date"
              className={inputClassName}
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
      )}

      {error && <FormAlert>{error}</FormAlert>}
      <OfflineNotice />

      <DialogFooter>
        <Button variant="outline" className="h-10" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button
          className="h-10"
          disabled={!valid || create.isPending || !online}
          onClick={() => {
            setError(null)
            create.mutate()
          }}
        >
          {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {create.isPending ? t.documents.submitting : t.documents.submit}
        </Button>
      </DialogFooter>
    </>
  )
}
