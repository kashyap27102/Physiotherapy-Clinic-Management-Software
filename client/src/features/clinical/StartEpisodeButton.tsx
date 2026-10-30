import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Play } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage, isApiError } from '@/api'
import { useUser } from '@/auth/hooks'
import { useBranchScope } from '@/branchScope/context'
import { FormAlert } from '@/components/auth/FormAlert'
import { Field, selectClassName } from '@/components/common/Field'
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
import { invalidatePatientData, queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

interface Props {
  patientId: string
  className?: string
  size?: 'default' | 'lg'
}

/**
 * CLN-001 / US-25: starts a treatment episode. Staff start it at their own branch in one tap; an owner, who works
 * across branches, first picks the branch (pre-selected from the top-bar branch choice).
 */
export function StartEpisodeButton({ patientId, className, size = 'default' }: Props) {
  const user = useUser()
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [choosing, setChoosing] = useState(false)

  const start = useMutation({
    mutationFn: (branchId?: string) => api.episodes.start(patientId, branchId ? { branchId } : {}),
    onSuccess: async () => {
      toast.success(t.episode.startedToast)
      await Promise.all([
        invalidatePatientData(queryClient, patientId),
        queryClient.invalidateQueries({ queryKey: queryKeys.patientEpisodes(patientId) }),
      ])
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
  return (
    <>
      <Button
        className={cn(size === 'lg' ? 'h-11 px-5' : 'h-10 px-4', className)}
        disabled={start.isPending || !online}
        onClick={() => (needsBranch ? setChoosing(true) : start.mutate(undefined))}
      >
        {start.isPending && !choosing ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
        {start.isPending && !choosing ? t.episode.starting : t.episode.start}
      </Button>
      {needsBranch && (
        <Dialog open={choosing} onOpenChange={setChoosing}>
          <DialogContent className="sm:max-w-md">
            {choosing && (
              <ChooseBranch
                pending={start.isPending}
                error={
                  start.isError && !isApiError(start.error, 'EPISODE_ALREADY_ACTIVE')
                    ? errorMessage(start.error, t.common.genericError)
                    : null
                }
                onCancel={() => setChoosing(false)}
                onStart={(branchId) => start.mutate(branchId)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function ChooseBranch({
  pending,
  error,
  onCancel,
  onStart,
}: {
  pending: boolean
  error: string | null
  onCancel: () => void
  onStart: (branchId: string) => void
}) {
  const scope = useBranchScope()
  const online = useOnlineStatus()
  const [branchId, setBranchId] = useState(scope.branchId ?? (scope.branches.length === 1 ? scope.branches[0]!.id : ''))

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.episode.startTitle}</DialogTitle>
        <DialogDescription>{t.episode.startBody}</DialogDescription>
      </DialogHeader>
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
      {error && <FormAlert>{error}</FormAlert>}
      <DialogFooter>
        <Button variant="outline" className="h-10" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button className="h-10" disabled={!branchId || pending || !online} onClick={() => onStart(branchId)}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? t.episode.starting : t.episode.start}
        </Button>
      </DialogFooter>
    </>
  )
}
