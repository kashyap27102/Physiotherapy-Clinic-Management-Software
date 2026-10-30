import { Loader2 } from 'lucide-react'
import type { FormEventHandler, ReactNode } from 'react'
import { FormAlert } from '@/components/auth/FormAlert'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { t } from '@/strings/en'

/**
 * Wide dialog frame shared by the assessment and plan forms: a fixed header and footer with a scrolling body, so the
 * save button stays in reach on a phone held in one hand and on a tablet with the keyboard open.
 */
export const clinicalDialogClass = 'flex max-h-[calc(100dvh-1.5rem)] flex-col gap-0 p-0 sm:max-w-2xl'

interface Props {
  title: string
  description: string
  onSubmit: FormEventHandler<HTMLFormElement>
  onCancel: () => void
  pending: boolean
  canSave: boolean
  error: string | null
  children: ReactNode
}

export function ClinicalFormShell({
  title,
  description,
  onSubmit,
  onCancel,
  pending,
  canSave,
  error,
  children,
}: Props) {
  const online = useOnlineStatus()
  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader className="px-5 pt-5 pb-4 pr-12">
        <DialogTitle className="text-base">{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto border-y px-5 py-5">
        {children}
        {error && <FormAlert>{error}</FormAlert>}
        {!online && <FormAlert tone="info">{t.offline.blocked}</FormAlert>}
      </div>

      <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" className="h-10" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit" className="h-10 px-5" disabled={!canSave || pending || !online}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? t.episode.saving : t.common.save}
        </Button>
      </div>
    </form>
  )
}

/** Small uppercase heading that groups fields inside a long form. */
export function FormSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h3 id={id} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}
