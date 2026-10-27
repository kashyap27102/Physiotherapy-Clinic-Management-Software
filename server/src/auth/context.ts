import type { Request } from 'express'
import { forTenant, type TenantDb } from '../db/tenantScope.js'
import { forbidden, unauthenticated } from '../lib/errors.js'
import type { PermissionKey } from './permissionKeys.js'

/**
 * The signed-in user as resolved from the server-side session, once per request. Everything here comes
 * from the database, never from the client. The session middleware (R1) is the only code that sets it.
 */
export interface AuthContext {
  userId: string
  /** Null only for the platform super-admin. */
  tenantId: string | null
  /** Null for owners and the super-admin, who work across branches. */
  branchId: string | null
  isSuperAdmin: boolean
  /** Permission keys granted by the user's role at the time of the request. */
  permissions: ReadonlySet<PermissionKey>
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext
      /** The live session behind `auth`; set together with it by the session middleware. */
      authSession?: { id: string; csrfToken: string }
    }
  }
}

/** The signed-in user, or a 401. */
export function requireAuthContext(req: Request): AuthContext {
  if (!req.auth) throw unauthenticated()
  return req.auth
}

/** A database handle bound to the signed-in user's clinic (see db/tenantScope.ts). */
export function tenantDbFor(req: Request): TenantDb {
  const { tenantId } = requireAuthContext(req)
  if (!tenantId) throw forbidden('This action belongs to a clinic account.')
  return forTenant(tenantId)
}
