import { PrismaPg } from '@prisma/adapter-pg'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTenantDb } from '../src/db/tenantScope.js'
import { PrismaClient } from '../src/generated/prisma/client.js'

/**
 * Tenant-isolation tests (PRD SEC-001, ER-Diagram section 5.2). They run against a real PostgreSQL
 * database and are skipped unless TEST_DATABASE_URL is set. Each run creates its own clinics and removes
 * them afterwards. Use a development or CI database with test data only (PRD REG-2).
 */
const url = process.env['TEST_DATABASE_URL']

interface Seeded {
  tenantId: string
  branchId: string
  roleId: string
  userId: string
}

describe.skipIf(!url)('tenant isolation', () => {
  let root: PrismaClient
  let a: Seeded
  let b: Seeded
  let superAdminId: string
  let permissionId: string
  const run = randomUUID().slice(0, 8)

  async function seedTenant(label: string): Promise<Seeded> {
    const tenant = await root.tenant.create({ data: { name: `Isolation ${label} ${run}` } })
    const branch = await root.branch.create({ data: { tenantId: tenant.id, name: `Main ${label}`, code: 'MAIN' } })
    const role = await root.role.create({ data: { tenantId: tenant.id, key: 'owner', name: 'Owner' } })
    const user = await root.userAccount.create({
      data: {
        tenantId: tenant.id,
        roleId: role.id,
        email: `owner-${label}-${run}@example.test`,
        fullName: `Owner ${label}`,
        passwordHash: 'not-a-real-hash',
      },
    })
    await root.rolePermission.create({ data: { roleId: role.id, permissionId } })
    await root.auditLog.create({ data: { tenantId: tenant.id, userId: user.id, action: 'test.seed' } })
    return { tenantId: tenant.id, branchId: branch.id, roleId: role.id, userId: user.id }
  }

  beforeAll(async () => {
    root = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) })
    const permission = await root.permission.findFirstOrThrow({ where: { key: 'patient.view' } })
    permissionId = permission.id
    a = await seedTenant('A')
    b = await seedTenant('B')
    const superAdmin = await root.userAccount.create({
      data: {
        email: `super-${run}@example.test`,
        fullName: 'Super Admin',
        passwordHash: 'not-a-real-hash',
        isSuperAdmin: true,
      },
    })
    superAdminId = superAdmin.id
  })

  afterAll(async () => {
    const tenantIds = [a?.tenantId, b?.tenantId].filter((id): id is string => Boolean(id))
    await root.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await root.rolePermission.deleteMany({ where: { role: { tenantId: { in: tenantIds } } } })
    await root.userAccount.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { id: superAdminId }] } })
    await root.role.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await root.branch.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await root.tenant.deleteMany({ where: { id: { in: tenantIds } } })
    await root.$disconnect()
  })

  const db = (seed: Seeded) => createTenantDb(root, seed.tenantId)

  describe('reads', () => {
    it('lists only the signed-in clinic’s rows', async () => {
      const dbA = db(a)
      expect((await dbA.branch.findMany()).map((r) => r.id)).toEqual([a.branchId])
      expect((await dbA.role.findMany()).map((r) => r.id)).toEqual([a.roleId])
      expect((await dbA.userAccount.findMany()).map((r) => r.id)).toEqual([a.userId])
      expect(await dbA.auditLog.count()).toBe(1)
      expect((await dbA.tenant.findMany()).map((r) => r.id)).toEqual([a.tenantId])
    })

    it('does not find another clinic’s record by id (answers as not found)', async () => {
      const dbA = db(a)
      expect(await dbA.branch.findUnique({ where: { id: b.branchId } })).toBeNull()
      expect(await dbA.branch.findFirst({ where: { id: b.branchId } })).toBeNull()
      expect(await dbA.userAccount.findUnique({ where: { id: b.userId } })).toBeNull()
      await expect(dbA.role.findUniqueOrThrow({ where: { id: b.roleId } })).rejects.toThrow()
      await expect(dbA.branch.findFirstOrThrow({ where: { id: b.branchId } })).rejects.toThrow()
    })

    it('ignores a tenantId filter supplied for another clinic', async () => {
      const rows = await db(a).branch.findMany({ where: { tenantId: b.tenantId } })
      expect(rows).toEqual([])
      const or = await db(a).branch.findMany({ where: { OR: [{ tenantId: b.tenantId }, { id: b.branchId }] } })
      expect(or).toEqual([])
    })

    it('scopes counts, aggregates and groupings', async () => {
      const dbA = db(a)
      expect(await dbA.branch.count()).toBe(1)
      expect((await dbA.branch.aggregate({ _count: true }))._count).toBe(1)
      const groups = await dbA.branch.groupBy({ by: ['tenantId'], _count: true })
      expect(groups).toHaveLength(1)
      expect(groups[0]?.tenantId).toBe(a.tenantId)
    })

    it('scopes rows that have no tenant column through their role', async () => {
      const rows = await db(a).rolePermission.findMany()
      expect(rows.map((r) => r.roleId)).toEqual([a.roleId])
    })

    it('never shows the platform super-admin (no tenant)', async () => {
      const ids = (await db(a).userAccount.findMany()).map((u) => u.id)
      expect(ids).not.toContain(superAdminId)
      expect(await db(a).userAccount.findUnique({ where: { id: superAdminId } })).toBeNull()
    })

    it('reads the global permission catalogue', async () => {
      expect(await db(a).permission.count()).toBeGreaterThanOrEqual(22)
    })
  })

  describe('writes', () => {
    it('cannot update another clinic’s record', async () => {
      await expect(db(a).branch.update({ where: { id: b.branchId }, data: { name: 'Hijacked' } })).rejects.toThrow()
      const result = await db(a).branch.updateMany({ where: { id: b.branchId }, data: { name: 'Hijacked' } })
      expect(result.count).toBe(0)
      expect((await root.branch.findUniqueOrThrow({ where: { id: b.branchId } })).name).toBe('Main B')
    })

    it('cannot delete another clinic’s record', async () => {
      await expect(db(a).branch.delete({ where: { id: b.branchId } })).rejects.toThrow()
      const result = await db(a).branch.deleteMany({ where: { id: b.branchId } })
      expect(result.count).toBe(0)
      expect(await root.branch.findUnique({ where: { id: b.branchId } })).not.toBeNull()
    })

    it('updates and deletes its own records', async () => {
      const created = await db(a).branch.create({ data: { name: 'Second', code: 'SEC' } as never })
      expect(created.tenantId).toBe(a.tenantId)
      const updated = await db(a).branch.update({ where: { id: created.id }, data: { name: 'Second renamed' } })
      expect(updated.name).toBe('Second renamed')
      await db(a).branch.delete({ where: { id: created.id } })
      expect(await root.branch.findUnique({ where: { id: created.id } })).toBeNull()
    })

    it('stamps the clinic on create and rejects a different one', async () => {
      const created = await db(a).branch.create({ data: { name: 'Stamped', code: 'STAMP' } as never })
      expect(created.tenantId).toBe(a.tenantId)
      await root.branch.delete({ where: { id: created.id } })

      await expect(
        db(a).branch.create({ data: { tenantId: b.tenantId, name: 'Smuggled', code: 'SMUG' } }),
      ).rejects.toThrow(/does not match/)
      await expect(
        db(a).branch.createMany({
          data: [
            { name: 'ok', code: 'OK1' },
            { tenantId: b.tenantId, name: 'bad', code: 'BAD' },
          ] as never,
        }),
      ).rejects.toThrow(/does not match/)
      expect(await root.branch.count({ where: { code: { in: ['SMUG', 'BAD', 'OK1'] } } })).toBe(0)
    })

    it('cannot move a record to another clinic', async () => {
      await expect(db(a).branch.update({ where: { id: a.branchId }, data: { tenantId: b.tenantId } })).rejects.toThrow(
        /cannot be changed/,
      )
      expect((await root.branch.findUniqueOrThrow({ where: { id: a.branchId } })).tenantId).toBe(a.tenantId)
    })

    it('cannot upsert over another clinic’s record', async () => {
      await expect(
        db(a).branch.upsert({
          where: { id: b.branchId },
          update: { name: 'Hijacked' },
          create: { id: b.branchId, name: 'Hijacked', code: 'HIJ' } as never,
        }),
      ).rejects.toThrow()
      expect((await root.branch.findUniqueOrThrow({ where: { id: b.branchId } })).name).toBe('Main B')
    })

    it('cannot change the clinic record or create clinics', async () => {
      await expect(db(a).tenant.update({ where: { id: a.tenantId }, data: { name: 'x' } })).rejects.toThrow()
      await expect(db(a).tenant.create({ data: { name: 'new clinic' } })).rejects.toThrow()
      await expect(db(a).tenant.delete({ where: { id: b.tenantId } })).rejects.toThrow()
    })

    it('cannot write the global permission catalogue', async () => {
      await expect(db(a).permission.create({ data: { key: `x.${run}` } })).rejects.toThrow(/read-only/)
      await expect(db(a).permission.deleteMany()).rejects.toThrow(/read-only/)
    })

    it('cannot create role permissions directly (the parent role is not verified)', async () => {
      await expect(db(a).rolePermission.create({ data: { roleId: b.roleId, permissionId } })).rejects.toThrow()
    })
  })

  describe('authentication tables', () => {
    it('are not available on a tenant client', async () => {
      await expect(db(a).userSession.findMany()).rejects.toThrow(/not available/)
      await expect(db(a).trustedDevice.findMany()).rejects.toThrow(/not available/)
      await expect(db(a).otpChallenge.findMany()).rejects.toThrow(/not available/)
      await expect(db(a).passwordResetToken.findMany()).rejects.toThrow(/not available/)
    })
  })

  describe('database constraints (second safeguard if the application layer has a bug)', () => {
    it('rejects a user whose branch belongs to another clinic', async () => {
      await expect(
        root.userAccount.create({
          data: {
            tenantId: a.tenantId,
            branchId: b.branchId,
            roleId: a.roleId,
            email: `cross-branch-${run}@example.test`,
            fullName: 'Cross branch',
            passwordHash: 'x',
          },
        }),
      ).rejects.toThrow()
    })

    it('rejects a user whose role belongs to another clinic', async () => {
      await expect(
        root.userAccount.create({
          data: {
            tenantId: a.tenantId,
            roleId: b.roleId,
            email: `cross-role-${run}@example.test`,
            fullName: 'Cross role',
            passwordHash: 'x',
          },
        }),
      ).rejects.toThrow()
    })

    it('keeps email unique regardless of case, across clinics', async () => {
      await expect(
        root.userAccount.create({
          data: {
            tenantId: b.tenantId,
            roleId: b.roleId,
            email: `OWNER-A-${run}@EXAMPLE.test`,
            fullName: 'Duplicate email',
            passwordHash: 'x',
          },
        }),
      ).rejects.toThrow()
    })
  })

  it('refuses to build a client without a valid tenant id', () => {
    expect(() => createTenantDb(root, '')).toThrow(/valid tenant id/)
    expect(() => createTenantDb(root, "' OR 1=1 --")).toThrow(/valid tenant id/)
  })
})
