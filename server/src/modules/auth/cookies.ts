import type { CookieOptions, Request, Response } from 'express'
import { env } from '../../config/env.js'
import { authConfig, DAY, HOUR } from './authConfig.js'

/** Reads one cookie. Express does not parse cookies on its own and only two are ever used. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1 || part.slice(0, index).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
}

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    // SameSite=None is only accepted by browsers together with Secure.
    secure: env.NODE_ENV === 'production' || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    path: authConfig.cookiePath,
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(authConfig.sessionCookie, token, { ...baseOptions(), maxAge: authConfig.sessionMaxHours * HOUR })
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(authConfig.sessionCookie, baseOptions())
}

export function setDeviceCookie(res: Response, token: string): void {
  res.cookie(authConfig.deviceCookie, token, { ...baseOptions(), maxAge: authConfig.deviceTrustDays * DAY })
}
