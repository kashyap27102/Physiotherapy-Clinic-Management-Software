import { FormAlert } from '@/components/auth/FormAlert'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { t } from '@/strings/en'

/** Inside a form: tells the user why saving is disabled while offline. */
export function OfflineNotice() {
  return useOnlineStatus() ? null : <FormAlert tone="info">{t.offline.blocked}</FormAlert>
}
