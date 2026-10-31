import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage, type SessionNote } from '@/api'
import { useCan } from '@/auth/hooks'
import { FormAlert } from '@/components/auth/FormAlert'
import { Field, textareaClassName } from '@/components/common/Field'
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
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { formatDateTime } from '@/lib/date'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

interface Props {
  patientId: string
  visitId: string
  /** Notes cannot be added once the episode is discharged. */
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** VIS-002: the optional note on a visit. Each save is a new version; the earlier ones stay readable. */
export function SessionNoteDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <NoteForm {...rest} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function NoteForm({ patientId, visitId, onClose }: Omit<Props, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const canEdit = useCan('clinical.edit')

  // Opening the notes is audited on the server, so do not refetch just because the window regained focus.
  const notes = useQuery({
    queryKey: queryKeys.visitNotes(visitId),
    queryFn: () => api.visits.notes(visitId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const latest: SessionNote | undefined = notes.data?.[0]

  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const text = draft ?? latest?.noteText ?? ''

  const save = useMutation({
    mutationFn: () => api.visits.saveNote(visitId, text.trim()),
    onSuccess: async (saved) => {
      // The server answers with the current version when nothing changed.
      toast.success(saved.version === latest?.version ? t.visit.noteUnchanged : t.visit.noteSaved)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.visitNotes(visitId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.patientVisits(patientId) }),
      ])
      onClose()
    },
    onError: (failure) => setError(errorMessage(failure, t.common.genericError)),
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.visit.noteTitle}</DialogTitle>
        <DialogDescription>{canEdit ? t.visit.noteBody : t.visit.noteReadOnly}</DialogDescription>
      </DialogHeader>

      {notes.isPending && <p className="text-sm text-muted-foreground">{t.common.loading}</p>}
      {notes.isError && <FormAlert>{t.common.genericError}</FormAlert>}

      {notes.isSuccess &&
        (canEdit ? (
          <Field id="visit-note" label={t.visit.noteLabel}>
            <textarea
              id="visit-note"
              rows={5}
              maxLength={4000}
              className={textareaClassName}
              placeholder={t.visit.notePlaceholder}
              value={text}
              onChange={(event) => setDraft(event.target.value)}
            />
          </Field>
        ) : latest ? (
          <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">{latest.noteText}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t.visit.noteEmpty}</p>
        ))}

      {notes.isSuccess && notes.data.length > 1 && (
        <details className="rounded-lg border px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">{t.visit.noteHistory}</summary>
          <ul className="mt-2 space-y-3">
            {notes.data.slice(1).map((note) => (
              <li key={note.id}>
                <div className="text-xs text-muted-foreground">
                  {t.visit.noteVersion(note.version, note.author, formatDateTime(note.createdAt))}
                </div>
                <p className="whitespace-pre-wrap">{note.noteText}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {error && <FormAlert>{error}</FormAlert>}
      <OfflineNotice />

      <DialogFooter>
        <Button variant="outline" className="h-10" onClick={onClose}>
          {t.common.cancel}
        </Button>
        {canEdit && (
          <Button
            className="h-10"
            disabled={text.trim() === '' || save.isPending || !online}
            onClick={() => {
              setError(null)
              save.mutate()
            }}
          >
            {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {save.isPending ? t.visit.noteSaving : t.visit.noteSave}
          </Button>
        )}
      </DialogFooter>
    </>
  )
}
