import { PrismaPg } from '@prisma/adapter-pg'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { setEmailSender } from '../src/lib/email/index.js'
import { addAndSignInStaff, API, captureEmail, post, registerClinic, type Session } from './helpers/clinic.js'

/**
 * Clinical (CLN-001 to CLN-004) end to end against TEST_DATABASE_URL, with a second clinic to prove isolation
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

describe.skipIf(!url)('clinical', () => {
  let root: PrismaClient
  const app = createApp()
  const run = randomUUID().slice(0, 8)
  const mail = captureEmail()
  const env = { app, run, last: mail.last }

  let ownerA: Session
  let ownerB: Session
  let branch1: string
  let branch2: string
  let front1: Session // receptionist: clinical.view only
  let physio1: Session
  let physio1Id: string
  let counter = 0

  const freshPhone = () => `97${String(20_000_000 + run.charCodeAt(0) * 1000 + ++counter).padStart(8, '0')}`
  const NAMES = ['Anil Kapoor', 'Bhavna Iyer', 'Chirag Shah', 'Divya Nair', 'Eshaan Verma', 'Farah Khan', 'Gaurav Bedi']
  const newPatient = async (s: Session = front1) => {
    const res = await post(s, '/patients?confirmDuplicate=true', {
      fullName: NAMES[counter % NAMES.length],
      phone: freshPhone(),
      age: 40,
      gender: 'male',
    })
    expect(res.status).toBe(201)
    return res.body.id as string
  }
  const startEpisode = (s: Session, patientId: string, body: object = {}) =>
    post(s, `/patients/${patientId}/episodes`, body)
  /** A patient with an active episode started by the physiotherapist. */
  const patientWithEpisode = async () => {
    const patientId = await newPatient()
    const res = await startEpisode(physio1, patientId)
    expect(res.status).toBe(201)
    return { patientId, episodeId: res.body.id as string }
  }
  const assessment = {
    history: 'Left knee pain for 3 weeks',
    diagnosis: 'Patellofemoral pain',
    extraFields: { painScore: 6 },
  }
  const plan = { goals: 'Pain free stairs', plannedSessions: 10, frequency: '3 times a week', estimatedCost: '5000' }

  beforeAll(async () => {
    root = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) })
    const a = await registerClinic(env, 'CA', 'CA1')
    const b = await registerClinic(env, 'CB', 'CB1')
    ownerA = a.owner
    branch1 = a.branchId
    ownerB = b.owner
    branch2 = (await post(ownerA, '/branches', { name: 'CA Second', code: 'CA2' })).body.id as string
    front1 = await addAndSignInStaff(env, ownerA, 'cfront1', 'receptionist', branch1)
    physio1 = await addAndSignInStaff(env, ownerA, 'cphysio1', 'physiotherapist', branch1)
    physio1Id = (await physio1.agent.get(`${API}/auth/me`)).body.id as string
  })

  afterAll(async () => {
    setEmailSender(undefined)
    const tenants = await root.tenant.findMany({ where: { name: { endsWith: ` ${run}` } }, select: { id: true } })
    const ids = tenants.map((t) => t.id)
    // Clinical history refuses UPDATE and DELETE by design; lift that only to clean up this run's own test data.
    const guarded = ['assessment', 'treatment_plan']
    for (const table of guarded) await root.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER USER`)
    try {
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

  describe('starting an episode (CLN-001, US-25)', () => {
    it("starts an episode at the user's branch and shows it on the patient (US-25.1)", async () => {
      const patientId = await newPatient()
      const res = await startEpisode(physio1, patientId)
      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({
        patientId,
        status: 'active',
        startedBranch: { id: branch1 },
        dischargedAt: null,
      })
      const patient = await physio1.agent.get(`${API}/patients/${patientId}`)
      expect(patient.body).toMatchObject({ status: 'active', activeEpisodeId: res.body.id })
      const audit = await root.auditLog.findFirst({ where: { action: 'episode.started', targetId: res.body.id } })
      expect(audit).toMatchObject({ userId: physio1Id, branchId: branch1 })
    })

    it('refuses a second active episode (US-25.3)', async () => {
      const { patientId } = await patientWithEpisode()
      const again = await startEpisode(physio1, patientId)
      expect(again.status).toBe(409)
      expect(again.body.error.code).toBe('EPISODE_ALREADY_ACTIVE')
    })

    it('lets only one of two simultaneous requests win', async () => {
      const patientId = await newPatient()
      const results = await Promise.all([startEpisode(physio1, patientId), startEpisode(physio1, patientId)])
      expect(results.map((r) => r.status).sort()).toEqual([201, 409])
      expect(await root.episode.count({ where: { patientId, status: 'active' } })).toBe(1)
    })

    it('needs an owner to choose the branch, and refuses another clinic’s branch', async () => {
      const patientId = await newPatient()
      const missing = await startEpisode(ownerA, patientId)
      expect(missing.status).toBe(422)
      expect(missing.body.error.fields[0].field).toBe('branchId')
      const wrong = await startEpisode(ownerA, patientId, { branchId: randomUUID() })
      expect(wrong.status).toBe(422)
      const ok = await startEpisode(ownerA, patientId, { branchId: branch2 })
      expect(ok.status).toBe(201)
      expect(ok.body.startedBranch.id).toBe(branch2)
    })

    it('lists the episodes newest first, with earlier ones unchanged (US-25.2)', async () => {
      const { patientId, episodeId } = await patientWithEpisode()
      await post(physio1, `/episodes/${episodeId}/discharge`, { note: 'Recovered' })
      const second = await startEpisode(physio1, patientId)
      expect(second.status).toBe(201)
      const list = await physio1.agent.get(`${API}/patients/${patientId}/episodes`)
      expect(list.body.items.map((e: { id: string }) => e.id)).toEqual([second.body.id, episodeId])
      expect(list.body.items[1]).toMatchObject({ status: 'discharged', dischargeNote: 'Recovered' })
      expect(list.body.items[0]).toMatchObject({ status: 'active' })
    })

    it('starts an empty episode: no assessment and no plan (US-25.1)', async () => {
      const { patientId, episodeId } = await patientWithEpisode()
      const first = await post(physio1, `/episodes/${episodeId}/assessments`, assessment)
      expect(first.status).toBe(201)
      await post(physio1, `/episodes/${episodeId}/discharge`)
      const next = await startEpisode(physio1, patientId)
      const view = await physio1.agent.get(`${API}/episodes/${next.body.id}`)
      expect(view.body).toMatchObject({ assessment: null, plan: null, sessionCount: 0 })
    })

    it('needs the episode.manage permission', async () => {
      const patientId = await newPatient()
      expect((await startEpisode(front1, patientId)).status).toBe(403)
    })

    it('answers 404 for an unknown patient', async () => {
      expect((await startEpisode(physio1, randomUUID())).status).toBe(404)
    })
  })

  describe('assessment (CLN-002, US-12)', () => {
    it('stores version 1 with the author and time, then a new version per edit (US-12.1, US-12.2)', async () => {
      const { episodeId } = await patientWithEpisode()
      const v1 = await post(physio1, `/episodes/${episodeId}/assessments`, assessment)
      expect(v1.status).toBe(201)
      expect(v1.body).toMatchObject({
        version: 1,
        history: 'Left knee pain for 3 weeks',
        extraFields: { painScore: 6 },
        author: 'Staff cphysio1',
      })
      expect(v1.body.createdAt).toBeTruthy()

      const v2 = await post(physio1, `/episodes/${episodeId}/assessments`, { ...assessment, pain: 'Worse on stairs' })
      expect(v2.status).toBe(201)
      expect(v2.body.version).toBe(2)

      const all = await physio1.agent.get(`${API}/episodes/${episodeId}/assessments`)
      expect(all.body.items.map((a: { version: number }) => a.version)).toEqual([2, 1])
      expect(all.body.items[1].pain).toBeNull() // version 1 is unchanged
    })

    it('does not create a version when nothing changed, and refuses an empty save', async () => {
      const { episodeId } = await patientWithEpisode()
      await post(physio1, `/episodes/${episodeId}/assessments`, assessment)
      const same = await post(physio1, `/episodes/${episodeId}/assessments`, assessment)
      expect(same.status).toBe(200)
      expect(same.body.version).toBe(1)
      expect(await root.assessment.count({ where: { episodeId } })).toBe(1)

      const empty = await post(physio1, `/episodes/${episodeId}/assessments`, {})
      expect(empty.status).toBe(422)
    })

    it('lets a receptionist read but not edit (US-12.3)', async () => {
      const { episodeId } = await patientWithEpisode()
      await post(physio1, `/episodes/${episodeId}/assessments`, assessment)
      const read = await front1.agent.get(`${API}/episodes/${episodeId}/assessments`)
      expect(read.status).toBe(200)
      expect(read.body.items).toHaveLength(1)
      expect((await post(front1, `/episodes/${episodeId}/assessments`, assessment)).status).toBe(403)
    })

    it('hides the assessment without clinical.view (US-12.4)', async () => {
      const { episodeId } = await patientWithEpisode()
      await post(physio1, `/episodes/${episodeId}/assessments`, assessment)
      const role = await root.role.findFirstOrThrow({
        where: { key: 'receptionist', tenant: { name: { endsWith: ` ${run}` } } },
      })
      const permission = await root.permission.findFirstOrThrow({ where: { key: 'clinical.view' } })
      const link = { roleId: role.id, permissionId: permission.id }
      await root.rolePermission.delete({ where: { roleId_permissionId: link } })
      try {
        expect((await front1.agent.get(`${API}/episodes/${episodeId}/assessments`)).status).toBe(403)
        expect((await front1.agent.get(`${API}/episodes/${episodeId}`)).status).toBe(403)
      } finally {
        await root.rolePermission.create({ data: link })
      }
    })

    it('audits every view with the viewer (US-12.5)', async () => {
      const { episodeId } = await patientWithEpisode()
      await post(physio1, `/episodes/${episodeId}/assessments`, assessment)
      await front1.agent.get(`${API}/episodes/${episodeId}/assessments`)
      const views = await root.auditLog.findMany({ where: { action: 'assessment.viewed', targetId: episodeId } })
      expect(views).toHaveLength(1)
      expect(views[0]!.userId).not.toBe(physio1Id)
      const created = await root.auditLog.findFirst({ where: { action: 'assessment.created', targetId: episodeId } })
      expect(created?.details).toEqual({ version: 1 })
    })

    it('keeps two simultaneous saves from sharing a version', async () => {
      const { episodeId } = await patientWithEpisode()
      const saves = await Promise.all([
        post(physio1, `/episodes/${episodeId}/assessments`, { history: 'Version A' }),
        post(physio1, `/episodes/${episodeId}/assessments`, { history: 'Version B' }),
      ])
      const codes = saves.map((r) => r.status).sort()
      expect(codes[0]).toBe(201)
      expect([201, 409]).toContain(codes[1])
      const versions = (await root.assessment.findMany({ where: { episodeId } })).map((a) => a.version)
      expect(new Set(versions).size).toBe(versions.length)
    })

    it('refuses to rewrite or remove a saved version, even directly in the database', async () => {
      const { episodeId } = await patientWithEpisode()
      const saved = await post(physio1, `/episodes/${episodeId}/assessments`, assessment)
      await expect(
        root.assessment.update({ where: { id: saved.body.id }, data: { history: 'Changed' } }),
      ).rejects.toThrow()
      await expect(root.assessment.delete({ where: { id: saved.body.id } })).rejects.toThrow()
    })

    it('validates the pain score', async () => {
      const { episodeId } = await patientWithEpisode()
      const res = await post(physio1, `/episodes/${episodeId}/assessments`, { extraFields: { painScore: 11 } })
      expect(res.status).toBe(422)
    })
  })

  describe('treatment plan (CLN-003, US-13)', () => {
    it('stores version 1, then a new version per change with history kept (US-13.1, US-13.2)', async () => {
      const { episodeId } = await patientWithEpisode()
      const v1 = await post(physio1, `/episodes/${episodeId}/treatment-plans`, plan)
      expect(v1.status).toBe(201)
      expect(v1.body).toMatchObject({
        version: 1,
        goals: 'Pain free stairs',
        plannedSessions: 10,
        frequency: '3 times a week',
        estimatedCost: '5000.00',
      })
      const v2 = await post(physio1, `/episodes/${episodeId}/treatment-plans`, { ...plan, plannedSessions: 12 })
      expect(v2.body.version).toBe(2)
      const all = await physio1.agent.get(`${API}/episodes/${episodeId}/treatment-plans`)
      expect(all.body.items.map((p: { plannedSessions: number }) => p.plannedSessions)).toEqual([12, 10])
    })

    it('treats the estimated cost as information only: no charge, no balance change (US-13.3)', async () => {
      const { patientId, episodeId } = await patientWithEpisode()
      await post(physio1, `/episodes/${episodeId}/treatment-plans`, plan)
      const owner = await ownerA.agent.get(`${API}/patients/${patientId}`)
      expect(owner.body.balance).toEqual({ amount: '0.00', state: 'zero' })
    })

    it('keeps exercise instructions in the notes (US-13.4) and refuses bad values', async () => {
      const { episodeId } = await patientWithEpisode()
      const notes = await post(physio1, `/episodes/${episodeId}/treatment-plans`, {
        notes: 'Straight leg raises, 3 x 10',
      })
      expect(notes.status).toBe(201)
      expect(notes.body.notes).toBe('Straight leg raises, 3 x 10')
      for (const bad of [{ plannedSessions: 0 }, { estimatedCost: '-1' }, { estimatedCost: 'abc' }]) {
        expect((await post(physio1, `/episodes/${episodeId}/treatment-plans`, { goals: 'x', ...bad })).status).toBe(422)
      }
      expect((await post(physio1, `/episodes/${episodeId}/treatment-plans`, {})).status).toBe(422)
    })

    it('does not create a version when nothing changed', async () => {
      const { episodeId } = await patientWithEpisode()
      await post(physio1, `/episodes/${episodeId}/treatment-plans`, plan)
      const same = await post(physio1, `/episodes/${episodeId}/treatment-plans`, plan)
      expect(same.status).toBe(200)
      expect(await root.treatmentPlan.count({ where: { episodeId } })).toBe(1)
    })

    it('needs clinical.edit to write and clinical.view to read', async () => {
      const { episodeId } = await patientWithEpisode()
      expect((await post(front1, `/episodes/${episodeId}/treatment-plans`, plan)).status).toBe(403)
      await post(physio1, `/episodes/${episodeId}/treatment-plans`, plan)
      expect((await front1.agent.get(`${API}/episodes/${episodeId}/treatment-plans`)).status).toBe(200)
    })

    it('shows the latest assessment, plan and progress on the episode', async () => {
      const { episodeId } = await patientWithEpisode()
      await post(physio1, `/episodes/${episodeId}/assessments`, assessment)
      await post(physio1, `/episodes/${episodeId}/treatment-plans`, plan)
      const view = await physio1.agent.get(`${API}/episodes/${episodeId}`)
      expect(view.status).toBe(200)
      expect(view.body.assessment.version).toBe(1)
      expect(view.body.plan.version).toBe(1)
      expect(view.body.progress).toEqual({ sessionsDone: 0, plannedSessions: 10, exceeded: false })
      expect(await root.auditLog.count({ where: { action: 'episode.viewed', targetId: episodeId } })).toBe(1)
    })
  })

  describe('discharge (CLN-004, US-24)', () => {
    it('discharges with an optional note and makes the patient inactive (US-24.1)', async () => {
      const { patientId, episodeId } = await patientWithEpisode()
      const res = await post(physio1, `/episodes/${episodeId}/discharge`, { note: '  Goals met  ' })
      expect(res.status).toBe(200)
      expect(res.body.episode).toMatchObject({
        status: 'discharged',
        dischargeNote: 'Goals met',
        dischargedBy: 'Staff cphysio1',
      })
      expect(res.body.episode.dischargedAt).toBeTruthy()
      const patient = await physio1.agent.get(`${API}/patients/${patientId}`)
      expect(patient.body).toMatchObject({ status: 'inactive', activeEpisodeId: null })
      const inactive = await physio1.agent.get(
        `${API}/patients?status=inactive&q=${encodeURIComponent(patient.body.fullName)}`,
      )
      expect(inactive.body.items.map((p: { id: string }) => p.id)).toContain(patientId)
      const audit = await root.auditLog.findFirst({ where: { action: 'episode.discharged', targetId: episodeId } })
      expect(audit?.details).toEqual({ patientId, hasNote: true })
    })

    it('discharges without a note, and never blocks on money (US-24.2, BR-CLN-7)', async () => {
      const { episodeId } = await patientWithEpisode()
      const res = await post(physio1, `/episodes/${episodeId}/discharge`)
      expect(res.status).toBe(200)
      expect(res.body.episode.dischargeNote).toBeNull()
      // The physiotherapist holds no ledger.view, so the balance is withheld; the owner would see it.
      expect(res.body.balance).toBeNull()
    })

    it('returns the balance to someone who may see it, for the dues and credit prompts (US-24.2, US-24.3)', async () => {
      const patientId = await newPatient()
      const started = await startEpisode(ownerA, patientId, { branchId: branch1 })
      const res = await post(ownerA, `/episodes/${started.body.id}/discharge`)
      expect(res.body.balance).toEqual({ amount: '0.00', state: 'zero' })
    })

    it('discharges only once and then makes the episode read-only', async () => {
      const { episodeId } = await patientWithEpisode()
      await post(physio1, `/episodes/${episodeId}/assessments`, assessment)
      const results = await Promise.all([
        post(physio1, `/episodes/${episodeId}/discharge`),
        post(physio1, `/episodes/${episodeId}/discharge`),
      ])
      expect(results.map((r) => r.status).sort()).toEqual([200, 409])
      expect(await root.auditLog.count({ where: { action: 'episode.discharged', targetId: episodeId } })).toBe(1)

      const write = await post(physio1, `/episodes/${episodeId}/assessments`, { history: 'Late addition' })
      expect(write.status).toBe(409)
      expect(write.body.error.code).toBe('NO_ACTIVE_EPISODE')
      expect((await post(physio1, `/episodes/${episodeId}/treatment-plans`, plan)).status).toBe(409)
      // History stays readable.
      expect((await physio1.agent.get(`${API}/episodes/${episodeId}/assessments`)).body.items).toHaveLength(1)
    })

    it('needs the episode.manage permission (US-24.4)', async () => {
      const { episodeId } = await patientWithEpisode()
      expect((await post(front1, `/episodes/${episodeId}/discharge`)).status).toBe(403)
    })
  })

  describe('isolation and permissions (SEC-001, XC-01, XC-02)', () => {
    it('answers 404 for another clinic on every endpoint', async () => {
      const { patientId, episodeId } = await patientWithEpisode()
      const b = await post(ownerB, '/branches', { name: 'CB Second', code: 'CB2' })
      expect(b.status).toBe(201)
      const gets = [
        `/patients/${patientId}/episodes`,
        `/episodes/${episodeId}`,
        `/episodes/${episodeId}/assessments`,
        `/episodes/${episodeId}/treatment-plans`,
      ]
      for (const path of gets) expect((await ownerB.agent.get(`${API}${path}`)).status, path).toBe(404)
      const posts = [
        [`/patients/${patientId}/episodes`, { branchId: b.body.id }],
        [`/episodes/${episodeId}/assessments`, assessment],
        [`/episodes/${episodeId}/treatment-plans`, plan],
        [`/episodes/${episodeId}/discharge`, {}],
      ] as const
      for (const [path, body] of posts) expect((await post(ownerB, path, body)).status, path).toBe(404)
      // Untouched by the attempts.
      expect((await physio1.agent.get(`${API}/episodes/${episodeId}`)).body.episode.status).toBe('active')
    })

    it('needs a signed-in user', async () => {
      const { default: request } = await import('supertest')
      const res = await request(app).get(`${API}/episodes/${randomUUID()}`)
      expect(res.status).toBe(401)
    })

    it('rejects malformed ids', async () => {
      expect((await physio1.agent.get(`${API}/episodes/not-a-uuid`)).status).toBe(422)
    })
  })
})
