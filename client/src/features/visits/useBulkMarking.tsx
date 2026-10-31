import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  api,
  ApiError,
  errorDetails,
  errorMessage,
  isApiError,
  type BulkProblem,
  type BulkVisitsInput,
  type BulkVisitsResult,
} from '@/api'
import { FormAlert } from '@/components/auth/FormAlert'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey'
import { formatDate } from '@/lib/date'
import { invalidatePatientData } from '@/lib/queryKeys'
import { t } from '@/strings/en'

const SHOWN_PROBLEMS = 8

/**
 * The save of a bulk attendance dialog (VIS-001): one all-or-nothing request. When the server refuses, it lists every
 * entry that is wrong and nothing was saved; if the only trouble is days that already have a visit, the user can
 * confirm and send the same batch again. Both bulk screens share this.
 */
export function useBulkMarking(onDone: (result: BulkVisitsResult) => void) {
  const queryClient = useQueryClient()
  const idempotencyKey = useIdempotencyKey()
  const [problems, setProblems] = useState<BulkProblem[]>([])
  const [onlyDuplicates, setOnlyDuplicates] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (input: BulkVisitsInput) => api.visits.bulk(input, idempotencyKey.current()),
    onSuccess: async (result) => {
      toast.success(t.bulk.done(result.created))
      await Promise.all(
        [...new Set(result.visits.map((v) => v.patientId))].map((id) => invalidatePatientData(queryClient, id)),
      )
      onDone(result)
    },
    onError: (error) => {
      idempotencyKey.afterError(error)
      if (error instanceof ApiError) {
        const list = errorDetails<{ problems: BulkProblem[] }>(error).problems ?? []
        if (list.length > 0) {
          setProblems(list)
          setOnlyDuplicates(isApiError(error, 'DUPLICATE_VISIT_TODAY'))
          return
        }
        // A field problem the dialog has no spot for (for example too many entries) reads better than "fix the fields".
        setFormError(error.fields.map((f) => f.message).join(' ') || error.message)
        return
      }
      setFormError(errorMessage(error, t.common.genericError))
    },
  })

  /** Call when the user changes the choice, so an old refusal does not stay on screen. */
  function clearFeedback() {
    setProblems([])
    setOnlyDuplicates(false)
    setFormError(null)
  }

  return {
    mutation,
    needsConfirmation: onlyDuplicates && problems.length > 0,
    clearFeedback,
    /** Sends the batch; sends it again with the user's confirmation after a duplicate warning. */
    submit(input: BulkVisitsInput, confirm = false) {
      setProblems([])
      setFormError(null)
      mutation.mutate({ ...input, ...(confirm ? { confirmDuplicates: true } : {}) })
    },
    feedback: (
      <>
        {problems.length > 0 && (
          <Alert variant={onlyDuplicates ? 'default' : 'destructive'}>
            <AlertTitle>{onlyDuplicates ? t.bulk.duplicatesTitle : t.bulk.problemsTitle}</AlertTitle>
            <AlertDescription>
              <p>{onlyDuplicates ? t.bulk.duplicatesBody : t.bulk.problemsBody}</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {problems.slice(0, SHOWN_PROBLEMS).map((p, index) => (
                  <li key={index}>{t.bulk.problemLine(p.patientName, formatDate(p.date), p.message)}</li>
                ))}
                {problems.length > SHOWN_PROBLEMS && <li>{t.bulk.moreProblems(problems.length - SHOWN_PROBLEMS)}</li>}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {formError && <FormAlert>{formError}</FormAlert>}
      </>
    ),
  }
}
