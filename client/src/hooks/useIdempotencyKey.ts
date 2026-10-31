import { useRef } from 'react'
import { isApiError } from '@/api'

/**
 * The Idempotency-Key for one money-moving request (attendance, payments). After a NETWORK error the request may or may
 * not have been saved, so the same key goes out again and the server cannot charge twice. After any other error the
 * attempt is over and the next one gets a fresh key.
 */
export function useIdempotencyKey() {
  const key = useRef(crypto.randomUUID())
  return {
    /** The key to send; read it when the request is made, not while rendering. */
    current: () => key.current,
    /** Call from the mutation's onError. */
    afterError: (error: unknown) => {
      if (!isApiError(error, 'NETWORK')) key.current = crypto.randomUUID()
    },
  }
}
