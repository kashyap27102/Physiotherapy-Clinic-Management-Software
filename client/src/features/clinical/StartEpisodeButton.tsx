import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Play } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage, isApiError } from '@/api'
import { useCan, useUser } from '@/auth/hooks'
import { useBranchScope } from '@/branchScope/context'
import { FormAlert } from '@/components/auth/FormAlert'
import { Field, inputClassName, selectClassName } from '@/components/common/Field'
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
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { dayKey } from '@/lib/date'
import { invalidatePatientData } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

interface StartInput {
  branchId?: string
  startedOn?: string
  backdateReason?: string
}

interface Props {
  patientId: string
  className?: string
  size?: 'default' | 'lg'
}

/**
 * CLN-001 / US-25: starts a treatment episode. Staff start it at their own branch in one tap; an owner, who works
 * across branches, first picks the branch (pre-selected from the top-bar branch choice). Anyone with `visit.backdate`
 * gets a dialog where the episode can start on an earlier day, so forgotten visits fit inside it.
 */
export function StartEpisodeButton({ patientId, className, size = 'default' }: Props) {
  const user = useUser()
  const canBackdate = useCan('visit.backdate')
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [choosing, setChoosing] = useState(false)

  const start = useMutation({
    mutationFn: (input: StartInput) => api.episodes.start(patientId, input),
    onSuccess: async () => {
      toast.success(t.episode.startedToast)
      // The patient's key is a prefix of its episodes' key, so this refreshes the episode list too.
      await invalidatePatientData(queryClient, patientId)
      setChoosing(false)
    },
    onError: async (error) => {
      // Someone started one a moment ago: show it instead of an error.
      if (isApiError(error, 'EPISODE_ALREADY_ACTIVE')) {
        toast.info(t.episode.alreadyActive)
        await invalidatePatientData(queryClient, patientId)
        setChoosing(false)
        return
      }
      if (!choosing) toast.error(errorMessage(error, t.common.genericError))
    },
  })

  const needsBranch = !user.branch
  const needsDialog = needsBranch || canBackdate
  return (
    <>
      <Button
        className={cn(size === 'lg' ? 'h-11 px-5' : 'h-10 px-4', className)}
        disabled={start.isPending || !online}
        onClick={() => (needsDialog ? setChoosing(true) : start.mutate({}))}
      >
        {start.isPending && !choosing ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
        {start.isPending && !choosing ? t.episode.starting : t.episode.start}
      </Button>
      {needsDialog && (
        <Dialog open={choosing} onOpenChange={setChoosing}>
          <DialogContent className="sm:max-w-md">
            {choosing && (
              <StartDialogBody
                pending={start.isPending}
                error={
                  start.isError && !isApiError(start.error, 'EPISODE_ALREADY_ACTIVE')
                    ? errorMessage(start.error, t.common.genericError)
                    : null
                }
                needsBranch={needsBranch}
                canBackdate={canBackdate}
                onCancel={() => setChoosing(false)}
                onStart={(input) => start.mutate(input)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function StartDialogBody({
  pending,
  error,
  needsBranch,
  canBackdate,
  onCancel,
  onStart,
}: {
  pending: boolean
  error: string | null
  needsBranch: boolean
  canBackdate: boolean
  onCancel: () => void
  onStart: (input: StartInput) => void
}) {
  const scope = useBranchScope()
  const online = useOnlineStatus()
  const [branchId, setBranchId] = useState(scope.branchId ?? (scope.branches.length === 1 ? scope.branches[0]!.id : ''))
  const [earlier, setEarlier] = useState(false)
  const [startedOn, setStartedOn] = useState('')
  const [reason, setReason] = useState('')
  const dateValid = !earlier || (startedOn !== '' && startedOn <= dayKey(new Date()))
  const ready = (!needsBranch || branchId !== '') && dateValid

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.episode.startTitle}</DialogTitle>
        <DialogDescription>{needsBranch ? t.episode.startBody : t.episode.startBodyNoBranch}</DialogDescription>
      </DialogHeader>
      {needsBranch && (
        <Field id="episode-branch" label={t.episode.startBranch}>
          <select
            id="episode-branch"
            className={selectClassName}
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
          >
            <option value="" disabled>
              {t.register.branchPick}
            </option>
            {scope.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name} ({branch.code})
              </option>
            ))}
          </select>
        </Field>
      )}
      {canBackdate && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={earlier}
              onChange={(event) => setEarlier(event.target.checked)}
            />
            {t.episode.startEarlier}
          </label>
          {earlier && (
            <>
              <Field
                id="episode-started-on"
                label={t.episode.startDate}
                error={startedOn && !dateValid ? t.episode.startDateError : undefined}
              >
                <Input
                  id="episode-started-on"
                  type="date"
                  className={inputClassName}
                  max={dayKey(new Date())}
                  value={startedOn}
                  onChange={(event) => setStartedOn(event.target.value)}
                />
              </Field>
              <Field id="episode-reason" label={t.episode.startReason} optional>
                <Input
                  id="episode-reason"
                  className={inputClassName}
                  maxLength={500}
                  placeholder={t.episode.startReasonPlaceholder}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            </>
          )}
        </div>
      )}
      {error && <FormAlert>{error}</FormAlert>}
      <DialogFooter>
        <Button variant="outline" className="h-10" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button
          className="h-10"
          disabled={!ready || pending || !online}
          onClick={() =>
            onStart({
              ...(needsBranch ? { branchId } : {}),
              ...(earlier ? { startedOn, ...(reason.trim() ? { backdateReason: reason.trim() } : {}) } : {}),
            })
          }
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? t.episode.starting : t.episode.start}
        </Button>
      </DialogFooter>
    </>
  )
}
