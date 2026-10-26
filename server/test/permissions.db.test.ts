import { PrismaPg } from '@prisma/adapter-pg'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PERMISSION_KEYS } from '../src/auth/permissionKeys.js'
import { loadRolePermissions } from '../src/auth/permissions.js'
import { createTenantDb } from '../src/db/tenantScope.js'
import { PrismaClient } from '../src/generated/prisma/client.js'

/** Skipped unless TEST_DATABASE_URL is set (see tenant-isolation.db.test.ts). */
const url = process.env['TEST_DATABASE_URL']

describe.skipIf(!url)('permissions in the database', () => {
  let root: PrismaClient
  let tenantA: string
  let tenantB: string
  let roleA: string
  let roleB: string
  const run = randomUUID().slice(0, 8)

  beforeAll(async () => {
    root = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) })
    const a = await root.tenant.create({ data: { name: `Perm A ${run}` } })
    const b = await root.tenant.create({ data: { name: `Perm B ${run}` } })
    tenantA = a.id
    tenantB = b.id
    roleA = (await root.role.create({ data: { tenantId: a.id, key: 'receptionist', name: 'Receptionist' } })).id
    roleB = (await root.role.create({ data: { tenantId: b.id, key: 'receptionist', name: 'Receptionist' } })).id
    const grants = await root.permission.findMany({ where: { key: { in: ['patient.view', 'payment.record'] } } })
    await root.rolePermission.createMany({ data: grants.map((p) => ({ roleId: roleA, permissionId: p.id })) })
    const view = grants.find((p) => p.key === 'patient.view')!
    await root.rolePermission.create({ data: { roleId: roleB, permissionId: view.id } })
  })

  afterAll(async () => {
    const ids = [tenantA, tenantB].filter(Boolean)
    await root.rolePermission.deleteMany({ where: { role: { tenantId: { in: ids } } } })
    await root.role.deleteMany({ where: { tenantId: { in: ids } } })
    await root.tenant.deleteMany({ where: { id: { in: ids } } })
    await root.$disconnect()
  })

  it('keeps the code catalogue and the seeded permission table identical', async () => {
    const rows = await root.permission.findMany({ select: { key: true } })
    expect(rows.map((r) => r.key).sort()).toEqual([...PERMISSION_KEYS].sort())
  })

  it('loads the keys granted to a role of the clinic', async () => {
    const keys = await loadRolePermissions(createTenantDb(root, tenantA), roleA)
    expect([...keys].sort()).toEqual(['patient.view', 'payment.record'])
  })

  it('resolves another clinic’s role to nothing', async () => {
    const keys = await loadRolePermissions(createTenantDb(root, tenantA), roleB)
    expect(keys.size).toBe(0)
  })
})
