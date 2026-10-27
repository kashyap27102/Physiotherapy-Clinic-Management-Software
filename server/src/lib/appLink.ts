import { env } from '../config/env.js'

/** A link into the client app, used in emails (reset, invitation, "account exists"). */
export function appLink(path: string, params?: Record<string, string>): string {
  const base = env.APP_URL ?? env.CORS_ORIGINS[0] ?? 'http://localhost:5173'
  const url = new URL(path, base)
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value)
  return url.toString()
}
