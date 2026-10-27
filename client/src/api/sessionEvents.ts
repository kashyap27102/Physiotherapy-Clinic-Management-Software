/**
 * Raised when the server stops recognising the session in the middle of work (idle timeout, password changed
 * elsewhere, device revoked: BR-AUTH-2, US-01.6). AuthProvider listens and sends the user back to sign in.
 */
const listeners = new Set<() => void>()

export function onSessionExpired(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notifySessionExpired(): void {
  for (const listener of listeners) listener()
}
