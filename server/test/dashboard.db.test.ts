import { PrismaPg } from '@prisma/adapter-pg'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { setEmailSender } from '../src/lib/email/index.js'
import { addAndSignInStaff, API, captureEmail, post, registerClinic, type Session } from './helpers/clinic.js'

/**
 * Owner dashboard (REP-001, US-26) end to end against TEST_DATABASE_URL, with a second clinic to prove isolation
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

const put = (s: Session, path: string, body: object) =>
  s.agent.put(`${API}${path}`).set('X-CSRF-Token', s.csrf).send(body)
const keyed = (s: Session, path: string, body: object) =>
  s.agent.post(`${API}${path}`).set('X-CSRF-Token', s.csrf).set('Idempotency-Key', randomUUID()).send(body)

describe.skipIf(!url)('owner dashboard', () => {
  let root: PrismaClient
  const app = createApp()
  const run = randomUUID().slice(0, 8)
  const mail = captureEmail()
  const env = { app, run, last: mail.last }

  let ownerA: Session
  let ownerB: Session
  let branch1: string
  let branch2: string
  let front1: Session
  let front2: Session
  let physio: Session
  let counter = 0
  let patients: { p1: string; p2: string; p3: string; p4: string }

  const freshPhone = () => `96${String(20_000_000 + run.charCodeAt(0) * 1000 + ++counter).padStart(8, '0')}`
  const newPatient = async (name: string) => {
    const res = await post(front1, '/patients?confirmDuplicate=true', {
      fullName: name,
      phone: freshPhone(),
      age: 38,
      gender: 'male',
    })
    expect(res.status).toBe(201)
    return res.body.id as string
  }
  const withEpisode = async (name: string) => {
    const id = await newPatient(name)
    expect((await post(physio, `/patients/${id}/episodes`)).status).toBe(201)
    return id
  }
  const today = (s: Session, query = '') => s.agent.get(`${API}/dashboard/today${query}`)

  beforeAll(async () => {
    root = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) })
    const a = await registerClinic(env, 'DA', 'DA1')
    const b = await registerClinic(env, 'DB', 'DB1')
    ownerA = a.owner
    branch1 = a.branchId
    ownerB = b.owner
    branch2 = (await post(ownerA, '/branches', { name: 'DA Second', code: 'DA2' })).body.id as string
    front1 = await addAndSignInStaff(env, ownerA, 'dfront1', 'receptionist', branch1)
    front2 = await addAndSignInStaff(env, ownerA, 'dfront2', 'receptionist', branch2)
    physio = await addAndSignInStaff(env, ownerA, 'dphysio', 'physiotherapist', branch1)
    expect((await put(ownerA, '/clinic/fee', { defaultFee: '500' })).status).toBe(200)

    // Ahead of any activity the day is empty.
    const quiet = await today(ownerA)
    expect(quiet.body).toMatchObject({ patientsSeen: 0, sessions: 0, newPatients: 0 })

    patients = {
      p1: await withEpisode('Dash One'),
      p2: await withEpisode('Dash Two'),
      p3: await withEpisode('Dash Three'),
      p4: await newPatient('Dash Four'),
    }
    // p1 is seen at branch 1 and p2 at branch 2; p3's visit is entered and then reversed.
    expect((await keyed(front1, '/visits', { patientId: patients.p1 })).status).toBe(201)
    expect((await keyed(front2, '/visits', { patientId: patients.p2 })).status).toBe(201)
    const wrong = await keyed(front1, '/visits', { patientId: patients.p3 })
    expect(wrong.status).toBe(201)
    const reversedVisit = await keyed(ownerA, `/visits/${wrong.body.visit.id as string}/reverse`, {
      reason: 'Marked by mistake',
    })
    expect(reversedVisit.status).toBe(201)

    // Payments: p1 300 cash, p2 200 UPI (both at branch 1), p3 100 cash that is then reversed, p4 150 advance of which 50 is refunded.
    expect((await keyed(front1, '/payments', { patientId: patients.p1, amount: '300', method: 'cash' })).status).toBe(
      201,
    )
    expect((await keyed(front1, '/payments', { patientId: patients.p2, amount: '200', method: 'upi' })).status).toBe(
      201,
    )
    const mistaken = await keyed(front1, '/payments', { patientId: patients.p3, amount: '100', method: 'cash' })
    expect(mistaken.status).toBe(201)
    expect(
      (await keyed(ownerA, `/ledger-entries/${mistaken.body.entry.id as string}/reverse`, { reason: 'Wrong patient' }))
        .status,
    ).toBe(201)
    expect((await keyed(front1, '/payments', { patientId: patients.p4, amount: '150', method: 'cash' })).status).toBe(
      201,
    )
    expect(
      (
        await keyed(ownerA, '/refunds', {
          patientId: patients.p4,
          amount: '50',
          method: 'cash',
          reason: 'Stopped treatment',
          branchId: branch1,
        })
      ).status,
    ).toBe(201)
  })

  afterAll(async () => {
    setEmailSender(undefined)
    const tenants = await root.tenant.findMany({ where: { name: { endsWith: ` ${run}` } }, select: { id: true } })
    const ids = tenants.map((t) => t.id)
    // Money, visits and clinical history refuse UPDATE and DELETE by design; lift that only to clean up this run's data.
    const guarded = [
      'assessment',
      'treatment_plan',
      'visit',
      'session_note',
      'fee_setting',
      'ledger_entry',
      'billing_document',
    ]
    for (const table of guarded) await root.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER USER`)
    try {
      await root.idempotencyKey.deleteMany({ where: { tenantId: { in: ids } } })
      await root.billingDocument.deleteMany({ where: { tenantId: { in: ids } } })
      await root.ledgerEntry.deleteMany({ where: { tenantId: { in: ids }, entryType: 'REVERSAL' } })
      await root.ledgerEntry.deleteMany({ where: { tenantId: { in: ids } } })
      await root.sessionNote.deleteMany({ where: { tenantId: { in: ids } } })
      await root.visit.deleteMany({ where: { tenantId: { in: ids } } })
      await root.feeSetting.deleteMany({ where: { tenantId: { in: ids } } })
      await root.numberSequence.deleteMany({ where: { tenantId: { in: ids } } })
      await root.assessment.deleteMany({ where: { tenantId: { in: ids } } })
      await root.treatmentPlan.deleteMany({ where: { tenantId: { in: ids } } })
    } finally {
      for (const table of guarded) await root.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER USER`)
    }
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

  it('is for people holding report.view: the owner only by default', async () => {
    expect((await today(front1)).status).toBe(403)
    expect((await today(physio)).status).toBe(403)
    expect((await request(app).get(`${API}/dashboard/today`)).status).toBe(401)
    expect((await today(ownerA)).status).toBe(200)
  })

  it('counts patients seen, leaving out a visit whose charge was reversed', async () => {
    const res = await today(ownerA)
    expect(res.body).toMatchObject({ branchId: null, patientsSeen: 2, sessions: 2, newPatients: 4 })
    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('shows collections net of reversals and refunds, each shown separately (US-26.2)', async () => {
    const { collections } = (await today(ownerA)).body
    // Received 300 + 200 + 100 + 150, of which 100 was reversed and 50 refunded.
    expect(collections).toMatchObject({ net: '600.00', payments: '750.00', reversed: '100.00', refunded: '50.00' })
    const byMethod = Object.fromEntries(
      (collections.byMethod as { method: string; amount: string }[]).map((m) => [m.method, m.amount]),
    )
    expect(byMethod).toEqual({ cash: '400.00', upi: '200.00', card: '0.00', bank_transfer: '0.00' })
  })

  it('totals what patients owe, leaving out credit, and lists the largest first', async () => {
    const { dues } = (await today(ownerA)).body
    // p1 owes 500 - 300, p2 owes 500 - 200, p3 nets to nothing, p4 is 100 in credit.
    expect(dues).toMatchObject({ total: '500.00', patients: 2 })
    expect(dues.top).toEqual([
      { patientId: patients.p2, fullName: 'Dash Two', amount: '300.00' },
      { patientId: patients.p1, fullName: 'Dash One', amount: '200.00' },
    ])
  })

  it('splits by branch when looking at every branch, and the rows add up (US-26.3)', async () => {
    const { byBranch, patientsSeen, collections } = (await today(ownerA)).body
    const rows = byBranch as { branchId: string; patientsSeen: number; sessions: number; collected: string }[]
    const one = rows.find((r) => r.branchId === branch1)!
    const two = rows.find((r) => r.branchId === branch2)!
    expect(one).toMatchObject({ patientsSeen: 1, sessions: 1, collected: '600.00' })
    expect(two).toMatchObject({ patientsSeen: 1, sessions: 1, collected: '0.00' })
    expect(rows.reduce((sum, r) => sum + r.patientsSeen, 0)).toBe(patientsSeen)
    expect(rows.reduce((sum, r) => sum + Number(r.collected), 0)).toBe(Number(collections.net))
  })

  it('narrows to one branch and then has no split', async () => {
    const two = (await today(ownerA, `?branchId=${branch2}`)).body
    expect(two).toMatchObject({ branchId: branch2, patientsSeen: 1, sessions: 1, byBranch: null })
    expect(two.collections.net).toBe('0.00')
    const one = (await today(ownerA, `?branchId=${branch1}`)).body
    expect(one).toMatchObject({ patientsSeen: 1, sessions: 1, newPatients: 4 })
    expect(one.collections.net).toBe('600.00')
    // Dues follow the branch the patient was registered at (the account belongs to the patient, BILL-008).
    expect(one.dues.total).toBe('500.00')
    expect(two.dues).toMatchObject({ total: '0.00', patients: 0 })
  })

  it('refuses a malformed branch id', async () => {
    expect((await today(ownerA, '?branchId=nope')).status).toBe(422)
  })

  it('shows another clinic nothing of this one (SEC-001)', async () => {
    const own = (await today(ownerB)).body
    expect(own).toMatchObject({ patientsSeen: 0, sessions: 0, newPatients: 0 })
    expect(own.collections.net).toBe('0.00')
    expect(own.dues).toMatchObject({ total: '0.00', patients: 0, top: [] })
    // A branch of the first clinic matches nothing here.
    const foreign = (await today(ownerB, `?branchId=${branch1}`)).body
    expect(foreign).toMatchObject({ patientsSeen: 0, sessions: 0 })
    expect(foreign.collections.net).toBe('0.00')
  })
})
