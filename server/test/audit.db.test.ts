import { PrismaPg } from '@prisma/adapter-pg'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { setEmailSender } from '../src/lib/email/index.js'
import { addAndSignInStaff, API, captureEmail, post, registerClinic, type Session } from './helpers/clinic.js'

/**
 * Audit log viewer (AUD-001, US-19) end to end against TEST_DATABASE_URL, with a second clinic to prove isolation
 * (SEC-001). Skipped without it. Everything the run creates is removed afterwards. Test data only (PRD REG-2).
 */
const url = process.env['TEST_DATABASE_URL']

vi.mock('../src/db/prisma.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/prisma.js')>()
  const testUrl = process.env['TEST_DATABASE_URL']
  if (!testUrl) return actual
  const { PrismaPg: Adapter } = await import('@prisma/adapter-pg')
  const { PrismaClient: Client } = await import('../src/generated/prisma/client.js')
  const client = new Client({ adapter: new Adapter({ connectionString: testUrl }) })
  return { ...actual, getPrisma: () => client }
})

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

interface Row {
  id: string
  action: string
  at: string
  user: { id: string; fullName: string | null } | null
  branch: { id: string; name: string | null } | null
  patient: { id: string; fullName: string | null } | null
  targetType: string | null
  targetId: string | null
}

describe.skipIf(!url)('audit log viewer', () => {
  let root: PrismaClient
  const app = createApp()
  const run = randomUUID().slice(0, 8)
  const mail = captureEmail()
  const env = { app, run, last: mail.last }

  let ownerA: Session
  let ownerB: Session
  let branchA: string
  let front: Session
  let physio: Session
  let frontId: string
  let patientId: string
  let episodeId: string

  const list = (s: Session, query = '') => s.agent.get(`${API}/audit-log${query}`)
  const actions = (rows: Row[]) => rows.map((r) => r.action)

  beforeAll(async () => {
    root = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) })
    const a = await registerClinic(env, 'AA', 'AU1')
    const b = await registerClinic(env, 'AB', 'AU2')
    ownerA = a.owner
    branchA = a.branchId
    ownerB = b.owner
    front = await addAndSignInStaff(env, ownerA, 'afront', 'receptionist', branchA)
    physio = await addAndSignInStaff(env, ownerA, 'aphysio', 'physiotherapist', branchA)
    frontId = (await front.agent.get(`${API}/auth/me`)).body.id as string

    const patient = await post(front, '/patients', {
      fullName: 'Audit Subject',
      phone: `97${String(40_000_000 + run.charCodeAt(0) * 100 + run.charCodeAt(1)).padStart(8, '0')}`,
      age: 41,
      gender: 'female',
    })
    expect(patient.status).toBe(201)
    patientId = patient.body.id as string
    const episode = await post(physio, `/patients/${patientId}/episodes`)
    expect(episode.status).toBe(201)
    episodeId = episode.body.id as string
    // Reads that target the episode, not the patient.
    expect((await physio.agent.get(`${API}/episodes/${episodeId}`)).status).toBe(200)
    expect((await front.agent.get(`${API}/patients/${patientId}`)).status).toBe(200)
  })

  afterAll(async () => {
    setEmailSender(undefined)
    const tenants = await root.tenant.findMany({ where: { name: { endsWith: ` ${run}` } }, select: { id: true } })
    const ids = tenants.map((t) => t.id)
    await root.episode.deleteMany({ where: { tenantId: { in: ids } } })
    await root.auditLog.deleteMany({ where: { tenantId: { in: ids } } })
    await root.patient.deleteMany({ where: { tenantId: { in: ids } } })
    await root.userAccount.deleteMany({ where: { tenantId: { in: ids } } })
    await root.rolePermission.deleteMany({ where: { role: { tenantId: { in: ids } } } })
    await root.role.deleteMany({ where: { tenantId: { in: ids } } })
    await root.branch.deleteMany({ where: { tenantId: { in: ids } } })
    await root.subscription.deleteMany({ where: { tenantId: { in: ids } } })
    await root.tenant.deleteMany({ where: { id: { in: ids } } })
    await root.pendingRegistration.deleteMany({ where: { email: { endsWith: `-${run}@example.test` } } })
    await root.$disconnect()
  })

  it('is for people holding audit.view: the owner only by default', async () => {
    expect((await list(front)).status).toBe(403)
    expect((await list(physio)).status).toBe(403)
    expect((await request(app).get(`${API}/audit-log`)).status).toBe(401)
    expect((await list(ownerA)).status).toBe(200)
  })

  it('lists the clinic’s entries newest first with names, and nothing of another clinic', async () => {
    const res = await list(ownerA, '?pageSize=100')
    expect(res.status).toBe(200)
    const rows = res.body.items as Row[]
    expect(res.body.total).toBeGreaterThanOrEqual(rows.length)
    expect(actions(rows)).toEqual(
      expect.arrayContaining(['patient.created', 'patient.viewed', 'episode.started', 'episode.viewed']),
    )
    const times = rows.map((r) => r.at)
    expect([...times].sort().reverse()).toEqual(times)

    const created = rows.find((r) => r.action === 'patient.created')!
    expect(created.user).toEqual({ id: frontId, fullName: 'Staff afront' })
    expect(created.branch).toEqual({ id: branchA, name: 'AA Main' })
    expect(created.patient).toEqual({ id: patientId, fullName: 'Audit Subject' })

    const other = await list(ownerB, '?pageSize=100')
    expect(actions(other.body.items as Row[])).not.toContain('patient.created')
    expect((other.body.items as Row[]).some((r) => r.targetId === patientId)).toBe(false)
  })

  it('filters by user, action (exact or group) and branch', async () => {
    const byUser = (await list(ownerA, `?userId=${frontId}&pageSize=100`)).body.items as Row[]
    expect(byUser.length).toBeGreaterThan(0)
    expect(byUser.every((r) => r.user?.id === frontId)).toBe(true)

    const exact = (await list(ownerA, '?action=episode.started')).body.items as Row[]
    expect(actions(exact)).toEqual(['episode.started'])

    const group = (await list(ownerA, '?action=episode.&pageSize=100')).body.items as Row[]
    expect(new Set(actions(group))).toEqual(new Set(['episode.started', 'episode.viewed']))

    const byBranch = (await list(ownerA, `?branchId=${branchA}&pageSize=100`)).body.items as Row[]
    expect(byBranch.every((r) => r.branch?.id === branchA)).toBe(true)

    // Another clinic's branch matches nothing here.
    const foreign = await list(ownerB, `?branchId=${branchA}`)
    expect(foreign.body.total).toBe(0)
  })

  it('finds every record about a patient, including those that target the episode', async () => {
    const res = await list(ownerA, `?patientId=${patientId}&pageSize=100`)
    const rows = res.body.items as Row[]
    expect(new Set(actions(rows))).toEqual(
      new Set(['patient.created', 'patient.viewed', 'episode.started', 'episode.viewed']),
    )
    expect(rows.find((r) => r.action === 'episode.viewed')!.targetId).toBe(episodeId)

    const foreign = await list(ownerB, `?patientId=${patientId}`)
    expect(foreign.body.total).toBe(0)
  })

  it('filters by India-time dates and pages', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
    const inRange = await list(ownerA, `?from=${today}&to=${today}`)
    expect(inRange.body.total).toBeGreaterThan(0)
    const past = await list(ownerA, '?from=2020-01-01&to=2020-01-31')
    expect(past.body.total).toBe(0)

    const first = await list(ownerA, '?pageSize=2&page=1')
    const second = await list(ownerA, '?pageSize=2&page=2')
    expect(first.body.items).toHaveLength(2)
    const firstIds = (first.body.items as Row[]).map((r) => r.id)
    expect((second.body.items as Row[]).some((r) => firstIds.includes(r.id))).toBe(false)
  })

  it('refuses bad filters with per-field messages', async () => {
    const res = await list(ownerA, '?from=2026-05-02&to=2026-05-01&userId=nope&action=DROP%20TABLE')
    expect(res.status).toBe(422)
    const fields = (res.body.error.fields as { field: string }[]).map((f) => f.field)
    expect(fields).toEqual(expect.arrayContaining(['to', 'userId', 'action']))
  })

  it('has no write endpoint', async () => {
    expect((await post(ownerA, '/audit-log', {})).status).toBe(404)
    const row = (await list(ownerA, '?pageSize=1')).body.items[0] as Row
    expect((await ownerA.agent.delete(`${API}/audit-log/${row.id}`).set('X-CSRF-Token', ownerA.csrf)).status).toBe(404)
  })
})
