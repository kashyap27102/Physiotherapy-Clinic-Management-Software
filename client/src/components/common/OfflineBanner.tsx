import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { t } from '@/strings/en'

export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100" role="alert">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      {t.offline.banner}
    </div>
  )
}
