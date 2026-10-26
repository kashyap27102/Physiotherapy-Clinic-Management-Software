import { useContext } from 'react'
import type { PermissionKey, SessionUser } from '@/api'
import { AuthContext, type AuthContextValue } from './context'

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

/** The signed-in user. Only call inside routes that are behind RequireAuth. */
export function useUser(): SessionUser {
  const { state } = useAuth()
  if (state.status !== 'authenticated') throw new Error('useUser called while signed out')
  return state.user
}

/** UI-only check. The server enforces every permission again (PRD SEC-006). */
export function useCan(permission: PermissionKey): boolean {
  const { state } = useAuth()
  return state.status === 'authenticated' && state.user.permissions.includes(permission)
}
