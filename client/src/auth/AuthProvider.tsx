import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type SessionUser } from '@/api'
import { AuthContext, type AuthState } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null })

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

  const signedIn = useCallback((user: SessionUser) => {
    queryClient.clear()
    setState({ status: 'authenticated', user })
  }, [queryClient])

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      // Never keep one user's patient data in memory for the next person at the desk.
      queryClient.clear()
      setState({ status: 'anonymous', user: null })
    }
  }, [queryClient])

  const value = useMemo(() => ({ state, signedIn, signOut }), [state, signedIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
