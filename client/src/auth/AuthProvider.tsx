import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type SessionUser } from '@/api'
import { onSessionExpired } from '@/api/sessionEvents'
import { AuthContext, type AuthState } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null })
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.auth
      .me()
      .then((user) => {
        if (!cancelled) setState(user ? { status: 'authenticated', user } : { status: 'anonymous', user: null })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'anonymous', user: null })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // BR-AUTH-2 / US-01.6: the server ended the session (idle, password changed, device revoked). Anything already
  // saved is safe on the server; drop cached data and ask the user to sign in again.
  useEffect(
    () =>
      onSessionExpired(() => {
        queryClient.clear()
        setSessionExpired(true)
        setState({ status: 'anonymous', user: null })
      }),
    [queryClient],
  )

  const signedIn = useCallback(
    (user: SessionUser) => {
      queryClient.clear()
      setSessionExpired(false)
      setState({ status: 'authenticated', user })
    },
    [queryClient],
  )

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      // Never keep one user's patient data in memory for the next person at the desk.
      queryClient.clear()
      setSessionExpired(false)
      setState({ status: 'anonymous', user: null })
    }
  }, [queryClient])

  const value = useMemo(
    () => ({ state, sessionExpired, signedIn, signOut }),
    [state, sessionExpired, signedIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
