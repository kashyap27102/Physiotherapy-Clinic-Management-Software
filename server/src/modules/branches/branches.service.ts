import type { AuthContext } from '../../auth/context.js'
import type { TenantDb } from '../../db/tenantScope.js'
import { Prisma } from '../../generated/prisma/client.js'
import { AppError, notFound, validationError } from '../../lib/errors.js'
import { recordAudit } from '../auth/audit.js'

export interface BranchView {
  id: string
  name: string
  code: string
  address: string | null
  phone: string | null
  isActive: boolean
  /** Active staff assigned here. The owner works across branches and is not counted. */
  staffCount: number
  /** True once the branch has issued a receipt or invoice; the code can no longer change (BR-TEN-2). */
  codeLocked: boolean
}

const select = {
  id: true,
  name: true,
  code: true,
  address: true,
  phone: true,
  isActive: true,
  _count: { select: { users: { where: { isActive: true } } } },
} as const

type Row = {
  id: string
  name: string
  code: string
  address: string | null
  phone: string | null
  isActive: boolean
  _count: { users: number }
}

/**
 * Whether the branch has issued a receipt or invoice (BR-TEN-2). Billing documents do not exist yet (R1 billing
 * section), so nothing can be locked today. When the document table lands, this is the one place to count them.
 */
// oxlint-disable-next-line no-unused-vars
async function branchHasIssuedDocuments(_db: TenantDb, _branchId: string): Promise<boolean> {
  return false
}

async function toView(db: TenantDb, row: Row): Promise<BranchView> {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    phone: row.phone,
    isActive: row.isActive,
    staffCount: row._count.users,
    codeLocked: await branchHasIssuedDocuments(db, row.id),
  }
}

/** GET /branches (TEN-002): the owner sees every branch; staff see only their own. */
export async function listBranches(db: TenantDb, auth: AuthContext): Promise<BranchView[]> {
  const rows = await db.branch.findMany({
    where: auth.branchId ? { id: auth.branchId } : {},
    select,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  })
  return Promise.all(rows.map((row) => toView(db, row)))
}

async function findBranch(db: TenantDb, id: string): Promise<Row> {
  // Another clinic's branch is simply not found, so it answers 404.
  const row = await db.branch.findFirst({ where: { id }, select })
  if (!row) throw notFound('Branch not found.')
  return row
}

const duplicateCode = () => validationError([{ field: 'code', message: 'Another branch already uses this code.' }])

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

/**
 * POST /branches (TEN-002, and the first-sign-in setup step after registration). The code is unique in the clinic
 * and becomes part of every receipt number, so it is upper-cased by the route and locked after the first receipt.
 */
export async function createBranch(
  db: TenantDb,
  auth: AuthContext,
  input: { name: string; code: string; address?: string | undefined; phone?: string | undefined },
  ip: string | undefined,
): Promise<BranchView> {
  try {
    const row = await db.branch.create({
      data: {
        name: input.name,
        code: input.code,
        address: input.address ?? null,
        phone: input.phone ?? null,
      } as Prisma.BranchUncheckedCreateInput,
      select,
    })
    await recordAudit({
      action: 'branch.created',
      tenantId: auth.tenantId,
      userId: auth.userId,
      targetType: 'branch',
      targetId: row.id,
      details: { code: row.code },
      ip,
    })
    return toView(db, row)
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateCode()
    throw error
  }
}

export interface BranchChanges {
  name?: string
  code?: string
  address?: string | null
  phone?: string | null
}

/** PATCH /branches/:id. Changing the code is refused with BRANCH_CODE_LOCKED once receipts exist (US-05.2). */
export async function updateBranch(
  db: TenantDb,
  auth: AuthContext,
  id: string,
  changes: BranchChanges,
  ip: string | undefined,
): Promise<BranchView> {
  const before = await findBranch(db, id)
  if (changes.code !== undefined && changes.code !== before.code && (await branchHasIssuedDocuments(db, id))) {
    throw new AppError(409, 'BRANCH_CODE_LOCKED', 'This branch has issued receipts, so its code can no longer change.')
  }
  try {
    const after = await db.branch.update({ where: { id }, data: changes, select })
    const changed = (Object.keys(changes) as (keyof BranchChanges)[]).filter((key) => before[key] !== after[key])
    if (changed.length > 0) {
      await recordAudit({
        action: 'branch.updated',
        tenantId: auth.tenantId,
        userId: auth.userId,
        targetType: 'branch',
        targetId: id,
        details: {
          before: Object.fromEntries(changed.map((key) => [key, before[key]])),
          after: Object.fromEntries(changed.map((key) => [key, after[key]])),
        },
        ip,
      })
    }
    return toView(db, after)
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateCode()
    throw error
  }
}

/**
 * Branches are deactivated, never deleted (BR-TEN-3). Active staff must be moved first (US-05.5), and the clinic
 * must keep at least one active branch, because staff, visits and receipts all need one.
 */
export async function deactivateBranch(
  db: TenantDb,
  auth: AuthContext,
  id: string,
  ip: string | undefined,
): Promise<BranchView> {
  const branch = await findBranch(db, id)
  if (!branch.isActive) return toView(db, branch)
  if (branch._count.users > 0) {
    throw new AppError(409, 'BRANCH_HAS_STAFF', 'Move this branch’s staff to another branch before deactivating it.', {
      details: { staffCount: branch._count.users },
    })
  }
  const activeBranches = await db.branch.count({ where: { isActive: true } })
  if (activeBranches <= 1) {
    throw new AppError(409, 'LAST_BRANCH', 'A clinic needs at least one active branch.')
  }
  const row = await db.branch.update({ where: { id }, data: { isActive: false }, select })
  await recordAudit({
    action: 'branch.deactivated',
    tenantId: auth.tenantId,
    userId: auth.userId,
    targetType: 'branch',
    targetId: id,
    ip,
  })
  return toView(db, row)
}

export async function reactivateBranch(
  db: TenantDb,
  auth: AuthContext,
  id: string,
  ip: string | undefined,
): Promise<BranchView> {
  const branch = await findBranch(db, id)
  if (branch.isActive) return toView(db, branch)
  const row = await db.branch.update({ where: { id }, data: { isActive: true }, select })
  await recordAudit({
    action: 'branch.reactivated',
    tenantId: auth.tenantId,
    userId: auth.userId,
    targetType: 'branch',
    targetId: id,
    ip,
  })
  return toView(db, row)
}
