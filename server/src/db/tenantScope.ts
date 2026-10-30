import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { getPrisma } from './prisma.js'

/**
 * Tenant-scoped data access (PRD SEC-001, ER-Diagram section 5.2).
 *
 * `forTenant(tenantId)` returns a Prisma client that cannot see or touch another clinic's rows:
 * every read, update and delete is narrowed to the tenant, and every create is stamped with it.
 * The tenant id always comes from the signed-in user's session, never from the client request.
 * A row of another clinic simply is not found, so callers answer 404 and never reveal it exists.
 *
 * Every model must be classified below. Adding a model without a policy is a compile error.
 * Raw SQL ($queryRaw, $executeRaw) bypasses this layer and must not be used in feature modules.
 */

type Policy =
  /** Row has its own tenant column. */
  | { kind: 'tenant'; column: 'tenantId' }
  /** The tenant row itself: scoped by its primary key. Created and deleted only by the platform. */
  | { kind: 'self' }
  /** No tenant column; scoped through a parent relation. Creates are not allowed here (see below). */
  | { kind: 'via'; relation: 'role' }
  /** Platform-wide catalogue. Readable, never writable through a tenant client. */
  | { kind: 'global' }
  /** Authentication-flow tables looked up by token. Use the unscoped client in the auth module. */
  | { kind: 'denied' }

const policies = {
  Plan: { kind: 'global' },
  Permission: { kind: 'global' },
  Tenant: { kind: 'self' },
  Subscription: { kind: 'tenant', column: 'tenantId' },
  TenantLogo: { kind: 'tenant', column: 'tenantId' },
  Patient: { kind: 'tenant', column: 'tenantId' },
  Episode: { kind: 'tenant', column: 'tenantId' },
  Assessment: { kind: 'tenant', column: 'tenantId' },
  TreatmentPlan: { kind: 'tenant', column: 'tenantId' },
  Branch: { kind: 'tenant', column: 'tenantId' },
  Role: { kind: 'tenant', column: 'tenantId' },
  RolePermission: { kind: 'via', relation: 'role' },
  UserAccount: { kind: 'tenant', column: 'tenantId' },
  AuditLog: { kind: 'tenant', column: 'tenantId' },
  TrustedDevice: { kind: 'denied' },
  OtpChallenge: { kind: 'denied' },
  PasswordResetToken: { kind: 'denied' },
  UserSession: { kind: 'denied' },
  PendingRegistration: { kind: 'denied' },
} as const satisfies Record<Prisma.ModelName, Policy>

const FILTERED = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
])
const CREATES = new Set(['create', 'createMany', 'createManyAndReturn'])
const READS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
])

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Dict = Record<string, unknown>
type Args = Dict & { where?: Dict; data?: unknown }

/** Programming error in server code (not a user error), so it is a plain Error and becomes a 500. */
const scopeError = (message: string) => new Error(`Tenant scope: ${message}`)

function filterFor(policy: Policy, tenantId: string): Dict | undefined {
  switch (policy.kind) {
    case 'tenant':
      return { [policy.column]: tenantId }
    case 'self':
      return { id: tenantId }
    case 'via':
      return { [policy.relation]: { tenantId } }
    default:
      return undefined
  }
}

/**
 * Adds the tenant filter next to the caller's own conditions without wrapping them, so a unique key
 * in `where` (needed by findUnique, update, delete) stays at the top level. The filter goes into AND,
 * so a caller-supplied `tenantId` for another clinic can only ever narrow the result to nothing.
 */
function narrow(where: Dict | undefined, filter: Dict): Dict {
  const existing = where?.['AND']
  const and = existing === undefined ? [] : Array.isArray(existing) ? existing : [existing]
  return { ...where, AND: [...and, filter] }
}

/** Create payloads get the tenant id; a different one supplied by the caller is a bug, not a quiet override. */
function stamp(row: unknown, column: string, tenantId: string): Dict {
  const data = (row ?? {}) as Dict
  const given = data[column]
  if (given !== undefined && given !== tenantId) throw scopeError(`${column} does not match the signed-in clinic`)
  return { ...data, [column]: tenantId }
}

function guardUpdateData(data: unknown, column: string, tenantId: string): void {
  const given = (data as Dict | undefined)?.[column]
  if (given !== undefined && given !== tenantId) throw scopeError(`${column} cannot be changed`)
}

export function createTenantDb(base: PrismaClient, tenantId: string) {
  if (!UUID.test(tenantId)) throw scopeError('a valid tenant id is required')

  return base.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const policy: Policy = policies[model]
          const input = args as Args

          if (policy.kind === 'denied') throw scopeError(`${model} is not available on a tenant client`)

          if (policy.kind === 'global') {
            if (!READS.has(operation)) throw scopeError(`${model} is read-only on a tenant client`)
            return query(args)
          }

          const filter = filterFor(policy, tenantId)

          if (FILTERED.has(operation) && filter) {
            if (policy.kind === 'tenant' && operation.startsWith('update')) {
              guardUpdateData(input.data, policy.column, tenantId)
            }
            if (policy.kind === 'self' && !READS.has(operation)) {
              throw scopeError('the clinic record is changed by the platform, not through a tenant client')
            }
            return query({ ...input, where: narrow(input.where, filter) })
          }

          if (CREATES.has(operation)) {
            if (policy.kind !== 'tenant') throw scopeError(`${model} cannot be created through a tenant client`)
            const data = Array.isArray(input.data)
              ? input.data.map((row) => stamp(row, policy.column, tenantId))
              : stamp(input.data, policy.column, tenantId)
            return query({ ...input, data })
          }

          if (operation === 'upsert') {
            if (policy.kind !== 'tenant') throw scopeError(`${model} cannot be upserted through a tenant client`)
            const create = stamp((input as Dict)['create'], policy.column, tenantId)
            guardUpdateData((input as Dict)['update'], policy.column, tenantId)
            return query({ ...input, where: narrow(input.where, filter ?? {}), create } as never)
          }

          throw scopeError(`operation ${operation} is not supported on a tenant client`)
        },
      },
    },
  })
}

export type TenantDb = ReturnType<typeof createTenantDb>

/** The only clinic fields an owner can change. Status, plan and ids belong to the platform. */
export interface ClinicProfileChanges {
  name?: string
  phone?: string | null
  address?: string | null
  registrationDetails?: string | null
  inactiveAfterDays?: number
}

/**
 * The owner's edit of their own clinic profile (TEN-001). The tenant client cannot update the clinic row at all, so
 * this is the single, whitelisted exception: it only ever touches the signed-in user's clinic and only these fields.
 */
export function updateClinicProfile(tenantId: string, changes: ClinicProfileChanges) {
  if (!UUID.test(tenantId)) throw scopeError('a valid tenant id is required')
  const { name, phone, address, registrationDetails, inactiveAfterDays } = changes
  return getPrisma().tenant.update({
    where: { id: tenantId },
    data: {
      ...(name === undefined ? {} : { name }),
      ...(phone === undefined ? {} : { phone }),
      ...(address === undefined ? {} : { address }),
      ...(registrationDetails === undefined ? {} : { registrationDetails }),
      ...(inactiveAfterDays === undefined ? {} : { inactiveAfterDays }),
    },
  })
}

/** The one entry point for feature modules: a database handle bound to the signed-in user's clinic. */
export function forTenant(tenantId: string): TenantDb {
  return createTenantDb(getPrisma(), tenantId)
}
