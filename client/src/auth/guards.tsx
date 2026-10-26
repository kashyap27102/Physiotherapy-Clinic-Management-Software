import type { ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import type { PermissionKey } from '@/api'
import { buttonVariants } from '@/components/ui/button'
import { t } from '@/strings/en'
import { useAuth, useCan } from './hooks'

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground" role="status">
      {t.common.loading}
    </div>
  )
}

/** Routes inside this are only for signed-in users. */
export function RequireAuth() {
  const { state } = useAuth()
  const location = useLocation()
  if (state.status === 'loading') return <FullPageSpinner />
  if (state.status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />
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
