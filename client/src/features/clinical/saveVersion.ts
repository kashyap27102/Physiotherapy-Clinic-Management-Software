import { type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage, isApiError } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'
import { formFieldOf } from './clinicalForm'

/** After a save: tell the user whether a new version was made, and refresh the episode and its history. */
export async function afterVersionSaved(
  queryClient: QueryClient,
  episodeId: string,
  previousVersion: number | null,
  savedVersion: number,
): Promise<void> {
  if (savedVersion === previousVersion) toast.info(t.episode.nothingChanged)
  else toast.success(t.episode.savedVersion(savedVersion))
  await queryClient.invalidateQueries({ queryKey: queryKeys.episode(episodeId) })
}

/**
 * Turns a failed save into field errors where the server named a field the form knows, and one message otherwise.
 * Returns the message to show above the buttons, or null when every problem was attached to a field.
 */
export function saveErrorMessage<T extends string>(
  error: unknown,
  known: readonly T[],
  setError: (name: T, error: { message: string }) => void,
): string | null {
  if (isApiError(error, 'VERSION_CONFLICT')) return t.episode.versionConflict
  if (isApiError(error, 'VALIDATION_FAILED')) {
    let unmatched = false
    for (const { field, message } of error.fields) {
      const name = formFieldOf(field)
      if ((known as readonly string[]).includes(name)) setError(name as T, { message })
      else unmatched = true
    }
    if (!unmatched && error.fields.length > 0) return null
  }
  return errorMessage(error, t.common.genericError)
}
