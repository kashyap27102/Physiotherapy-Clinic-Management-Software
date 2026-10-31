import { type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isApiError } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

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

/** A save against a version someone else already replaced says so; every other failure takes the default handling. */
export function versionConflictMessage(error: unknown): string | undefined {
  return isApiError(error, 'VERSION_CONFLICT') ? t.episode.versionConflict : undefined
}
