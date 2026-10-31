import { PrismaPg } from '@prisma/adapter-pg'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { setEmailSender } from '../src/lib/email/index.js'
import { addAndSignInStaff, API, captureEmail, post, registerClinic, type Session } from './helpers/clinic.js'

/**
 * Visits and billing (VIS-001 to VIS-003, BILL-001 to BILL-008) end to end against TEST_DATABASE_URL, with a second
 * clinic to prove isolation (SEC-001). Skipped without it. Everything the run creates is removed afterwards.
 * Test data only (PRD REG-2).
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
const keyed = (s: Session, path: string, body: object, key: string = randomUUID()) =>
  s.agent.post(`${API}${path}`).set('X-CSRF-Token', s.csrf).set('Idempotency-Key', key).send(body)

/** A calendar day in India as YYYY-MM-DD, `offsetDays` from today. */
const indiaDay = (offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offsetDays * 86_400_000))

describe.skipIf(!url)('visits and billing', () => {
  let root: PrismaClient
  const app = createApp()
  const run = randomUUID().slice(0, 8)
  const mail = captureEmail()
  const env = { app, run, last: mail.last }

  let ownerA: Session
  let ownerB: Session
  let branch1: string
  let branch2: string
  let front1: Session // receptionist at branch 1: visit.mark, payment.record, ledger.view, document.issue
  let front2: Session // receptionist at branch 2
  let physio1: Session // visit.mark, clinical.edit, episode.manage; no money permissions
  let physio1Id: string
  let counter = 0

  const freshPhone = () => `97${String(30_000_000 + run.charCodeAt(0) * 1000 + ++counter).padStart(8, '0')}`
  const NAMES = ['Ishaan Rao', 'Jaya Menon', 'Kabir Anand', 'Leela Dutt', 'Manav Joshi', 'Nisha Bhat', 'Omkar Pillai']
  const newPatient = async () => {
    const res = await post(front1, '/patients?confirmDuplicate=true', {
      fullName: NAMES[counter % NAMES.length],
      phone: freshPhone(),
      age: 35,
      gender: 'female',
    })
    expect(res.status).toBe(201)
    return res.body.id as string
  }
  /** A patient with an active episode, started by the physiotherapist. */
  const patientWithEpisode = async () => {
    const patientId = await newPatient()
    const res = await post(physio1, `/patients/${patientId}/episodes`)
    expect(res.status).toBe(201)
    return { patientId, episodeId: res.body.id as string }
  }
  const attend = (s: Session, patientId: string, extra: object = {}) => keyed(s, '/visits', { patientId, ...extra })
  const pay = (s: Session, patientId: string, amount: string | number, extra: object = {}) =>
    keyed(s, '/payments', { patientId, amount, method: 'cash', ...extra })
  const balanceOf = async (s: Session, patientId: string) =>
    (await s.agent.get(`${API}/patients/${patientId}`)).body.balance as { amount: string; state: string }
  const seqOf = (receipt: string) => Number(/(\d+)$/.exec(receipt)![1])

  beforeAll(async () => {
    root = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) })
    const a = await registerClinic(env, 'VA', 'VA1')
    const b = await registerClinic(env, 'VB', 'VB1')
    ownerA = a.owner
    branch1 = a.branchId
    ownerB = b.owner
    branch2 = (await post(ownerA, '/branches', { name: 'VA Second', code: 'VA2' })).body.id as string
    front1 = await addAndSignInStaff(env, ownerA, 'vfront1', 'receptionist', branch1)
    front2 = await addAndSignInStaff(env, ownerA, 'vfront2', 'receptionist', branch2)
    physio1 = await addAndSignInStaff(env, ownerA, 'vphysio1', 'physiotherapist', branch1)
    physio1Id = (await physio1.agent.get(`${API}/auth/me`)).body.id as string
    expect((await put(ownerA, '/clinic/fee', { defaultFee: '500' })).status).toBe(200)
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
      // A reversal points at its original, so reversals go first.
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

  describe('default fee (BILL-001)', () => {
    it('lets the owner set it and any attendance marker read it', async () => {
      const read = await front1.agent.get(`${API}/clinic/fee`)
      expect(read.status).toBe(200)
      expect(read.body).toMatchObject({ defaultFee: '500.00', isSet: true })
      expect((await put(front1, '/clinic/fee', { defaultFee: '700' })).status).toBe(403)
      expect((await put(ownerA, '/clinic/fee', { defaultFee: 'abc' })).status).toBe(422)
    })

    it('applies a change to future visits only (BR-BILL-1)', async () => {
      const { patientId } = await patientWithEpisode()
      const before = await attend(front1, patientId)
      expect(before.body.visit.fee).toBe('500.00')
      expect((await put(ownerA, '/clinic/fee', { defaultFee: '600' })).status).toBe(200)
      try {
        const after = await attend(front1, patientId, { confirmSecondVisitToday: true })
        expect(after.body.visit.fee).toBe('600.00')
        const history = await front1.agent.get(`${API}/patients/${patientId}/visits`)
        const fees = (history.body.items as { fee: string }[]).map((v) => v.fee).sort()
        expect(fees).toEqual(['500.00', '600.00'])
      } finally {
        await put(ownerA, '/clinic/fee', { defaultFee: '500' })
      }
    })
  })

  describe('marking attendance (VIS-001)', () => {
    it('needs an active episode (CLN-001)', async () => {
      const patientId = await newPatient()
      const res = await attend(front1, patientId)
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('NO_ACTIVE_EPISODE')
    })

    it('creates the visit and its charge together with the fee stored (BR-BILL-1)', async () => {
      const { patientId, episodeId } = await patientWithEpisode()
      const res = await attend(front1, patientId, { therapistId: physio1Id })
      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({
        sessionNumber: 1,
        balanceAfter: { amount: '500.00', state: 'due' },
        duesWarning: null,
        visit: { fee: '500.00', therapistName: expect.any(String), reversed: false, episodeId },
      })
      expect(await balanceOf(front1, patientId)).toEqual({ amount: '500.00', state: 'due' })
      const charges = await root.ledgerEntry.findMany({ where: { visitId: res.body.visit.id } })
      expect(charges).toHaveLength(1)
      expect(charges[0]).toMatchObject({ entryType: 'CHARGE', branchId: branch1 })
      expect(
        await root.auditLog.findFirst({ where: { action: 'visit.marked', targetId: res.body.visit.id } }),
      ).toMatchObject({
        userId: expect.any(String),
        branchId: branch1,
      })
    })

    it('asks before a second visit on the same day, then warns about dues without blocking (BR-VIS-4)', async () => {
      const { patientId } = await patientWithEpisode()
      await attend(front1, patientId)
      const again = await attend(front1, patientId)
      expect(again.status).toBe(409)
      expect(again.body.error.code).toBe('DUPLICATE_VISIT_TODAY')
      const confirmed = await attend(front1, patientId, { confirmSecondVisitToday: true })
      expect(confirmed.status).toBe(201)
      expect(confirmed.body).toMatchObject({ sessionNumber: 2, duesWarning: { amount: '500.00' } })
    })

    it('counts a visit at another branch against the same account (BILL-008)', async () => {
      const { patientId } = await patientWithEpisode()
      await attend(front1, patientId)
      const other = await attend(front2, patientId, { confirmSecondVisitToday: true })
      expect(other.status).toBe(201)
      expect(other.body.visit).toMatchObject({ branchId: branch2 })
      expect(other.body.duesWarning).toEqual({ amount: '500.00' })
      expect(await balanceOf(front1, patientId)).toEqual({ amount: '1000.00', state: 'due' })
    })

    it('lets only a permitted user change the fee, and only with a reason (BILL-001)', async () => {
      const { patientId } = await patientWithEpisode()
      const override = { feeOverride: { amount: '300', reason: 'Staff discount' } }
      expect((await attend(front1, patientId, override)).status).toBe(403)
      expect((await attend(physio1, patientId, override)).status).toBe(403)
      const noReason = await attend(ownerA, patientId, { feeOverride: { amount: '300', reason: ' ' } })
      expect(noReason.status).toBe(422)
      expect(noReason.body.error.code).toBe('FEE_REASON_REQUIRED')
      const ok = await attend(ownerA, patientId, override)
      expect(ok.status).toBe(201)
      expect(ok.body.visit).toMatchObject({ fee: '300.00', feeOverrideReason: 'Staff discount' })
      const audit = await root.auditLog.findFirst({
        where: { action: 'visit.fee_overridden', targetId: ok.body.visit.id },
      })
      expect(audit?.details).toMatchObject({ defaultFee: '500.00', fee: '300.00', reason: 'Staff discount' })
    })

    it('needs no reason when the "override" equals the default fee', async () => {
      const { patientId } = await patientWithEpisode()
      const res = await attend(ownerA, patientId, { feeOverride: { amount: '500', reason: '' } })
      expect(res.status).toBe(201)
      expect(res.body.visit.feeOverrideReason).toBeNull()
    })

    it('shows plan progress and the exceeded notice (CLN-003, BR-CLN-6)', async () => {
      const { patientId, episodeId } = await patientWithEpisode()
      expect(
        (await post(physio1, `/episodes/${episodeId}/treatment-plans`, { goals: 'Walk', plannedSessions: 1 })).status,
      ).toBe(201)
      const first = await attend(front1, patientId)
      expect(first.body.planProgress).toEqual({ planned: 1, planExceeded: false })
      const second = await attend(front1, patientId, { confirmSecondVisitToday: true })
      expect(second.body).toMatchObject({ sessionNumber: 2, planProgress: { planned: 1, planExceeded: true } })
      const episode = await physio1.agent.get(`${API}/episodes/${episodeId}`)
      expect(episode.body).toMatchObject({
        sessionCount: 2,
        progress: { sessionsDone: 2, plannedSessions: 1, exceeded: true },
      })
    })

    it('hides money from a user without ledger.view', async () => {
      const { patientId } = await patientWithEpisode()
      const res = await attend(physio1, patientId)
      expect(res.status).toBe(201)
      expect(res.body.balanceAfter).toBeNull()
      expect(res.body.duesWarning).toBeNull()
      expect((await physio1.agent.get(`${API}/patients/${patientId}/ledger`)).status).toBe(403)
      expect((await physio1.agent.get(`${API}/patients/${patientId}`)).body.balance).toBeNull()
    })

    it('is idempotent: the same key twice is one visit and one charge (US-17.6)', async () => {
      const { patientId } = await patientWithEpisode()
      const key = randomUUID()
      const first = await keyed(front1, '/visits', { patientId }, key)
      const second = await keyed(front1, '/visits', { patientId }, key)
      expect(first.status).toBe(201)
      expect(second.status).toBe(201)
      expect(second.headers['idempotent-replay']).toBe('true')
      expect(second.body.visit.id).toBe(first.body.visit.id)
      expect(await root.visit.count({ where: { patientId } })).toBe(1)
      expect(await root.ledgerEntry.count({ where: { patientId } })).toBe(1)
      const clash = await keyed(front1, '/visits', { patientId, therapistId: physio1Id }, key)
      expect(clash.status).toBe(422)
      expect(clash.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED')
    })

    it('does not keep a failed attempt, so the user can correct and retry with the same key', async () => {
      const { patientId } = await patientWithEpisode()
      await attend(front1, patientId)
      const key = randomUUID()
      expect((await keyed(front1, '/visits', { patientId }, key)).status).toBe(409)
      const retry = await keyed(front1, '/visits', { patientId, confirmSecondVisitToday: true }, key)
      // A different body under the same key is refused only when the first attempt was kept; a failure is not.
      expect(retry.status).toBe(201)
    })

    it("lists today's visits for the staff member's own branch only (VIS-001)", async () => {
      const { patientId } = await patientWithEpisode()
      const marked = await attend(front1, patientId)
      const list1 = await front1.agent.get(`${API}/visits/today`)
      expect(list1.status).toBe(200)
      const ids1 = (list1.body.items as { id: string }[]).map((v) => v.id)
      expect(ids1).toContain(marked.body.visit.id)
      const list2 = await front2.agent.get(`${API}/visits/today`)
      expect((list2.body.items as { id: string }[]).map((v) => v.id)).not.toContain(marked.body.visit.id)
      const ownerAll = await ownerA.agent.get(`${API}/visits/today`)
      expect((ownerAll.body.items as { id: string }[]).map((v) => v.id)).toContain(marked.body.visit.id)
      const row = (list1.body.items as { id: string; patientName: string; balance: unknown }[]).find(
        (v) => v.id === marked.body.visit.id,
      )
      expect(row).toMatchObject({ patientName: expect.any(String), balance: { state: 'due' } })
    })

    it('shows the last visit on the patient list (PAT-002)', async () => {
      const { patientId } = await patientWithEpisode()
      await attend(front1, patientId)
      const phone = (await front1.agent.get(`${API}/patients/${patientId}`)).body.phone as string
      const list = await front1.agent.get(`${API}/patients?q=${phone}`)
      const row = (
        list.body.items as {
          id: string
          lastVisitAt: string | null
          lastVisitBranch: string | null
          balance: { state: string }
        }[]
      ).find((p) => p.id === patientId)
      expect(row?.lastVisitAt).not.toBeNull()
      expect(row?.lastVisitBranch).toBe('VA Main')
      expect(row?.balance.state).toBe('due')
    })
  })

  describe('session notes (VIS-002)', () => {
    it('versions a note and leaves the earlier ones readable', async () => {
      const { patientId } = await patientWithEpisode()
      const visit = (await attend(front1, patientId)).body.visit.id as string
      const v1 = await post(physio1, `/visits/${visit}/notes`, { noteText: 'Ultrasound 10 min' })
      expect(v1.status).toBe(201)
      expect(v1.body.version).toBe(1)
      const same = await post(physio1, `/visits/${visit}/notes`, { noteText: 'Ultrasound 10 min' })
      expect(same.status).toBe(200)
      expect(same.body.version).toBe(1)
      const v2 = await post(physio1, `/visits/${visit}/notes`, { noteText: 'Ultrasound 15 min' })
      expect(v2.status).toBe(201)
      expect(v2.body.version).toBe(2)
      const list = await physio1.agent.get(`${API}/visits/${visit}/notes`)
      expect((list.body.items as { version: number }[]).map((n) => n.version)).toEqual([2, 1])
      expect((await post(front1, `/visits/${visit}/notes`, { noteText: 'x' })).status).toBe(403)
      expect((await post(physio1, `/visits/${visit}/notes`, { noteText: '  ' })).status).toBe(422)
    })
  })

  describe('payments and receipts (BILL-003, BILL-006)', () => {
    it('records a payment with a numbered receipt and a new balance', async () => {
      const { patientId } = await patientWithEpisode()
      await attend(front1, patientId)
      const res = await pay(front1, patientId, '200', { method: 'upi', reference: 'UPI123' })
      expect(res.status).toBe(201)
      expect(res.body.receipt.number).toMatch(/^VA1\/\d{4}-\d{2}\/\d{4}$/)
      expect(res.body.balanceAfter).toEqual({ amount: '300.00', state: 'due' })
      expect(res.body.entry).toMatchObject({ type: 'PAYMENT', amount: '200.00', method: 'upi', reference: 'UPI123' })
      expect(await balanceOf(front1, patientId)).toEqual({ amount: '300.00', state: 'due' })
    })

    it('takes an advance and shows it as credit (BILL-002)', async () => {
      const patientId = await newPatient()
      const res = await pay(front1, patientId, 2500)
      expect(res.status).toBe(201)
      expect(res.body.balanceAfter).toEqual({ amount: '2500.00', state: 'credit' })
    })

    it('refuses bad amounts and a bank transfer without a reference', async () => {
      const patientId = await newPatient()
      for (const amount of ['0', '-5', '12.345', 'abc', '']) {
        expect((await pay(front1, patientId, amount)).status, `amount ${amount}`).toBe(422)
      }
      const noRef = await pay(front1, patientId, '100', { method: 'bank_transfer' })
      expect(noRef.status).toBe(422)
      expect(noRef.body.error.fields[0].field).toBe('reference')
      expect((await pay(front1, patientId, '100', { method: 'bitcoin' })).status).toBe(422)
    })

    it('is idempotent: a repeated key returns the first receipt and creates no second entry (US-14.8)', async () => {
      const patientId = await newPatient()
      const key = randomUUID()
      const first = await keyed(front1, '/payments', { patientId, amount: '100', method: 'cash' }, key)
      const second = await keyed(front1, '/payments', { patientId, amount: '100', method: 'cash' }, key)
      expect(second.status).toBe(201)
      expect(second.headers['idempotent-replay']).toBe('true')
      expect(second.body.receipt).toEqual(first.body.receipt)
      expect(await root.ledgerEntry.count({ where: { patientId, entryType: 'PAYMENT' } })).toBe(1)
    })

    it('numbers receipts per branch without duplicates or gaps, even when sent together (BR-BILL-17, BR-BILL-18)', async () => {
      const patientId = await newPatient()
      const before = await pay(front1, patientId, '10')
      const start = seqOf(before.body.receipt.number)
      const results = await Promise.all(Array.from({ length: 6 }, () => pay(front1, patientId, '10')))
      expect(results.map((r) => r.status)).toEqual(results.map(() => 201))
      const seqs = results.map((r) => seqOf(r.body.receipt.number)).sort((a, b) => a - b)
      expect(seqs).toEqual(Array.from({ length: 6 }, (_, i) => start + 1 + i))
      // The second branch has its own series with its own code.
      const other = await pay(front2, patientId, '10')
      expect(other.body.receipt.number).toMatch(/^VA2\//)
    })

    it('keeps a failed save from burning a receipt number', async () => {
      const patientId = await newPatient()
      const ok = await pay(front1, patientId, '10')
      const failed = await pay(front1, randomUUID(), '10')
      expect(failed.status).toBe(404)
      const next = await pay(front1, patientId, '10')
      expect(seqOf(next.body.receipt.number)).toBe(seqOf(ok.body.receipt.number) + 1)
    })

    it('lets only the owner back-date a payment, into the right financial year (A-10)', async () => {
      const patientId = await newPatient()
      const date = indiaDay(-1)
      expect((await pay(front1, patientId, '50', { date })).status).toBe(403)
      expect((await pay(ownerA, patientId, '50', { date: indiaDay(3) })).status).toBe(422)
      const old = await pay(ownerA, patientId, '50', { date: '2025-06-15', branchId: branch1 })
      expect(old.status).toBe(201)
      expect(old.body.receipt.number).toMatch(/^VA1\/2025-26\/\d{4}$/)
    })

    it('serves the receipt as a PDF and marks a reprint as a duplicate copy', async () => {
      const patientId = await newPatient()
      const paid = await pay(front1, patientId, '250')
      const first = await front1.agent
        .get(`${API}/documents/${paid.body.receipt.id}/pdf`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => cb(null, Buffer.concat(chunks)))
        })
      expect(first.status).toBe(200)
      expect(first.headers['content-type']).toContain('application/pdf')
      expect((first.body as Buffer).subarray(0, 4).toString()).toBe('%PDF')
      await front1.agent.get(`${API}/documents/${paid.body.receipt.id}/pdf`).buffer(true)
      const prints = await root.auditLog.findMany({
        where: { action: 'document.printed', targetId: paid.body.receipt.id },
        orderBy: { createdAt: 'asc' },
      })
      expect(prints.map((p) => (p.details as { duplicate: boolean }).duplicate)).toEqual([false, true])
      const docs = await front1.agent.get(`${API}/patients/${patientId}/documents`)
      expect(docs.body.items).toHaveLength(1)
      expect(docs.body.items[0]).toMatchObject({ type: 'RECEIPT', number: paid.body.receipt.number, amount: '250.00' })
    })

    it('locks the branch code once a receipt exists (BR-TEN-2)', async () => {
      const list = await ownerA.agent.get(`${API}/branches`)
      const row = (list.body.branches as { id: string; codeLocked: boolean }[]).find((b) => b.id === branch1)
      expect(row?.codeLocked).toBe(true)
      const res = await ownerA.agent
        .patch(`${API}/branches/${branch1}`)
        .set('X-CSRF-Token', ownerA.csrf)
        .send({ code: 'ZZ9' })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('BRANCH_CODE_LOCKED')
    })
  })

  describe('refunds (BILL-004)', () => {
    it('refunds advance credit but never more than is held (BR-BILL-12)', async () => {
      const patientId = await newPatient()
      await pay(front1, patientId, '1000')
      const refund = (amount: string, s: Session = ownerA) =>
        keyed(s, '/refunds', { patientId, amount, method: 'cash', reason: 'Stopped treatment' })
      expect((await refund('100', front1)).status).toBe(403)
      const tooMuch = await refund('1500')
      expect(tooMuch.status).toBe(409)
      expect(tooMuch.body.error.code).toBe('REFUND_EXCEEDS_CREDIT')
      const ok = await refund('400')
      expect(ok.status).toBe(201)
      expect(ok.body.balanceAfter).toEqual({ amount: '600.00', state: 'credit' })
      expect((await keyed(ownerA, '/refunds', { patientId, amount: '100', method: 'cash', reason: '' })).status).toBe(
        422,
      )
    })

    it('cannot refund dues, only credit', async () => {
      const { patientId } = await patientWithEpisode()
      await attend(front1, patientId)
      const res = await keyed(ownerA, '/refunds', { patientId, amount: '100', method: 'cash', reason: 'Mistake' })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('REFUND_EXCEEDS_CREDIT')
    })

    it('lets only one of two simultaneous refunds spend the same credit', async () => {
      const patientId = await newPatient()
      await pay(front1, patientId, '500')
      const body = { patientId, amount: '500', method: 'cash', reason: 'Stopped treatment' }
      const [a, b] = await Promise.all([keyed(ownerA, '/refunds', body), keyed(ownerA, '/refunds', body)])
      expect([a.status, b.status].sort()).toEqual([201, 409])
      expect(await balanceOf(ownerA, patientId)).toEqual({ amount: '0.00', state: 'zero' })
    })
  })

  describe('reversals (BILL-005)', () => {
    it('reverses a wrong attendance and keeps both entries visible', async () => {
      const { patientId, episodeId } = await patientWithEpisode()
      const visit = (await attend(front1, patientId)).body.visit.id as string
      expect((await keyed(front1, `/visits/${visit}/reverse`, { reason: 'Marked by mistake' })).status).toBe(403)
      expect((await keyed(ownerA, `/visits/${visit}/reverse`, { reason: '' })).status).toBe(422)
      const res = await keyed(ownerA, `/visits/${visit}/reverse`, { reason: 'Marked by mistake' })
      expect(res.status).toBe(201)
      expect(res.body.balanceAfter).toEqual({ amount: '0.00', state: 'zero' })
      expect(res.body.reversalReceipt).toBeNull()

      const visits = await front1.agent.get(`${API}/patients/${patientId}/visits`)
      expect(visits.body.items[0]).toMatchObject({ id: visit, reversed: true })
      const ledger = await front1.agent.get(`${API}/patients/${patientId}/ledger`)
      const types = (ledger.body.items as { type: string }[]).map((e) => e.type).sort()
      expect(types).toEqual(['CHARGE', 'REVERSAL'])
      const charge = (ledger.body.items as { id: string; type: string; reversedByEntryId: string | null }[]).find(
        (e) => e.type === 'CHARGE',
      )
      expect(charge?.reversedByEntryId).toBe(res.body.entry.id)
      // The session no longer counts (ER section 4).
      const episode = await physio1.agent.get(`${API}/episodes/${episodeId}`)
      expect(episode.body.sessionCount).toBe(0)
    })

    it('answers once per entry and never reverses a reversal', async () => {
      const { patientId } = await patientWithEpisode()
      const visit = (await attend(front1, patientId)).body.visit.id as string
      const first = await keyed(ownerA, `/visits/${visit}/reverse`, { reason: 'Wrong patient' })
      const again = await keyed(ownerA, `/visits/${visit}/reverse`, { reason: 'Wrong patient' })
      expect(again.status).toBe(409)
      expect(again.body.error.code).toBe('ALREADY_REVERSED')
      const ofReversal = await keyed(ownerA, `/ledger-entries/${first.body.entry.id}/reverse`, { reason: 'Undo' })
      expect(ofReversal.status).toBe(409)
      expect(ofReversal.body.error.code).toBe('CANNOT_REVERSE_REVERSAL')
    })

    it('lets only one of two simultaneous reversals win', async () => {
      const { patientId } = await patientWithEpisode()
      const visit = (await attend(front1, patientId)).body.visit.id as string
      const [a, b] = await Promise.all([
        keyed(ownerA, `/visits/${visit}/reverse`, { reason: 'Wrong patient' }),
        keyed(ownerA, `/visits/${visit}/reverse`, { reason: 'Wrong patient' }),
      ])
      expect([a.status, b.status].sort()).toEqual([201, 409])
      expect(await balanceOf(ownerA, patientId)).toEqual({ amount: '0.00', state: 'zero' })
    })

    it('reverses a payment with its own reversal receipt and restores the dues', async () => {
      const { patientId } = await patientWithEpisode()
      await attend(front1, patientId)
      const paid = await pay(front1, patientId, '500')
      expect(await balanceOf(front1, patientId)).toEqual({ amount: '0.00', state: 'zero' })
      const res = await keyed(ownerA, `/ledger-entries/${paid.body.entry.id}/reverse`, { reason: 'Wrong amount' })
      expect(res.status).toBe(201)
      expect(res.body.reversalReceipt.number).toMatch(/^VA1\/\d{4}-\d{2}\/R\d{4}$/)
      expect(res.body.reversalReceipt.number).not.toBe(paid.body.receipt.number)
      expect(res.body.balanceAfter).toEqual({ amount: '500.00', state: 'due' })
      // The original receipt is untouched and still listed.
      const docs = await front1.agent.get(`${API}/patients/${patientId}/documents`)
      expect((docs.body.items as { type: string }[]).map((d) => d.type).sort()).toEqual(['RECEIPT', 'REVERSAL_RECEIPT'])
      const pdf = await front1.agent.get(`${API}/documents/${res.body.reversalReceipt.id}/pdf`).buffer(true)
      expect(pdf.status).toBe(200)
    })

    it('keeps staff to entries of their own branch (BR-USR-1)', async () => {
      const patientId = await newPatient()
      const paid = await pay(front1, patientId, '100')
      const receptionistWithReverse = await addAndSignInStaff(env, ownerA, 'vfront3', 'receptionist', branch2)
      const roles = await ownerA.agent.get(`${API}/roles`)
      const role = (roles.body.roles as { id: string; key: string; permissions: string[] }[]).find(
        (r) => r.key === 'receptionist',
      )!
      const granted = await put(ownerA, `/roles/${role.id}/permissions`, {
        permissions: [...role.permissions, 'entry.reverse'],
        confirmWarnings: true,
      })
      expect(granted.status).toBe(200)
      try {
        const denied = await keyed(receptionistWithReverse, `/ledger-entries/${paid.body.entry.id}/reverse`, {
          reason: 'Test',
        })
        expect(denied.status).toBe(403)
        const own = await keyed(front1, `/ledger-entries/${paid.body.entry.id}/reverse`, { reason: 'Test' })
        expect(own.status).toBe(201)
      } finally {
        await put(ownerA, `/roles/${role.id}/permissions`, { permissions: role.permissions, confirmWarnings: true })
      }
    })
  })

  describe('invoices (BILL-007)', () => {
    it('snapshots the sessions of an episode, leaving out reversed ones', async () => {
      const { patientId, episodeId } = await patientWithEpisode()
      await attend(front1, patientId)
      const wrong = (await attend(front1, patientId, { confirmSecondVisitToday: true })).body.visit.id as string
      await keyed(ownerA, `/visits/${wrong}/reverse`, { reason: 'Mistake' })
      const res = await keyed(front1, '/invoices', { patientId, episodeId })
      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ total: '500.00', sessions: 1 })
      expect(res.body.number).toMatch(/^VA1\/\d{4}-\d{2}\/INV\d{4}$/)
      const stored = await root.billingDocument.findUnique({ where: { id: res.body.id } })
      expect(stored?.ledgerEntryId).toBeNull()
      expect(stored?.linesSnapshot).toMatchObject({ total: '500.00', lines: [{ amount: '500.00' }] })
      expect((await front1.agent.get(`${API}/documents/${res.body.id}/pdf`).buffer(true)).status).toBe(200)
    })

    it('needs an episode or a date range and something to invoice', async () => {
      const { patientId } = await patientWithEpisode()
      expect((await keyed(front1, '/invoices', { patientId })).status).toBe(422)
      const empty = await keyed(front1, '/invoices', { patientId, from: indiaDay(-5), to: indiaDay(0) })
      expect(empty.status).toBe(422)
      expect((await keyed(front1, '/invoices', { patientId, from: indiaDay(0), to: indiaDay(-5) })).status).toBe(422)
    })

    it('can invoice a date range', async () => {
      const { patientId } = await patientWithEpisode()
      await attend(front1, patientId)
      const res = await keyed(front1, '/invoices', { patientId, from: indiaDay(-1), to: indiaDay(0) })
      expect(res.status).toBe(201)
      expect(res.body.sessions).toBe(1)
    })
  })

  describe('permissions and isolation (SEC-001, SEC-006)', () => {
    it('keeps the receptionist away from refunds, reversals and fee changes', async () => {
      const patientId = await newPatient()
      const paid = await pay(front1, patientId, '100')
      expect((await keyed(front1, '/refunds', { patientId, amount: '10', method: 'cash', reason: 'x' })).status).toBe(
        403,
      )
      expect((await keyed(front1, `/ledger-entries/${paid.body.entry.id}/reverse`, { reason: 'x' })).status).toBe(403)
      expect((await put(front1, '/clinic/fee', { defaultFee: '1' })).status).toBe(403)
    })

    it('keeps the physiotherapist away from payments and documents', async () => {
      const patientId = await newPatient()
      expect((await pay(physio1, patientId, '100')).status).toBe(403)
      expect((await physio1.agent.get(`${API}/patients/${patientId}/documents`)).status).toBe(403)
    })

    it("answers 404 for another clinic's visits, ledger, documents and patients", async () => {
      const { patientId } = await patientWithEpisode()
      const visit = (await attend(front1, patientId)).body.visit.id as string
      const paid = await pay(front1, patientId, '100')
      expect((await attend(ownerB, patientId)).status).toBe(404)
      expect((await pay(ownerB, patientId, '10')).status).toBe(404)
      expect((await keyed(ownerB, '/refunds', { patientId, amount: '10', method: 'cash', reason: 'x' })).status).toBe(
        404,
      )
      expect((await keyed(ownerB, '/invoices', { patientId, from: indiaDay(-1), to: indiaDay(0) })).status).toBe(404)
      expect((await ownerB.agent.get(`${API}/visits/${visit}`)).status).toBe(404)
      expect((await ownerB.agent.get(`${API}/visits/${visit}/notes`)).status).toBe(404)
      expect((await keyed(ownerB, `/visits/${visit}/reverse`, { reason: 'x' })).status).toBe(404)
      expect((await ownerB.agent.get(`${API}/patients/${patientId}/visits`)).status).toBe(404)
      expect((await ownerB.agent.get(`${API}/patients/${patientId}/ledger`)).status).toBe(404)
      expect((await ownerB.agent.get(`${API}/patients/${patientId}/documents`)).status).toBe(404)
      expect((await ownerB.agent.get(`${API}/ledger-entries/${paid.body.entry.id}`)).status).toBe(404)
      expect((await keyed(ownerB, `/ledger-entries/${paid.body.entry.id}/reverse`, { reason: 'x' })).status).toBe(404)
      expect((await ownerB.agent.get(`${API}/documents/${paid.body.receipt.id}`)).status).toBe(404)
      expect((await ownerB.agent.get(`${API}/documents/${paid.body.receipt.id}/pdf`)).status).toBe(404)
      const today = await ownerB.agent.get(`${API}/visits/today`)
      expect((today.body.items as { id: string }[]).map((v) => v.id)).not.toContain(visit)
    })

    it('does not share an idempotency key between clinics', async () => {
      const key = randomUUID()
      const a = await newPatient()
      const first = await keyed(front1, '/payments', { patientId: a, amount: '10', method: 'cash' }, key)
      expect(first.status).toBe(201)
      // Clinic B using the same key must not replay clinic A's answer.
      const other = await keyed(ownerB, '/payments', { patientId: a, amount: '10', method: 'cash' }, key)
      expect(other.status).toBe(404)
    })
  })

  describe('append-only data (BR-BILL-4, SEC-008)', () => {
    it('refuses to change or remove ledger entries, visits, notes and documents, even for the database owner', async () => {
      const { patientId } = await patientWithEpisode()
      const visit = (await attend(front1, patientId)).body.visit.id as string
      const paid = await pay(front1, patientId, '100')
      await expect(
        root.$executeRaw`UPDATE "ledger_entry" SET "amount" = 1 WHERE "patient_id" = ${patientId}::uuid`,
      ).rejects.toThrow()
      await expect(
        root.$executeRaw`DELETE FROM "ledger_entry" WHERE "patient_id" = ${patientId}::uuid`,
      ).rejects.toThrow()
      await expect(root.$executeRaw`UPDATE "visit" SET "fee_amount" = 1 WHERE "id" = ${visit}::uuid`).rejects.toThrow()
      await expect(
        root.$executeRaw`DELETE FROM "billing_document" WHERE "id" = ${paid.body.receipt.id}::uuid`,
      ).rejects.toThrow()
    })

    it('refuses invalid ledger rows at the database (CON-01 to CON-05)', async () => {
      const { patientId } = await patientWithEpisode()
      const paid = await pay(front1, patientId, '100')
      const base = {
        tenantId: (await root.patient.findUniqueOrThrow({ where: { id: patientId }, select: { tenantId: true } }))
          .tenantId,
        branchId: branch1,
        patientId,
        entryDate: new Date(),
        createdById: physio1Id,
      }
      // Zero-amount payment, negative amount, charge without a visit, payment without a method.
      await expect(
        root.ledgerEntry.create({ data: { ...base, entryType: 'PAYMENT', amount: '0', paymentMethod: 'cash' } }),
      ).rejects.toThrow()
      await expect(root.ledgerEntry.create({ data: { ...base, entryType: 'CHARGE', amount: '-1' } })).rejects.toThrow()
      await expect(root.ledgerEntry.create({ data: { ...base, entryType: 'CHARGE', amount: '10' } })).rejects.toThrow()
      await expect(root.ledgerEntry.create({ data: { ...base, entryType: 'PAYMENT', amount: '10' } })).rejects.toThrow()
      // A reversal of the wrong amount, and a second reversal of the same entry.
      const reversal = { ...base, entryType: 'REVERSAL', reason: 'x', reversesEntryId: paid.body.entry.id }
      await expect(root.ledgerEntry.create({ data: { ...reversal, amount: '99' } })).rejects.toThrow()
      await root.ledgerEntry.create({ data: { ...reversal, amount: '100' } })
      await expect(root.ledgerEntry.create({ data: { ...reversal, amount: '100' } })).rejects.toThrow()
    })
  })
})
