import type { RequestHandler } from 'express'
import { requireAuthContext } from '../auth/context.js'
import type { PermissionKey } from '../auth/permissionKeys.js'
import { forbidden } from '../lib/errors.js'

/** Any signed-in user (API-Requirements "any"). */
export const requireSignedIn: RequestHandler = (req, _res, next) => {
  requireAuthContext(req)
  next()
}

/**
 * Central permission check (PRD SEC-006): the signed-in user must hold every listed permission key.
 * Not signed in answers 401; signed in without the key answers 403.
 *
 * `platform.admin` is held only by the super-admin, and a super-admin holds nothing else, so platform
 * and clinic actions can never be mixed up. Services still re-check ownership of the data they touch
 * through the tenant-scoped database handle; this middleware is the route-level gate, not the only one.
 */
export function requirePermission(...keys: PermissionKey[]): RequestHandler {
  if (keys.length === 0) throw new Error('requirePermission needs at least one permission key')
  return (req, _res, next) => {
    const auth = requireAuthContext(req)
    if (keys.every((key) => auth.permissions.has(key))) {
      next()
      return
    }
    next(forbidden())
  }
}
