import type { AuthContext } from '../../auth/context.js'
import type { TenantDb } from '../../db/tenantScope.js'
import { Prisma } from '../../generated/prisma/client.js'
import { validationError } from '../../lib/errors.js'
import { recordAudit } from '../auth/audit.js'

export interface BranchView {
  id: string
  name: string
  code: string
  address: string | null
  phone: string | null
  isActive: boolean
}

const view = { id: true, name: true, code: true, address: true, phone: true, isActive: true } as const

/** GET /branches (TEN-002): the owner sees every branch; staff see only their own. */
export async function listBranches(db: TenantDb, auth: AuthContext): Promise<BranchView[]> {
  return db.branch.findMany({
    where: auth.branchId ? { id: auth.branchId } : {},
    select: view,
    orderBy: { name: 'asc' },
  })
}

/**
 * POST /branches (TEN-002, and the first-sign-in setup step after registration). The code is unique in the clinic
 * and becomes part of every receipt number, so it is upper-cased here and locked after the first receipt (BR-TEN-2).
 */
export async function createBranch(
  db: TenantDb,
  auth: AuthContext,
  input: { name: string; code: string; address?: string | undefined; phone?: string | undefined },
  ip: string | undefined,
): Promise<BranchView> {
  try {
    const branch = await db.branch.create({
      data: {
        name: input.name,
        code: input.code,
        address: input.address ?? null,
        phone: input.phone ?? null,
      } as Prisma.BranchUncheckedCreateInput,
      select: view,
    })
    await recordAudit({
      action: 'branch.created',
      tenantId: auth.tenantId,
      userId: auth.userId,
      targetType: 'branch',
      targetId: branch.id,
      details: { code: branch.code },
      ip,
    })
    return branch
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw validationError([{ field: 'code', message: 'Another branch already uses this code.' }])
    }
    throw error
  }
}
