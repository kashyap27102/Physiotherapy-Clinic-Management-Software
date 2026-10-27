import { createContext } from 'react'
import type { SessionUser } from '@/api'

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'authenticated'; user: SessionUser }

export interface AuthContextValue {
  state: AuthState
  /** True after the server ended the session mid-work (idle timeout, revoked); the login page explains why. */
  sessionExpired: boolean
  signedIn: (user: SessionUser) => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
