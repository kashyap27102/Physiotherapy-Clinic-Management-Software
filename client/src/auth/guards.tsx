import type { ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import type { PermissionKey } from '@/api'
import { LogoMark } from '@/components/layout/Logo'
import { Button, buttonVariants } from '@/components/ui/button'
import { t } from '@/strings/en'
import { useAuth, useCan } from './hooks'

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-app" role="status">
      <LogoMark className="size-12 animate-pulse" />
      <span className="sr-only">{t.common.loading}</span>
      <span className="h-1 w-24 overflow-hidden rounded-full bg-border" aria-hidden>
        <span className="block h-full w-1/2 animate-[loading-bar_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
      </span>
    </div>
  )
}

/** The session check could not reach the server: offer a retry instead of signing the user out. */
function SessionCheckFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-app px-4 text-center" role="alert">
      <LogoMark className="size-12" />
      <h1 className="text-xl font-semibold">{t.auth.connectionFailedTitle}</h1>
      <p className="max-w-sm text-muted-foreground">{t.auth.connectionFailedBody}</p>
      <Button className="h-10 px-4" onClick={onRetry}>
        {t.common.retry}
      </Button>
    </div>
  )
}

/** Routes inside this are only for signed-in users. */
export function RequireAuth() {
  const { state, retry } = useAuth()
  const location = useLocation()
  if (state.status === 'loading') return <FullPageSpinner />
  if (state.status === 'error') return <SessionCheckFailed onRetry={retry} />
  if (state.status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** A clinic that has just registered has no branch yet; everything waits until setup is done. */
export function RequireSetupComplete() {
  const { state } = useAuth()
  if (state.status === 'authenticated' && state.user.needsSetup) return <Navigate to="/setup" replace />
  return <Outlet />
}

export function Forbidden() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">{t.common.forbiddenTitle}</h1>
      <p className="mt-2 text-muted-foreground">{t.common.forbiddenBody}</p>
      <Link to="/" className={buttonVariants({ className: 'mt-6 h-10 px-4' })}>
        {t.common.goHome}
      </Link>
    </div>
  )
}

/** Route-level permission check (the server still enforces it). */
export function RequirePermission({ permission, children }: { permission: PermissionKey; children: ReactNode }) {
  const allowed = useCan(permission)
  return allowed ? <>{children}</> : <Forbidden />
}

/** Show children only when the user holds the permission. */
export function Can({ permission, children }: { permission: PermissionKey; children: ReactNode }) {
  return useCan(permission) ? <>{children}</> : null
}
